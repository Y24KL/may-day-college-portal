"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { run, type ActionState } from "@/lib/action";
import { authorizeAdmin } from "@/lib/auth/guards";
import { audit } from "@/lib/audit";
import { parseDateOnly, parseLagosInput } from "@/lib/utils";
import { validateBoundaries, DEFAULT_WAEC_STYLE } from "@/lib/grading";
import { validatePeriods } from "@/lib/timetable";
import { notify } from "@/lib/notifications";
import { kickEmailWorker } from "@/lib/email/worker";

const id = z.string().min(1);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date.");
const optDate = z.string().optional().transform((v) => (v ? parseDateOnly(v) : null));
const bool = (v: FormDataEntryValue | null) => v === "on" || v === "true";

/* ── Sessions & terms ───────────────────────────────────────────────── */

export async function saveSession(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("academics.configure");
    const d = z
      .object({ sessionId: z.string().optional(), name: z.string().trim().regex(/^\d{4}\/\d{4}$/, "Use the format 2026/2027."), startDate: date, endDate: date, registrationOpensAt: z.string().optional(), registrationClosesAt: z.string().optional(), createTerms: z.string().optional() })
      .parse(Object.fromEntries(fd));
    const [a, b] = d.name.split("/").map(Number);
    if (b !== a + 1) throw new Error("Session years must be consecutive (e.g. 2026/2027).");
    const start = parseDateOnly(d.startDate), end = parseDateOnly(d.endDate);
    if (end <= start) throw new Error("End date must be after start date.");
    const data = { name: d.name, startDate: start, endDate: end, registrationOpensAt: parseLagosInput(d.registrationOpensAt), registrationClosesAt: parseLagosInput(d.registrationClosesAt) };
    const s = d.sessionId ? await db.academicSession.update({ where: { id: d.sessionId }, data }) : await db.academicSession.create({ data });
    if (!d.sessionId && d.createTerms === "on") {
      // Three terms with evenly split default dates — admins adjust them afterwards.
      const span = (end.getTime() - start.getTime()) / 3;
      const names = ["First Term", "Second Term", "Third Term"];
      for (let i = 0; i < 3; i++) {
        await db.term.create({ data: { sessionId: s.id, name: names[i], order: i + 1, startDate: new Date(start.getTime() + span * i), endDate: new Date(start.getTime() + span * (i + 1) - 86400_000) } });
      }
    }
    await audit({ actorId: admin.id, action: d.sessionId ? "session.update" : "session.create", entityType: "AcademicSession", entityId: s.id });
    return { ok: true, message: `Session ${s.name} saved.` };
  });
}

export async function saveTerm(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("academics.configure");
    const d = z
      .object({ termId: z.string().optional(), sessionId: id, name: z.string().trim().min(2), order: z.coerce.number().int().min(1).max(6), startDate: date, endDate: date, examStartDate: optDate, examEndDate: optDate, resultPublicationDate: optDate, nextResumptionDate: optDate })
      .parse(Object.fromEntries(fd));
    const start = parseDateOnly(d.startDate), end = parseDateOnly(d.endDate);
    if (end <= start) throw new Error("Term end must be after its start.");
    const session = await db.academicSession.findUniqueOrThrow({ where: { id: d.sessionId } });
    if (start < session.startDate || end > session.endDate) throw new Error("Term dates must fall within the session dates.");
    const data = { name: d.name, order: d.order, startDate: start, endDate: end, examStartDate: d.examStartDate, examEndDate: d.examEndDate, resultPublicationDate: d.resultPublicationDate, nextResumptionDate: d.nextResumptionDate };
    const t = d.termId ? await db.term.update({ where: { id: d.termId }, data }) : await db.term.create({ data: { ...data, sessionId: d.sessionId } });
    await audit({ actorId: admin.id, action: d.termId ? "term.update" : "term.create", entityType: "Term", entityId: t.id });
    return { ok: true, message: "Term saved." };
  });
}

/** Make a term (and its session) the single current term school-wide. */
export async function setCurrentTerm(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("academics.configure");
    const termId = id.parse(fd.get("termId"));
    await db.$transaction(async (tx) => {
      const t = await tx.term.findUniqueOrThrow({ where: { id: termId } });
      await tx.term.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
      await tx.academicSession.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
      await tx.term.update({ where: { id: t.id }, data: { isCurrent: true } });
      await tx.academicSession.update({ where: { id: t.sessionId }, data: { isCurrent: true, status: "ACTIVE" } });
      await audit({ actorId: admin.id, action: "term.set_current", entityType: "Term", entityId: t.id, sensitive: true }, tx);
    });
    return { ok: true, message: "Current term updated across all portals." };
  });
}

export async function archiveSession(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("academics.configure");
    const sessionId = id.parse(fd.get("sessionId"));
    const s = await db.academicSession.findUniqueOrThrow({ where: { id: sessionId } });
    if (s.isCurrent) throw new Error("The current session cannot be archived. Set another term as current first.");
    await db.academicSession.update({ where: { id: sessionId }, data: { status: "ARCHIVED" } });
    await audit({ actorId: admin.id, action: "session.archive", entityType: "AcademicSession", entityId: sessionId });
    return { ok: true, message: "Session archived. All its records remain available." };
  });
}

/* ── Classes, sectors, levels, classrooms ───────────────────────────── */

export async function saveLevel(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("academics.configure");
    const d = z.object({ levelId: z.string().optional(), name: z.string().trim().min(2).max(20), order: z.coerce.number().int().min(1).max(20) }).parse(Object.fromEntries(fd));
    const l = d.levelId ? await db.classLevel.update({ where: { id: d.levelId }, data: { name: d.name, order: d.order } }) : await db.classLevel.create({ data: { name: d.name, order: d.order } });
    await audit({ actorId: admin.id, action: "level.save", entityType: "ClassLevel", entityId: l.id });
    return { ok: true, message: "Class level saved." };
  });
}

export async function saveSector(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("academics.configure");
    const d = z.object({ sectorId: z.string().optional(), name: z.string().trim().min(2).max(40), code: z.string().trim().toUpperCase().min(2).max(6) }).parse(Object.fromEntries(fd));
    const s = d.sectorId ? await db.academicSector.update({ where: { id: d.sectorId }, data: { name: d.name, code: d.code } }) : await db.academicSector.create({ data: { name: d.name, code: d.code } });
    await audit({ actorId: admin.id, action: "sector.save", entityType: "AcademicSector", entityId: s.id });
    return { ok: true, message: "Academic sector saved." };
  });
}

export async function saveClass(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("academics.configure");
    const d = z.object({ classId: z.string().optional(), levelId: id, sectorId: id, arm: z.string().trim().max(10).optional().default(""), name: z.string().trim().max(60).optional() }).parse(Object.fromEntries(fd));
    const [level, sector] = await Promise.all([db.classLevel.findUniqueOrThrow({ where: { id: d.levelId } }), db.academicSector.findUniqueOrThrow({ where: { id: d.sectorId } })]);
    const name = d.name || `${level.name} ${sector.name}${d.arm ? ` ${d.arm}` : ""}`;
    const data = { levelId: level.id, sectorId: sector.id, arm: d.arm, name, isActive: fd.has("isActive") ? fd.getAll("isActive").includes("on") : true };
    const c = d.classId ? await db.class.update({ where: { id: d.classId }, data }) : await db.class.create({ data });
    await audit({ actorId: admin.id, action: "class.save", entityType: "Class", entityId: c.id });
    return { ok: true, message: `${c.name} saved.` };
  });
}

/** Optional helper: create the commonly used SSS1–3 × Science/Commercial/Arts structure. */
export async function loadSuggestedStructure(_: ActionState): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("academics.configure");
    const levels = ["SSS1", "SSS2", "SSS3"], sectors = [["Science", "SCI"], ["Commercial", "COM"], ["Arts", "ART"]];
    let created = 0;
    for (const [i, name] of levels.entries()) await db.classLevel.upsert({ where: { name }, create: { name, order: i + 1 }, update: {} });
    for (const [name, code] of sectors) await db.academicSector.upsert({ where: { name }, create: { name, code }, update: {} });
    for (const l of await db.classLevel.findMany({ where: { name: { in: levels } } }))
      for (const s of await db.academicSector.findMany({ where: { name: { in: sectors.map((x) => x[0]) } } })) {
        const name = `${l.name} ${s.name}`;
        const r = await db.class.createMany({ data: [{ levelId: l.id, sectorId: s.id, arm: "", name }], skipDuplicates: true });
        created += r.count;
      }
    await audit({ actorId: admin.id, action: "class.load_suggested", entityType: "Class", details: { created } });
    return { ok: true, message: `${created} class group(s) created. Edit or deactivate any the school does not use.` };
  });
}

export async function saveClassroom(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("timetable.manage");
    const d = z.object({ classroomId: z.string().optional(), name: z.string().trim().min(1).max(60), capacity: z.coerce.number().int().min(0).max(1000).optional() }).parse(Object.fromEntries(fd));
    const r = d.classroomId ? await db.classroom.update({ where: { id: d.classroomId }, data: { name: d.name, capacity: d.capacity || null } }) : await db.classroom.create({ data: { name: d.name, capacity: d.capacity || null } });
    await audit({ actorId: admin.id, action: "classroom.save", entityType: "Classroom", entityId: r.id });
    return { ok: true, message: "Classroom saved." };
  });
}

/* ── Subjects & offerings ───────────────────────────────────────────── */

export async function saveSubject(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("academics.configure");
    const d = z.object({ subjectId: z.string().optional(), name: z.string().trim().min(2).max(80), code: z.string().trim().toUpperCase().min(2).max(10), description: z.string().trim().max(500).optional() }).parse(Object.fromEntries(fd));
    const s = d.subjectId ? await db.subject.update({ where: { id: d.subjectId }, data: { name: d.name, code: d.code, description: d.description || null } }) : await db.subject.create({ data: { name: d.name, code: d.code, description: d.description || null } });
    await audit({ actorId: admin.id, action: "subject.save", entityType: "Subject", entityId: s.id });
    return { ok: true, message: `${s.name} saved.` };
  });
}

export async function toggleSubjectArchive(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("academics.configure");
    const subjectId = id.parse(fd.get("subjectId"));
    const s = await db.subject.findUniqueOrThrow({ where: { id: subjectId } });
    await db.subject.update({ where: { id: s.id }, data: { isArchived: !s.isArchived } });
    await audit({ actorId: admin.id, action: s.isArchived ? "subject.restore" : "subject.archive", entityType: "Subject", entityId: s.id });
    return { ok: true, message: s.isArchived ? "Subject restored." : "Subject archived. Historical results are kept." };
  });
}

/** Offer a subject to several classes in a session in one step. */
export async function saveOfferings(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("academics.configure");
    const d = z.object({ subjectId: id, sessionId: id, type: z.enum(["COMPULSORY", "ELECTIVE"]) }).parse(Object.fromEntries(fd));
    const classIds = fd.getAll("classIds").map(String).filter(Boolean);
    if (!classIds.length) throw new Error("Select at least one class.");
    const subj = await db.subject.findUniqueOrThrow({ where: { id: d.subjectId } });
    if (subj.isArchived) throw new Error("Archived subjects cannot be offered.");
    for (const classId of classIds) {
      await db.subjectOffering.upsert({
        where: { subjectId_classId_sessionId: { subjectId: d.subjectId, classId, sessionId: d.sessionId } },
        create: { subjectId: d.subjectId, classId, sessionId: d.sessionId, isCompulsory: d.type === "COMPULSORY" },
        update: { isCompulsory: d.type === "COMPULSORY", isActive: true },
      });
    }
    await audit({ actorId: admin.id, action: "offering.save", entityType: "Subject", entityId: d.subjectId, details: { classIds, sessionId: d.sessionId, type: d.type } });
    return { ok: true, message: `${subj.name} offered to ${classIds.length} class(es).` };
  });
}

export async function updateOffering(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("academics.configure");
    const d = z.object({ offeringId: id, op: z.enum(["TOGGLE_TYPE", "TOGGLE_ACTIVE"]) }).parse(Object.fromEntries(fd));
    const o = await db.subjectOffering.findUniqueOrThrow({ where: { id: d.offeringId } });
    if (d.op === "TOGGLE_ACTIVE" && o.isActive) {
      const regs = await db.subjectRegistrationItem.count({ where: { offeringId: o.id } });
      if (regs) throw new Error(`${regs} student(s) have registered this subject. It cannot be withdrawn; reject the affected registrations first.`);
    }
    await db.subjectOffering.update({ where: { id: o.id }, data: d.op === "TOGGLE_TYPE" ? { isCompulsory: !o.isCompulsory } : { isActive: !o.isActive } });
    await audit({ actorId: admin.id, action: `offering.${d.op.toLowerCase()}`, entityType: "SubjectOffering", entityId: o.id });
    return { ok: true, message: "Offering updated." };
  });
}

/** Copy all offerings (and optionally teacher assignments) from one session to another. */
export async function copyOfferings(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("academics.configure");
    const d = z.object({ fromSessionId: id, toSessionId: id }).parse(Object.fromEntries(fd));
    if (d.fromSessionId === d.toSessionId) throw new Error("Choose two different sessions.");
    const src = await db.subjectOffering.findMany({ where: { sessionId: d.fromSessionId, isActive: true, subject: { isArchived: false } } });
    const r = await db.subjectOffering.createMany({ data: src.map((o) => ({ subjectId: o.subjectId, classId: o.classId, sessionId: d.toSessionId, isCompulsory: o.isCompulsory })), skipDuplicates: true });
    await audit({ actorId: admin.id, action: "offering.copy", entityType: "AcademicSession", entityId: d.toSessionId, details: { from: d.fromSessionId, created: r.count } });
    return { ok: true, message: `${r.count} offering(s) copied.` };
  });
}

/* ── Subject registration windows ───────────────────────────────────── */

export async function saveRegistrationConfig(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("registration.manage");
    const d = z
      .object({ sessionId: id, minElectives: z.coerce.number().int().min(0).max(20), maxElectives: z.coerce.number().int().min(0).max(20), opensAt: z.string().optional(), closesAt: z.string().optional() })
      .parse(Object.fromEntries(fd));
    const classIds = fd.getAll("classIds").map(String).filter(Boolean);
    if (!classIds.length) throw new Error("Select at least one class.");
    if (d.minElectives > d.maxElectives) throw new Error("Minimum electives cannot exceed the maximum.");
    const opensAt = parseLagosInput(d.opensAt), closesAt = parseLagosInput(d.closesAt);
    if (opensAt && closesAt && closesAt <= opensAt) throw new Error("The closing time must be after the opening time.");
    const data = { minElectives: d.minElectives, maxElectives: d.maxElectives, opensAt, closesAt, isOpen: bool(fd.get("isOpen")), requiresApproval: bool(fd.get("requiresApproval")) };
    for (const classId of classIds) await db.subjectRegistrationConfig.upsert({ where: { sessionId_classId: { sessionId: d.sessionId, classId } }, create: { sessionId: d.sessionId, classId, ...data }, update: data });
    await audit({ actorId: admin.id, action: "registration.config", entityType: "AcademicSession", entityId: d.sessionId, details: { classIds, ...data, opensAt: opensAt?.toISOString() ?? null, closesAt: closesAt?.toISOString() ?? null } });
    return { ok: true, message: "Registration settings saved." };
  });
}

export async function reviewSubjectRegistration(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("registration.manage");
    const d = z.object({ registrationId: id, decision: z.enum(["APPROVE", "REJECT"]), note: z.string().trim().max(500).optional() }).parse(Object.fromEntries(fd));
    if (d.decision === "REJECT" && !d.note) throw new Error("Give a reason so the student can correct their registration.");
    await db.$transaction(async (tx) => {
      const r = await tx.subjectRegistration.findUniqueOrThrow({ where: { id: d.registrationId }, include: { student: true } });
      if (d.decision === "REJECT") {
        const scored = await tx.resultDetail.count({ where: { studentId: r.studentId, submission: { offering: { registrationItems: { some: { registrationId: r.id } } } } } });
        if (scored) throw new Error("Scores have already been recorded against this registration; it cannot be rejected.");
        await tx.subjectRegistrationItem.deleteMany({ where: { registrationId: r.id } });
        await tx.subjectRegistration.delete({ where: { id: r.id } });
      } else {
        await tx.subjectRegistration.update({ where: { id: r.id }, data: { status: "APPROVED", reviewedById: admin.id, reviewedAt: new Date(), reviewNote: d.note || null } });
      }
      await audit({ actorId: admin.id, action: `subject_registration.${d.decision.toLowerCase()}`, entityType: "SubjectRegistration", entityId: r.id, details: { note: d.note ?? null } }, tx);
      await notify({ userIds: [r.student.userId], category: "REGISTRATION", title: d.decision === "APPROVE" ? "Subject registration approved" : "Subject registration returned", body: d.decision === "APPROVE" ? `Your subject registration ${r.reference} has been approved.` : `Your subject registration was returned: ${d.note}. Please register again.`, link: "/student/registration", email: { template: "subject-registration" } }, tx);
    });
    await kickEmailWorker();
    return { ok: true, message: d.decision === "APPROVE" ? "Registration approved." : "Registration returned to the student." };
  });
}

/* ── Grading ────────────────────────────────────────────────────────── */

export async function saveGradingSystem(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("grading.configure");
    const d = z.object({ gradingSystemId: z.string().optional(), name: z.string().trim().min(2).max(60), description: z.string().trim().max(300).optional(), boundaries: z.string() }).parse(Object.fromEntries(fd));
    const rows = d.boundaries
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [grade, min, max, description, remark] = l.split(",").map((x) => x.trim());
        return { grade, minScore: Number(min), maxScore: Number(max), description: description || grade, remark: remark || null };
      });
    if (rows.some((r) => !r.grade || Number.isNaN(r.minScore) || Number.isNaN(r.maxScore))) throw new Error("Each line must be: Grade, Min, Max, Description, Remark");
    const errs = validateBoundaries(rows);
    if (errs.length) throw new Error(errs.join(" "));
    if (d.gradingSystemId) {
      const inUse = await db.scoreSubmission.count({ where: { status: { in: ["APPROVED", "PUBLISHED"] }, offering: { session: { scoreConfiguration: { gradingSystemId: d.gradingSystemId } } } } });
      if (inUse) throw new Error("This grading system has approved/published results. Create a new grading system instead so historical grades stay accurate.");
    }
    const gs = await db.$transaction(async (tx) => {
      const g = d.gradingSystemId
        ? await tx.gradingSystem.update({ where: { id: d.gradingSystemId }, data: { name: d.name, description: d.description || null } })
        : await tx.gradingSystem.create({ data: { name: d.name, description: d.description || null, isDefault: (await tx.gradingSystem.count()) === 0 } });
      await tx.gradeBoundary.deleteMany({ where: { gradingSystemId: g.id } });
      await tx.gradeBoundary.createMany({ data: rows.map((r) => ({ ...r, gradingSystemId: g.id, minScore: new Prisma.Decimal(r.minScore), maxScore: new Prisma.Decimal(r.maxScore) })) });
      return g;
    });
    await audit({ actorId: admin.id, action: "grading.save", entityType: "GradingSystem", entityId: gs.id, sensitive: true, details: { rows } });
    return { ok: true, message: "Grading system saved." };
  });
}

export async function loadStarterGrading(_: ActionState): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("grading.configure");
    const name = "WAEC-style (starter)";
    if (await db.gradingSystem.findUnique({ where: { name } })) throw new Error("The starter grading system already exists.");
    const g = await db.gradingSystem.create({
      data: { name, description: "Editable starter based on the A1–F9 scale.", isDefault: (await db.gradingSystem.count()) === 0, boundaries: { create: DEFAULT_WAEC_STYLE.map((b) => ({ ...b, minScore: new Prisma.Decimal(b.minScore), maxScore: new Prisma.Decimal(b.maxScore) })) } },
    });
    await audit({ actorId: admin.id, action: "grading.load_starter", entityType: "GradingSystem", entityId: g.id });
    return { ok: true, message: "Starter grading system created. Review and adjust it to the school's policy." };
  });
}

export async function saveScoreConfig(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("grading.configure");
    const d = z.object({ sessionId: id, gradingSystemId: id, caMax: z.coerce.number().int().min(0).max(100), examMax: z.coerce.number().int().min(0).max(100) }).parse(Object.fromEntries(fd));
    if (d.caMax + d.examMax !== 100) throw new Error("CA and examination maximums must add up to 100.");
    const existing = await db.scoreConfiguration.findUnique({ where: { sessionId: d.sessionId } });
    if (existing && (existing.caMax !== d.caMax || existing.examMax !== d.examMax)) {
      const used = await db.scoreSubmission.count({ where: { offering: { sessionId: d.sessionId }, details: { some: {} } } });
      if (used) throw new Error("Scores have already been entered for this session. Score allocation can no longer change; existing sheets keep their snapshot.");
    }
    await db.scoreConfiguration.upsert({ where: { sessionId: d.sessionId }, create: d, update: d });
    await audit({ actorId: admin.id, action: "score_config.save", entityType: "AcademicSession", entityId: d.sessionId, sensitive: true, details: d });
    return { ok: true, message: "Score allocation saved." };
  });
}

/* ── Bell schedule ──────────────────────────────────────────────────── */

export async function savePeriods(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("timetable.manage");
    const lines = z.string().parse(fd.get("periods")).split("\n").map((l) => l.trim()).filter(Boolean);
    const rows = lines.map((l, i) => {
      const [name, startTime, endTime, kind] = l.split(",").map((x) => x.trim());
      return { name, startTime, endTime, isBreak: /break/i.test(kind ?? "") || /break|lunch/i.test(name ?? ""), order: i + 1 };
    });
    if (!rows.length || rows.some((r) => !r.name || !r.startTime || !r.endTime)) throw new Error("Each line must be: Name, Start (HH:MM), End (HH:MM), [break]");
    const errs = validatePeriods(rows);
    if (errs.length) throw new Error(errs.join(" "));
    const used = await db.timetablePeriod.count();
    await db.$transaction(async (tx) => {
      const existing = await tx.periodDefinition.findMany({ orderBy: { order: "asc" } });
      // Shift orders out of the way to avoid unique clashes, then update in place.
      for (const e of existing) await tx.periodDefinition.update({ where: { id: e.id }, data: { order: e.order + 1000 } });
      for (const [i, r] of rows.entries()) {
        if (existing[i]) await tx.periodDefinition.update({ where: { id: existing[i].id }, data: r });
        else await tx.periodDefinition.create({ data: r });
      }
      for (const e of existing.slice(rows.length)) {
        const inUse = await tx.timetablePeriod.count({ where: { periodId: e.id } });
        if (inUse) throw new Error(`Period "${e.name}" is used in timetables and cannot be removed.`);
        await tx.periodDefinition.delete({ where: { id: e.id } });
      }
    });
    await audit({ actorId: admin.id, action: "periods.save", entityType: "PeriodDefinition", details: { rows, timetableEntries: used } });
    return { ok: true, message: "Bell schedule saved." };
  });
}
