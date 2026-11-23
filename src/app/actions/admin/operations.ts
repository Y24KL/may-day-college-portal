"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { run, type ActionState } from "@/lib/action";
import { authorizeAdmin } from "@/lib/auth/guards";
import { audit } from "@/lib/audit";
import { notify, verifiedParentUserIds } from "@/lib/notifications";
import { kickEmailWorker } from "@/lib/email/worker";
import { conflictsFor } from "@/lib/timetable-db";
import { dispatchAnnouncement, resolveAudience } from "@/lib/announcements";
import { saveUpload } from "@/lib/storage/files";
import type { AudienceType } from "@prisma/client";
import { parseLagosInput } from "@/lib/utils";

const id = z.string().min(1);

/* ── Timetables ─────────────────────────────────────────────────────── */

export async function createTimetable(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("timetable.manage");
    const d = z.object({ classId: id, termId: id, copyFromId: z.string().optional() }).parse(Object.fromEntries(fd));
    const term = await db.term.findUniqueOrThrow({ where: { id: d.termId } });
    const draft = await db.timetable.findFirst({ where: { classId: d.classId, termId: d.termId, status: "DRAFT" } });
    if (draft) return { ok: true, message: "A draft already exists.", redirect: `/admin/timetables/${draft.id}` };
    const tt = await db.timetable.create({ data: { classId: d.classId, termId: term.id, sessionId: term.sessionId } });
    const src = d.copyFromId ? d.copyFromId : (await db.timetable.findFirst({ where: { classId: d.classId, termId: d.termId, status: "PUBLISHED" } }))?.id;
    if (src) {
      const periods = await db.timetablePeriod.findMany({ where: { timetableId: src } });
      await db.timetablePeriod.createMany({ data: periods.map((p) => ({ timetableId: tt.id, dayOfWeek: p.dayOfWeek, periodId: p.periodId, offeringId: p.offeringId, teacherId: p.teacherId, classroomId: p.classroomId, note: p.note })) });
    }
    await audit({ actorId: admin.id, action: "timetable.create", entityType: "Timetable", entityId: tt.id });
    return { ok: true, message: "Draft timetable created.", redirect: `/admin/timetables/${tt.id}` };
  });
}

export async function setTimetableSlot(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await authorizeAdmin("timetable.manage");
    const d = z.object({ timetableId: id, dayOfWeek: z.coerce.number().int().min(1).max(7), periodId: id, offeringId: z.string().optional(), classroomId: z.string().optional(), note: z.string().max(60).optional() }).parse(Object.fromEntries(fd));
    const tt = await db.timetable.findUniqueOrThrow({ where: { id: d.timetableId } });
    if (tt.status !== "DRAFT") throw new Error("Only draft timetables can be edited. Create a new draft from the published version.");
    if (!d.offeringId && !d.note) {
      await db.timetablePeriod.deleteMany({ where: { timetableId: tt.id, dayOfWeek: d.dayOfWeek, periodId: d.periodId } });
      return { ok: true, message: "Slot cleared." };
    }
    let teacherId: string | null = null;
    if (d.offeringId) {
      const off = await db.subjectOffering.findFirst({ where: { id: d.offeringId, classId: tt.classId, sessionId: tt.sessionId }, include: { teacherAssignments: { where: { isActive: true } } } });
      if (!off) throw new Error("That subject is not offered to this class in this session.");
      teacherId = off.teacherAssignments[0]?.teacherId ?? null;
    }
    const data = { offeringId: d.offeringId || null, teacherId, classroomId: d.classroomId || null, note: d.note || null };
    await db.timetablePeriod.upsert({ where: { timetableId_dayOfWeek_periodId: { timetableId: tt.id, dayOfWeek: d.dayOfWeek, periodId: d.periodId } }, create: { timetableId: tt.id, dayOfWeek: d.dayOfWeek, periodId: d.periodId, ...data }, update: data });
    const conflicts = await conflictsFor(tt.id);
    return { ok: true, message: conflicts.length ? `Saved — ${conflicts.length} conflict(s) need attention before publishing.` : "Slot saved." };
  });
}

export async function publishTimetable(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("timetable.manage");
    const timetableId = id.parse(fd.get("timetableId"));
    const conflicts = await conflictsFor(timetableId);
    if (conflicts.length) throw new Error(`Resolve ${conflicts.length} conflict(s) first: ${conflicts.slice(0, 3).map((c) => c.message).join(" ")}`);
    await db.$transaction(async (tx) => {
      const tt = await tx.timetable.findUniqueOrThrow({ where: { id: timetableId }, include: { class: true, periods: { include: { teacher: true } } } });
      if (tt.status !== "DRAFT") throw new Error("Only drafts can be published.");
      if (!tt.periods.length) throw new Error("The timetable is empty.");
      const previous = await tx.timetable.findFirst({ where: { classId: tt.classId, termId: tt.termId, status: "PUBLISHED" } });
      if (previous) await tx.timetable.update({ where: { id: previous.id }, data: { status: "ARCHIVED" } });
      await tx.timetable.update({ where: { id: tt.id }, data: { status: "PUBLISHED", publishedAt: new Date() } });
      await audit({ actorId: admin.id, action: previous ? "timetable.republish" : "timetable.publish", entityType: "Timetable", entityId: tt.id }, tx);
      const enr = await tx.studentEnrollment.findMany({ where: { classId: tt.classId, sessionId: tt.sessionId, status: "ACTIVE" }, select: { studentId: true, student: { select: { userId: true } } } });
      const parentIds = (await Promise.all(enr.map((e) => verifiedParentUserIds(e.studentId, tx)))).flat();
      const teacherIds = [...new Set(tt.periods.map((p) => p.teacher?.userId).filter(Boolean) as string[])];
      const title = previous ? `Timetable updated: ${tt.class.name}` : `Timetable published: ${tt.class.name}`;
      await notify({ userIds: [...enr.map((e) => e.student.userId), ...parentIds], category: "TIMETABLE", title, body: `The ${tt.class.name} class timetable has been ${previous ? "changed" : "published"}.`, link: "/student/timetable", email: previous ? { template: "timetable-changed", priority: "LOW" } : undefined }, tx);
      await notify({ userIds: teacherIds, category: "TIMETABLE", title, body: `Your teaching schedule includes ${tt.class.name}. Please review your timetable.`, link: "/teacher/timetable", email: previous ? { template: "timetable-changed", priority: "LOW" } : undefined }, tx);
    }, { timeout: 30_000 });
    await kickEmailWorker();
    return { ok: true, message: "Timetable published and affected users notified." };
  });
}

export async function archiveTimetable(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("timetable.manage");
    const timetableId = id.parse(fd.get("timetableId"));
    const tt = await db.timetable.findUniqueOrThrow({ where: { id: timetableId } });
    if (tt.status === "DRAFT") await db.timetable.delete({ where: { id: tt.id } });
    else await db.timetable.update({ where: { id: tt.id }, data: { status: "ARCHIVED" } });
    await audit({ actorId: admin.id, action: tt.status === "DRAFT" ? "timetable.discard" : "timetable.archive", entityType: "Timetable", entityId: tt.id });
    return { ok: true, message: tt.status === "DRAFT" ? "Draft discarded." : "Timetable archived.", redirect: "/admin/timetables" };
  });
}

/* ── Announcements ──────────────────────────────────────────────────── */

function parseAudiences(fd: FormData): { type: AudienceType; targetId: string | null }[] {
  const out: { type: AudienceType; targetId: string | null }[] = [];
  for (const raw of fd.getAll("audience").map(String)) {
    const [type, targetId] = raw.split(":");
    if (["EVERYONE", "ALL_STUDENTS", "CLASS_LEVEL", "SECTOR", "CLASS", "TEACHERS", "PARENTS", "USER"].includes(type)) out.push({ type: type as AudienceType, targetId: targetId || null });
  }
  const users = String(fd.get("userEmails") ?? "").split(/[\s,;]+/).filter(Boolean);
  return [...out, ...users.map((u) => ({ type: "USER" as AudienceType, targetId: `email:${u.toLowerCase()}` }))];
}

export async function saveAnnouncement(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("announcements.manage");
    const d = z
      .object({
        announcementId: z.string().optional(), title: z.string().trim().min(3).max(160), body: z.string().trim().min(5).max(10000), category: z.string().trim().min(2).max(60),
        priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]), publishAt: z.string().optional(), expiresAt: z.string().optional(), mode: z.enum(["DRAFT", "PUBLISH"]),
      })
      .parse(Object.fromEntries(fd));
    let audiences = parseAudiences(fd);
    // Resolve individual emails to user ids
    const resolved: typeof audiences = [];
    for (const a of audiences) {
      if (a.type === "USER" && a.targetId?.startsWith("email:")) {
        const u = await db.user.findUnique({ where: { email: a.targetId.slice(6) } });
        if (!u) throw new Error(`No user found with email ${a.targetId.slice(6)}.`);
        resolved.push({ type: "USER", targetId: u.id });
      } else resolved.push(a);
    }
    audiences = resolved;
    if (!audiences.length) throw new Error("Select at least one target audience.");
    const publishAt = parseLagosInput(d.publishAt) ?? new Date();
    const expiresAt = parseLagosInput(d.expiresAt);
    if (expiresAt && expiresAt <= publishAt) throw new Error("Expiry must be after the publication time.");
    const status = d.mode === "DRAFT" ? "DRAFT" : publishAt > new Date(Date.now() + 60_000) ? "SCHEDULED" : "PUBLISHED";
    const data = { title: d.title, body: d.body, category: d.category, priority: d.priority, publishAt, expiresAt, isPinned: fd.get("isPinned") === "on", status } as const;
    const a = await db.$transaction(async (tx) => {
      const ann = d.announcementId ? await tx.announcement.update({ where: { id: d.announcementId }, data }) : await tx.announcement.create({ data: { ...data, createdById: admin.id } });
      await tx.announcementAudience.deleteMany({ where: { announcementId: ann.id } });
      await tx.announcementAudience.createMany({ data: audiences.map((x) => ({ announcementId: ann.id, ...x })) });
      return ann;
    });
    const cover = fd.get("cover");
    if (cover instanceof File && cover.size > 0) {
      const doc = await saveUpload({ file: cover, purpose: "ANNOUNCEMENT_IMAGE", uploadedById: admin.id, announcementId: a.id });
      await db.announcement.update({ where: { id: a.id }, data: { coverFileId: doc.id } });
    }
    for (const f of fd.getAll("attachments").filter((f): f is File => f instanceof File && f.size > 0).slice(0, 5)) {
      await saveUpload({ file: f, purpose: "ANNOUNCEMENT_ATTACHMENT", uploadedById: admin.id, announcementId: a.id });
    }
    let recipients = 0;
    if (status === "PUBLISHED") recipients = await dispatchAnnouncement(a.id);
    await audit({ actorId: admin.id, action: `announcement.${status.toLowerCase()}`, entityType: "Announcement", entityId: a.id, details: { recipients } });
    await kickEmailWorker();
    return { ok: true, message: status === "PUBLISHED" ? `Published to ${recipients} recipient(s).` : status === "SCHEDULED" ? "Scheduled." : "Draft saved.", redirect: "/admin/announcements" };
  });
}

export async function announcementOp(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("announcements.manage");
    const d = z.object({ announcementId: id, op: z.enum(["PIN", "ARCHIVE", "PUBLISH_NOW"]) }).parse(Object.fromEntries(fd));
    const a = await db.announcement.findUniqueOrThrow({ where: { id: d.announcementId } });
    if (d.op === "PIN") await db.announcement.update({ where: { id: a.id }, data: { isPinned: !a.isPinned } });
    if (d.op === "ARCHIVE") await db.announcement.update({ where: { id: a.id }, data: { status: "ARCHIVED" } });
    if (d.op === "PUBLISH_NOW") {
      await db.announcement.update({ where: { id: a.id }, data: { publishAt: new Date(), status: "PUBLISHED" } });
      await dispatchAnnouncement(a.id);
      await kickEmailWorker();
    }
    await audit({ actorId: admin.id, action: `announcement.${d.op.toLowerCase()}`, entityType: "Announcement", entityId: a.id });
    return { ok: true, message: "Announcement updated." };
  });
}

/* ── Targeted messages ──────────────────────────────────────────────── */

export async function sendTargetedMessage(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("notifications.manage");
    const d = z.object({ title: z.string().trim().min(3).max(140), body: z.string().trim().min(3).max(3000), sendEmail: z.string().optional() }).parse(Object.fromEntries(fd));
    const audiences = parseAudiences(fd);
    const resolved: { type: AudienceType; targetId: string | null }[] = [];
    for (const a of audiences) {
      if (a.type === "USER" && a.targetId?.startsWith("email:")) {
        const u = await db.user.findUnique({ where: { email: a.targetId.slice(6) } });
        if (!u) throw new Error(`No user with email ${a.targetId.slice(6)}.`);
        resolved.push({ type: "USER", targetId: u.id });
      } else resolved.push(a);
    }
    if (!resolved.length) throw new Error("Choose recipients.");
    const ids = await resolveAudience(resolved);
    if (!ids.length) throw new Error("No active recipients match the selection.");
    for (let i = 0; i < ids.length; i += 500) {
      await notify({ userIds: ids.slice(i, i + 500), category: "MESSAGE", title: d.title, body: d.body, link: "/notifications", email: d.sendEmail === "on" ? { template: "message", priority: "LOW" } : undefined });
    }
    await audit({ actorId: admin.id, action: "message.send", entityType: "Notification", details: { title: d.title, recipients: ids.length, email: d.sendEmail === "on" } });
    await kickEmailWorker();
    return { ok: true, message: `Message sent to ${ids.length} user(s).` };
  });
}

/* ── Attendance corrections ─────────────────────────────────────────── */

export async function reviewAttendanceCorrection(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("attendance.manage");
    const d = z.object({ correctionId: id, decision: z.enum(["APPROVE", "REJECT"]) }).parse(Object.fromEntries(fd));
    await db.$transaction(async (tx) => {
      const c = await tx.attendanceCorrection.findUniqueOrThrow({ where: { id: d.correctionId } });
      if (c.status !== "PENDING") throw new Error("Already reviewed.");
      await tx.attendanceCorrection.update({ where: { id: c.id }, data: { status: d.decision === "APPROVE" ? "APPROVED" : "REJECTED", reviewedById: admin.id, reviewedAt: new Date() } });
      if (d.decision === "APPROVE") await tx.attendanceRecord.update({ where: { id: c.recordId }, data: { status: c.newStatus } });
      await audit({ actorId: admin.id, action: `attendance.correction_${d.decision.toLowerCase()}`, entityType: "AttendanceCorrection", entityId: c.id, sensitive: true }, tx);
      await notify({ userIds: [c.requestedById], category: "ATTENDANCE", title: `Attendance correction ${d.decision === "APPROVE" ? "approved" : "rejected"}`, body: `Your request to change a record to ${c.newStatus} was ${d.decision === "APPROVE" ? "approved" : "rejected"}.`, link: "/teacher/attendance" }, tx);
    });
    return { ok: true, message: "Correction reviewed." };
  });
}
