"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { run, type ActionState } from "@/lib/action";
import { authorizeTeacher } from "@/lib/auth/guards";
import { audit } from "@/lib/audit";
import { teacherOwnsOffering, studentsForOffering } from "@/lib/access";
import { getOrCreateSubmission, saveScores, submitScores, type ScoreInput } from "@/lib/results";
import { runAttendanceAlerts } from "@/lib/jobs";
import { kickEmailWorker } from "@/lib/email/worker";
import { parseDateOnly, todayLagos } from "@/lib/utils";
import { generateReportCards } from "@/lib/pdf/reportcard";
import { adminsWithPermission, notify } from "@/lib/notifications";
import type { AttendanceStatus } from "@prisma/client";

const STATUSES = ["PRESENT", "ABSENT", "LATE", "EXCUSED"] as const;

async function rosterFor(teacherId: string, type: "DAILY" | "LESSON", classId: string, offeringId: string | undefined, sessionId: string) {
  if (type === "LESSON") {
    if (!offeringId || !(await teacherOwnsOffering(teacherId, offeringId))) throw new Error("You are not assigned to this subject.");
    return studentsForOffering(offeringId);
  }
  const cta = await db.classTeacherAssignment.findFirst({ where: { teacherId, classId, sessionId } });
  if (!cta) throw new Error("Only the class teacher can take the daily register for this class.");
  const enr = await db.studentEnrollment.findMany({ where: { classId, sessionId, status: "ACTIVE" }, include: { student: true } });
  return enr.map((e) => e.student);
}

export async function saveAttendance(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const u = await authorizeTeacher();
    const d = z.object({ type: z.enum(["DAILY", "LESSON"]), classId: z.string().min(1), offeringId: z.string().optional(), periodId: z.string().optional(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(Object.fromEntries(fd));
    const [settings, term] = await Promise.all([db.schoolSettings.findUniqueOrThrow({ where: { id: "school" } }), db.term.findFirst({ where: { isCurrent: true } })]);
    if (!term) throw new Error("There is no current term.");
    if (d.type === "DAILY" && !settings.enableDailyAttendance) throw new Error("Daily attendance is disabled.");
    if (d.type === "LESSON" && !settings.enableLessonAttendance) throw new Error("Lesson attendance is disabled.");
    const date = parseDateOnly(d.date);
    if (date > todayLagos()) throw new Error("You cannot take attendance for a future date.");
    if (date < term.startDate || date > term.endDate) throw new Error("The date is outside the current term.");
    if (!settings.schoolDays.split(",").map(Number).includes(((date.getUTCDay() + 6) % 7) + 1)) throw new Error("That date is not a school day.");
    let classId = d.classId;
    if (d.type === "LESSON") {
      const off = await db.subjectOffering.findUnique({ where: { id: d.offeringId ?? "" } });
      if (!off) throw new Error("Subject not found.");
      classId = off.classId;
    }
    const roster = await rosterFor(u.teacherId, d.type, classId, d.offeringId, term.sessionId);
    if (!roster.length) throw new Error("No students to mark.");
    const marks: { studentId: string; status: AttendanceStatus; remark: string | null }[] = [];
    for (const s of roster) {
      const st = fd.get(`status_${s.id}`);
      if (!st || !STATUSES.includes(st as (typeof STATUSES)[number])) throw new Error(`Mark attendance for ${s.fullName}.`);
      if (st === "EXCUSED" && !settings.allowExcusedAttendance) throw new Error("'Excused' is not enabled.");
      const remark = String(fd.get(`remark_${s.id}`) ?? "").trim().slice(0, 200) || null;
      marks.push({ studentId: s.id, status: st as AttendanceStatus, remark });
    }
    const key = d.type === "DAILY" ? `DAILY:${classId}:${d.date}` : `LESSON:${d.offeringId}:${d.date}:${d.periodId || "-"}`;
    const existing = await db.attendanceSession.findUnique({ where: { key } });
    if (existing) {
      const hours = (Date.now() - existing.submittedAt.getTime()) / 3600_000;
      if (hours > settings.attendanceEditWindowHours) throw new Error(`The ${settings.attendanceEditWindowHours}-hour edit window has passed. Use “Request correction” for individual records.`);
      if (existing.takenById !== u.teacherId) throw new Error("This register was taken by another teacher.");
    }
    await db.$transaction(async (tx) => {
      const sess = existing ?? (await tx.attendanceSession.create({ data: { key, type: d.type, classId, offeringId: d.offeringId || null, periodId: d.periodId || null, termId: term.id, date, takenById: u.teacherId } }));
      for (const m of marks) {
        await tx.attendanceRecord.upsert({ where: { sessionId_studentId: { sessionId: sess.id, studentId: m.studentId } }, create: { sessionId: sess.id, ...m }, update: { status: m.status, remark: m.remark } });
      }
      await audit({ actorId: u.id, action: existing ? "attendance.update" : "attendance.submit", entityType: "AttendanceSession", entityId: sess.id, details: { key, count: marks.length } }, tx);
    });
    if (d.type === "DAILY") {
      await runAttendanceAlerts(marks.filter((m) => m.status === "ABSENT").map((m) => m.studentId));
      await kickEmailWorker();
    }
    return { ok: true, message: existing ? "Attendance updated." : `Attendance saved for ${marks.length} student(s).` };
  });
}

export async function requestAttendanceCorrection(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const u = await authorizeTeacher();
    const d = z.object({ recordId: z.string().min(1), newStatus: z.enum(STATUSES), reason: z.string().trim().min(5, "Explain the correction.") }).parse(Object.fromEntries(fd));
    const rec = await db.attendanceRecord.findUniqueOrThrow({ where: { id: d.recordId }, include: { session: true } });
    if (rec.session.takenById !== u.teacherId) throw new Error("You can only request corrections to registers you took.");
    if (rec.status === d.newStatus) throw new Error("The status is unchanged.");
    if (await db.attendanceCorrection.findFirst({ where: { recordId: rec.id, status: "PENDING" } })) throw new Error("A correction is already pending for this record.");
    await db.attendanceCorrection.create({ data: { recordId: rec.id, requestedById: u.id, oldStatus: rec.status, newStatus: d.newStatus, reason: d.reason } });
    await notify({ userIds: await adminsWithPermission("attendance.manage"), category: "ATTENDANCE", title: "Attendance correction requested", body: `${u.displayName} requested a correction (${rec.status} → ${d.newStatus}).`, link: "/admin/attendance" });
    return { ok: true, message: "Correction request sent to the academic office." };
  });
}

function parseScoreRows(fd: FormData, ids: string[]): ScoreInput[] {
  const num = (v: FormDataEntryValue | null) => {
    const s = String(v ?? "").trim();
    if (s === "") return null;
    const n = Number(s);
    if (!Number.isFinite(n)) throw new Error(`“${s}” is not a valid score.`);
    return n;
  };
  return ids.map((id) => ({ studentId: id, ca: num(fd.get(`ca_${id}`)), exam: num(fd.get(`exam_${id}`)), remark: String(fd.get(`remark_${id}`) ?? "") }));
}

export async function saveScoreSheet(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const u = await authorizeTeacher();
    const d = z.object({ offeringId: z.string().min(1), termId: z.string().min(1), intent: z.enum(["SAVE", "SUBMIT"]) }).parse(Object.fromEntries(fd));
    if (!(await teacherOwnsOffering(u.teacherId, d.offeringId))) throw new Error("You are not assigned to this subject.");
    const roster = await studentsForOffering(d.offeringId);
    const allowed = new Set(roster.map((s) => s.id));
    const sub = await getOrCreateSubmission(d.offeringId, d.termId);
    const rows = parseScoreRows(fd, roster.map((s) => s.id));
    // Bulk paste: "STUDENT_ID, CA, EXAM" lines override individual inputs.
    const bulk = String(fd.get("bulk") ?? "").trim();
    if (bulk) {
      const byNumber = new Map(roster.map((s) => [s.studentNumber.toUpperCase(), s.id]));
      for (const line of bulk.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
        const [num, ca, exam] = line.split(/[,\t;]/).map((x) => x.trim());
        const sid = byNumber.get((num ?? "").toUpperCase());
        if (!sid) throw new Error(`Bulk entry: student ID “${num}” is not on this subject list.`);
        const r = rows.find((x) => x.studentId === sid)!;
        r.ca = ca === "" || ca === undefined ? null : Number(ca);
        r.exam = exam === "" || exam === undefined ? null : Number(exam);
        if ((r.ca !== null && !Number.isFinite(r.ca)) || (r.exam !== null && !Number.isFinite(r.exam))) throw new Error(`Bulk entry: invalid number on line “${line}”.`);
      }
    }
    await saveScores({ submissionId: sub.id, teacherUserId: u.id, rows, allowedStudentIds: allowed });
    await audit({ actorId: u.id, action: "scores.save", entityType: "ScoreSubmission", entityId: sub.id, details: { rows: rows.length } });
    if (d.intent === "SUBMIT") {
      await submitScores(sub.id, u.id, roster.map((s) => s.id));
      await audit({ actorId: u.id, action: "scores.submit", entityType: "ScoreSubmission", entityId: sub.id, sensitive: true });
      return { ok: true, message: "Scores submitted for review. They are now locked unless returned." };
    }
    return { ok: true, message: "Draft saved." };
  });
}

/** Class teacher's remark on a student's term result (regenerates the report card if published). */
export async function saveClassTeacherRemark(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const u = await authorizeTeacher();
    const d = z.object({ resultId: z.string().min(1), remark: z.string().trim().max(400) }).parse(Object.fromEntries(fd));
    const r = await db.result.findUniqueOrThrow({ where: { id: d.resultId }, include: { term: true } });
    const cta = await db.classTeacherAssignment.findFirst({ where: { teacherId: u.teacherId, classId: r.classId, sessionId: r.term.sessionId } });
    if (!cta) throw new Error("Only the class teacher can add this remark.");
    await db.result.update({ where: { id: r.id }, data: { classTeacherRemark: d.remark || null } });
    await audit({ actorId: u.id, action: "results.class_teacher_remark", entityType: "Result", entityId: r.id });
    if (r.status === "PUBLISHED") await generateReportCards([r.id]);
    return { ok: true, message: "Remark saved." };
  });
}
