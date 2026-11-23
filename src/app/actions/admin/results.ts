"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { run, type ActionState } from "@/lib/action";
import { authorizeAdmin } from "@/lib/auth/guards";
import { audit } from "@/lib/audit";
import { reviewSubmission, publishResults, amendPublishedScore } from "@/lib/results";
import { generateReportCards } from "@/lib/pdf/reportcard";
import { kickEmailWorker } from "@/lib/email/worker";

const id = z.string().min(1);

export async function reviewScores(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("results.review");
    const d = z.object({ submissionId: id, decision: z.enum(["APPROVE", "RETURN"]), comment: z.string().optional() }).parse(Object.fromEntries(fd));
    await reviewSubmission(d.submissionId, admin.id, d.decision, d.comment);
    await kickEmailWorker();
    return { ok: true, message: d.decision === "APPROVE" ? "Scores approved." : "Returned to the teacher for correction." };
  });
}

export async function publishClassResults(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("results.publish");
    const d = z.object({ termId: id, classId: id }).parse(Object.fromEntries(fd));
    const resultIds = await publishResults({ termId: d.termId, classId: d.classId, actorId: admin.id });
    const generated = await generateReportCards(resultIds);
    await kickEmailWorker();
    return { ok: true, message: `Results published for ${resultIds.length} student(s); ${generated} report card(s) generated.` };
  });
}

export async function amendScore(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("results.amend");
    const d = z.object({ resultDetailId: id, ca: z.coerce.number(), exam: z.coerce.number(), reason: z.string() }).parse(Object.fromEntries(fd));
    const r = await amendPublishedScore({ resultDetailId: d.resultDetailId, ca: d.ca, exam: d.exam, reason: d.reason, actorId: admin.id });
    const gen = await generateReportCards(r.resultIds.length ? (await db.result.findMany({ where: { id: { in: r.resultIds }, studentId: r.studentId } })).map((x) => x.id) : []);
    return { ok: true, message: `Amendment recorded and class results recalculated. ${gen} report card(s) regenerated (previous versions kept).` };
  });
}

export async function saveResultRemarks(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("results.publish");
    const d = z.object({ resultId: id, principalRemark: z.string().trim().max(400).optional(), classTeacherRemark: z.string().trim().max(400).optional(), regenerate: z.string().optional() }).parse(Object.fromEntries(fd));
    const r = await db.result.update({ where: { id: d.resultId }, data: { principalRemark: d.principalRemark || null, classTeacherRemark: d.classTeacherRemark || null } });
    await audit({ actorId: admin.id, action: "results.remarks", entityType: "Result", entityId: r.id });
    if (d.regenerate === "on" && r.status === "PUBLISHED") await generateReportCards([r.id]);
    return { ok: true, message: "Remarks saved." };
  });
}

export async function bulkPrincipalRemark(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("results.publish");
    const d = z.object({ termId: id, classId: id, minAverage: z.coerce.number().min(0).max(100), maxAverage: z.coerce.number().min(0).max(100), remark: z.string().trim().min(2).max(400) }).parse(Object.fromEntries(fd));
    const r = await db.result.updateMany({ where: { termId: d.termId, classId: d.classId, average: { gte: d.minAverage, lte: d.maxAverage } }, data: { principalRemark: d.remark } });
    await audit({ actorId: admin.id, action: "results.bulk_remark", entityType: "Class", entityId: d.classId, details: d });
    return { ok: true, message: `Remark applied to ${r.count} student(s). Regenerate report cards to include it.` };
  });
}

export async function regenerateClassReportCards(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("results.publish");
    const d = z.object({ termId: id, classId: id }).parse(Object.fromEntries(fd));
    const results = await db.result.findMany({ where: { termId: d.termId, classId: d.classId, status: "PUBLISHED" }, select: { id: true } });
    const n = await generateReportCards(results.map((r) => r.id));
    await audit({ actorId: admin.id, action: "reportcards.regenerate", entityType: "Class", entityId: d.classId, details: { termId: d.termId, count: n } });
    return { ok: true, message: `${n} report card(s) regenerated. Earlier versions are kept as superseded.` };
  });
}

export async function saveReportTemplate(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("reportcards.configure");
    const d = z
      .object({ templateId: id, headerNote: z.string().max(300).optional(), footerNote: z.string().max(300).optional(), principalName: z.string().max(120).optional(), signatureLabels: z.string().max(200), commentOptions: z.string().max(2000).optional() })
      .parse(Object.fromEntries(fd));
    const on = (k: string) => fd.get(k) === "on";
    await db.reportCardTemplate.update({
      where: { id: d.templateId },
      data: { headerNote: d.headerNote || null, footerNote: d.footerNote || null, principalName: d.principalName || null, signatureLabels: d.signatureLabels || "Class Teacher,Principal", commentOptions: d.commentOptions || null, showPosition: on("showPosition"), showAttendance: on("showAttendance"), showGradingKey: on("showGradingKey"), showStampArea: on("showStampArea") },
    });
    await audit({ actorId: admin.id, action: "reportcards.template", entityType: "ReportCardTemplate", entityId: d.templateId });
    return { ok: true, message: "Report card template saved. It applies to newly generated report cards." };
  });
}
