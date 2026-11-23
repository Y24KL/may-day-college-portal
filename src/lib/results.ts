import { Prisma } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { checkScores, gradeFor, rankByAverage, type Boundary } from "@/lib/grading";
import { notify, verifiedParentUserIds, adminsWithPermission } from "@/lib/notifications";
import { round2 } from "@/lib/utils";

export class ResultsError extends Error {}

export async function boundariesForSession(sessionId: string, tx: Tx = db) {
  const cfg = await tx.scoreConfiguration.findUnique({ where: { sessionId }, include: { gradingSystem: { include: { boundaries: true } } } });
  if (!cfg) return null;
  const boundaries: Boundary[] = cfg.gradingSystem.boundaries.map((b) => ({
    grade: b.grade,
    minScore: Number(b.minScore),
    maxScore: Number(b.maxScore),
    description: b.description,
    remark: b.remark,
  }));
  return { caMax: cfg.caMax, examMax: cfg.examMax, boundaries, gradingSystem: cfg.gradingSystem };
}

/** Get (or create) the score sheet for an offering+term, snapshotting the score allocation. */
export async function getOrCreateSubmission(offeringId: string, termId: string) {
  const existing = await db.scoreSubmission.findUnique({ where: { offeringId_termId: { offeringId, termId } } });
  if (existing) return existing;
  const offering = await db.subjectOffering.findUniqueOrThrow({ where: { id: offeringId } });
  const term = await db.term.findUniqueOrThrow({ where: { id: termId } });
  if (term.sessionId !== offering.sessionId) throw new ResultsError("Term does not belong to the offering's session.");
  const cfg = await boundariesForSession(offering.sessionId);
  if (!cfg) throw new ResultsError("Score allocation has not been configured for this session. Ask an administrator to configure grading.");
  return db.scoreSubmission.upsert({
    where: { offeringId_termId: { offeringId, termId } },
    create: { offeringId, termId, caMax: cfg.caMax, examMax: cfg.examMax },
    update: {},
  });
}

export type ScoreInput = { studentId: string; ca: number | null; exam: number | null; remark?: string | null };

/** Teacher saves scores (draft). Validates against configured limits. */
export async function saveScores(args: { submissionId: string; teacherUserId: string; rows: ScoreInput[]; allowedStudentIds: Set<string> }) {
  return db.$transaction(async (tx) => {
    const sub = await tx.scoreSubmission.findUniqueOrThrow({ where: { id: args.submissionId }, include: { offering: true } });
    if (!["DRAFT", "RETURNED"].includes(sub.status)) throw new ResultsError("These scores have been submitted and can no longer be edited.");
    const cfg = await boundariesForSession(sub.offering.sessionId, tx);
    if (!cfg) throw new ResultsError("Grading is not configured for this session.");
    const errors: string[] = [];
    for (const r of args.rows) {
      if (!args.allowedStudentIds.has(r.studentId)) {
        errors.push("A student in the sheet is not registered for this subject.");
        continue;
      }
      const chk = checkScores(r.ca, r.exam, sub.caMax, sub.examMax);
      if (!chk.ok) {
        errors.push(chk.error);
        continue;
      }
      const g = chk.total === null ? null : gradeFor(chk.total, cfg.boundaries);
      const data = {
        caScore: r.ca === null ? null : new Prisma.Decimal(r.ca),
        examScore: r.exam === null ? null : new Prisma.Decimal(r.exam),
        total: chk.total === null ? null : new Prisma.Decimal(chk.total),
        grade: g?.grade ?? null,
        gradeDescription: g?.description ?? null,
        teacherRemark: r.remark?.trim() ? r.remark.trim().slice(0, 300) : null,
      };
      await tx.resultDetail.upsert({
        where: { submissionId_studentId: { submissionId: sub.id, studentId: r.studentId } },
        create: { submissionId: sub.id, studentId: r.studentId, termId: sub.termId, ...data },
        update: data,
      });
    }
    if (errors.length) throw new ResultsError([...new Set(errors)].join(" "));
    return sub;
  });
}

export async function submitScores(submissionId: string, actorUserId: string, expectedStudentIds: string[]) {
  return db.$transaction(async (tx) => {
    const sub = await tx.scoreSubmission.findUniqueOrThrow({ where: { id: submissionId }, include: { details: true, offering: { include: { subject: true, class: true } } } });
    if (!["DRAFT", "RETURNED"].includes(sub.status)) throw new ResultsError("Already submitted.");
    const complete = new Set(sub.details.filter((d) => d.caScore !== null && d.examScore !== null).map((d) => d.studentId));
    const missing = expectedStudentIds.filter((id) => !complete.has(id));
    if (missing.length) throw new ResultsError(`${missing.length} student(s) still have missing CA or exam scores.`);
    const ok = await tx.scoreSubmission.updateMany({ where: { id: sub.id, status: { in: ["DRAFT", "RETURNED"] } }, data: { status: "SUBMITTED", submittedById: actorUserId, submittedAt: new Date(), returnReason: null } });
    if (!ok.count) throw new ResultsError("Already submitted.");
    await tx.resultApproval.create({ data: { submissionId: sub.id, action: "SUBMITTED", actorId: actorUserId } });
    await notify(
      { userIds: await adminsWithPermission("results.review", tx), category: "RESULTS", title: "Scores submitted for review", body: `${sub.offering.subject.name} — ${sub.offering.class.name} scores are awaiting review.`, link: `/admin/results/${sub.id}` },
      tx,
    );
  });
}

export async function reviewSubmission(submissionId: string, actorId: string, decision: "APPROVE" | "RETURN", comment?: string) {
  return db.$transaction(async (tx) => {
    const sub = await tx.scoreSubmission.findUniqueOrThrow({ where: { id: submissionId }, include: { offering: { include: { subject: true, class: true, teacherAssignments: { include: { teacher: true } } } } } });
    if (sub.status !== "SUBMITTED") throw new ResultsError("Only submitted score sheets can be reviewed.");
    if (decision === "RETURN" && (!comment || comment.trim().length < 5)) throw new ResultsError("Explain what needs to be corrected.");
    await tx.scoreSubmission.update({
      where: { id: sub.id },
      data: decision === "APPROVE" ? { status: "APPROVED", reviewedById: actorId, reviewedAt: new Date() } : { status: "RETURNED", reviewedById: actorId, reviewedAt: new Date(), returnReason: comment!.trim() },
    });
    await tx.resultApproval.create({ data: { submissionId: sub.id, action: decision === "APPROVE" ? "APPROVED" : "RETURNED", actorId, comment: comment?.trim() || null } });
    await audit({ actorId, action: decision === "APPROVE" ? "results.approve" : "results.return", entityType: "ScoreSubmission", entityId: sub.id, sensitive: true, details: { comment: comment ?? null } }, tx);
    const teacherUserIds = sub.offering.teacherAssignments.filter((a) => a.isActive).map((a) => a.teacher.userId);
    await notify(
      {
        userIds: teacherUserIds,
        category: "RESULTS",
        title: decision === "APPROVE" ? "Scores approved" : "Scores returned for correction",
        body: `${sub.offering.subject.name} — ${sub.offering.class.name}: ${decision === "APPROVE" ? "approved by the academic office." : `returned. ${comment}`}`,
        link: `/teacher/scores?offering=${sub.offeringId}&term=${sub.termId}`,
        email: { template: "results-review", priority: "NORMAL" },
      },
      tx,
    );
  });
}

/**
 * Publish approved results for a class in a term. Computes each student's
 * summary (average, position), locks the score sheets and notifies students
 * and verified parents. Returns ids of Result rows needing report cards.
 */
export async function publishResults(args: { termId: string; classId: string; actorId: string }) {
  const out = await db.$transaction(
    async (tx) => {
      const term = await tx.term.findUniqueOrThrow({ where: { id: args.termId }, include: { session: true } });
      const approved = await tx.scoreSubmission.findMany({ where: { termId: term.id, status: "APPROVED", offering: { classId: args.classId } } });
      const already = await tx.scoreSubmission.count({ where: { termId: term.id, status: "PUBLISHED", offering: { classId: args.classId } } });
      if (!approved.length && !already) throw new ResultsError("There are no approved score sheets to publish for this class and term.");
      const now = new Date();
      if (approved.length) {
        await tx.scoreSubmission.updateMany({ where: { id: { in: approved.map((s) => s.id) } }, data: { status: "PUBLISHED", publishedAt: now } });
        for (const s of approved) await tx.resultApproval.create({ data: { submissionId: s.id, action: "PUBLISHED", actorId: args.actorId } });
      }
      const resultIds = await recomputeClassResults(tx, term.id, term.sessionId, args.classId, args.actorId);
      await audit({ actorId: args.actorId, action: "results.publish", entityType: "Class", entityId: args.classId, sensitive: true, details: { termId: term.id, sheets: approved.length } }, tx);

      const results = await tx.result.findMany({ where: { id: { in: resultIds } }, include: { student: true } });
      for (const r of results) {
        const recipients = [r.student.userId, ...(await verifiedParentUserIds(r.studentId, tx))];
        await notify(
          {
            userIds: recipients,
            category: "RESULTS",
            title: `${term.session.name} ${term.name} results published`,
            body: `Results for ${r.student.fullName} are now available in the portal.`,
            link: `/student/results?term=${term.id}`,
            email: { template: "results-published", priority: "NORMAL" },
          },
          tx,
        );
      }
      return resultIds;
    },
    { timeout: 60_000 },
  );
  return out;
}

/** Recompute Result summaries from PUBLISHED details for a class/term. */
export async function recomputeClassResults(tx: Tx, termId: string, sessionId: string, classId: string, actorId: string) {
  const enrollments = await tx.studentEnrollment.findMany({ where: { classId, sessionId } });
  const rows: { enrollmentId: string; studentId: string; sum: number; n: number }[] = [];
  for (const e of enrollments) {
    const details = await tx.resultDetail.findMany({
      where: { studentId: e.studentId, termId, total: { not: null }, submission: { status: "PUBLISHED", offering: { classId } } },
      select: { total: true },
    });
    if (!details.length) continue;
    rows.push({ enrollmentId: e.id, studentId: e.studentId, sum: details.reduce((s, d) => s + Number(d.total), 0), n: details.length });
  }
  const ranking = rankByAverage(rows.map((r) => ({ id: r.studentId, average: round2(r.sum / r.n) })));
  const ids: string[] = [];
  for (const r of rows) {
    const average = round2(r.sum / r.n);
    const res = await tx.result.upsert({
      where: { studentId_termId: { studentId: r.studentId, termId } },
      create: { studentId: r.studentId, termId, enrollmentId: r.enrollmentId, classId, subjectCount: r.n, totalMarks: round2(r.sum), average, position: ranking.get(r.studentId), classSize: rows.length, status: "PUBLISHED", publishedAt: new Date(), publishedById: actorId },
      update: { subjectCount: r.n, totalMarks: round2(r.sum), average, position: ranking.get(r.studentId), classSize: rows.length, status: "PUBLISHED", publishedAt: new Date(), publishedById: actorId },
    });
    ids.push(res.id);
  }
  return ids;
}

/** Authorised amendment of a published score with full audit history. */
export async function amendPublishedScore(args: { resultDetailId: string; ca: number; exam: number; reason: string; actorId: string }) {
  if (args.reason.trim().length < 10) throw new ResultsError("Give a detailed reason for the amendment (min 10 characters).");
  return db.$transaction(async (tx) => {
    const d = await tx.resultDetail.findUniqueOrThrow({ where: { id: args.resultDetailId }, include: { submission: { include: { offering: true } } } });
    if (d.submission.status !== "PUBLISHED") throw new ResultsError("Only published results are amended through this procedure.");
    const cfg = await boundariesForSession(d.submission.offering.sessionId, tx);
    if (!cfg) throw new ResultsError("Grading not configured.");
    const chk = checkScores(args.ca, args.exam, d.submission.caMax, d.submission.examMax);
    if (!chk.ok) throw new ResultsError(chk.error);
    const g = gradeFor(chk.total!, cfg.boundaries);
    await tx.resultAmendment.create({
      data: {
        resultDetailId: d.id,
        oldCaScore: d.caScore,
        oldExamScore: d.examScore,
        newCaScore: new Prisma.Decimal(args.ca),
        newExamScore: new Prisma.Decimal(args.exam),
        oldGrade: d.grade,
        newGrade: g?.grade ?? null,
        reason: args.reason.trim(),
        amendedById: args.actorId,
      },
    });
    await tx.resultDetail.update({
      where: { id: d.id },
      data: { caScore: new Prisma.Decimal(args.ca), examScore: new Prisma.Decimal(args.exam), total: new Prisma.Decimal(chk.total!), grade: g?.grade ?? null, gradeDescription: g?.description ?? null },
    });
    await tx.resultApproval.create({ data: { submissionId: d.submissionId, action: "AMENDED", actorId: args.actorId, comment: args.reason.trim() } });
    await audit({ actorId: args.actorId, action: "results.amend", entityType: "ResultDetail", entityId: d.id, sensitive: true, details: { oldCa: d.caScore?.toString() ?? null, oldExam: d.examScore?.toString() ?? null, newCa: args.ca, newExam: args.exam, reason: args.reason } }, tx);
    const ids = await recomputeClassResults(tx, d.termId, d.submission.offering.sessionId, d.submission.offering.classId, args.actorId);
    return { studentId: d.studentId, termId: d.termId, resultIds: ids };
  });
}
