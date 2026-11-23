import { db } from "@/lib/db";
import { dispatchAnnouncement } from "@/lib/announcements";
import { processEmailOutbox } from "@/lib/email/worker";
import { notify, verifiedParentUserIds, adminsWithPermission } from "@/lib/notifications";
import { storageUsageBytes } from "@/lib/storage/files";
import { obligationOutstanding } from "@/lib/finance";
import { formatNaira, formatDate, todayLagos } from "@/lib/utils";

/** Cooldown-protected trigger. Returns true if the alert may fire now. */
export async function claimAlert(key: string, cooldownHours: number) {
  const cutoff = new Date(Date.now() - cooldownHours * 3600_000);
  const existing = await db.alertState.findUnique({ where: { key } });
  if (existing && existing.lastTriggeredAt > cutoff) return false;
  await db.alertState.upsert({ where: { key }, create: { key, lastTriggeredAt: new Date() }, update: { lastTriggeredAt: new Date(), count: { increment: 1 } } });
  return true;
}

export async function publishDueAnnouncements() {
  const due = await db.announcement.findMany({ where: { status: "SCHEDULED", publishAt: { lte: new Date() }, notifiedAt: null }, select: { id: true } });
  for (const a of due) await dispatchAnnouncement(a.id);
  const archived = await db.announcement.updateMany({ where: { status: "PUBLISHED", expiresAt: { lt: new Date() } }, data: { status: "ARCHIVED" } });
  return { published: due.length, archived: archived.count };
}

/** Attendance alerts: consecutive absences and low attendance (current term). */
export async function runAttendanceAlerts(studentIds?: string[]) {
  const settings = await db.schoolSettings.findUniqueOrThrow({ where: { id: "school" } });
  const term = await db.term.findFirst({ where: { isCurrent: true } });
  if (!term) return 0;
  const students = await db.student.findMany({ where: { status: "ACTIVE", ...(studentIds ? { id: { in: studentIds } } : {}) }, select: { id: true, fullName: true, userId: true } });
  let sent = 0;
  for (const s of students) {
    const recs = await db.attendanceRecord.findMany({ where: { studentId: s.id, session: { termId: term.id, type: "DAILY" } }, orderBy: { session: { date: "desc" } }, select: { status: true, session: { select: { date: true } } } });
    if (!recs.length) continue;
    const parents = await verifiedParentUserIds(s.id);
    if (settings.consecutiveAbsenceAlert > 0) {
      let streak = 0;
      for (const r of recs) {
        if (r.status === "ABSENT") streak++;
        else break;
      }
      if (streak >= settings.consecutiveAbsenceAlert && (await claimAlert(`absence:${s.id}:${recs[streak - 1].session.date.toISOString().slice(0, 10)}`, settings.alertCooldownHours))) {
        await notify({ userIds: [...parents, s.userId], category: "ATTENDANCE", title: "Attendance alert: consecutive absences", body: `${s.fullName} has been marked absent for ${streak} consecutive school days (since ${formatDate(recs[streak - 1].session.date)}).`, link: "/parent/attendance", email: { template: "attendance-alert", priority: "HIGH" } });
        sent++;
      }
    }
    const present = recs.filter((r) => r.status === "PRESENT" || r.status === "LATE").length;
    const pct = (present / recs.length) * 100;
    if (recs.length >= 5 && pct < settings.attendanceWarningThreshold && (await claimAlert(`lowatt:${s.id}:${term.id}`, settings.alertCooldownHours * 2))) {
      await notify({ userIds: [...parents, s.userId], category: "ATTENDANCE", title: "Attendance below the school threshold", body: `${s.fullName}'s attendance this term is ${pct.toFixed(1)}%, below the required ${settings.attendanceWarningThreshold}%.`, link: "/parent/attendance", email: { template: "attendance-low", priority: "NORMAL" } });
      sent++;
    }
  }
  return sent;
}

/** Fee reminders for obligations due within N days, and overdue balances. */
export async function runFeeReminders() {
  const settings = await db.schoolSettings.findUniqueOrThrow({ where: { id: "school" } });
  const today = todayLagos();
  const horizon = new Date(today.getTime() + settings.feeReminderDaysBefore * 86400_000);
  const obs = await db.studentFeeObligation.findMany({
    where: { status: { in: ["UNPAID", "PARTIAL"] }, dueDate: { not: null, lte: horizon }, student: { status: "ACTIVE" } },
    include: { student: true, feeStructure: { include: { category: true } }, term: true },
  });
  let sent = 0;
  for (const o of obs) {
    const overdue = o.dueDate! < today;
    const key = `fee:${o.id}:${overdue ? "overdue" : "upcoming"}`;
    if (!(await claimAlert(key, overdue ? 24 * 7 : 24 * 365))) continue;
    const out = obligationOutstanding(o);
    if (out.lessThanOrEqualTo(0)) continue;
    await notify({
      userIds: [o.student.userId, ...(await verifiedParentUserIds(o.studentId))],
      category: "FEES",
      title: overdue ? "School fees overdue" : "Upcoming school fees deadline",
      body: `${o.feeStructure.category.name} (${o.term.name}) for ${o.student.fullName}: ${formatNaira(out)} outstanding, ${overdue ? "was due" : "due"} ${formatDate(o.dueDate)}.`,
      link: "/student/fees",
      email: { template: "fee-reminder", priority: "NORMAL" },
    });
    sent++;
  }
  return sent;
}

export async function checkStorageUsage() {
  const settings = await db.schoolSettings.findUniqueOrThrow({ where: { id: "school" } });
  const used = await storageUsageBytes();
  if (BigInt(used) >= settings.storageWarningBytes && (await claimAlert("storage:warning", 24 * 7))) {
    await notify({ userIds: await adminsWithPermission("settings.manage"), category: "SYSTEM", title: "File storage nearing the free allowance", body: `Stored files total ${(used / 1024 ** 3).toFixed(2)} GB (warning threshold ${(Number(settings.storageWarningBytes) / 1024 ** 3).toFixed(1)} GB; R2 free tier is 10 GB-month). Review usage and approve a billing plan if needed.`, link: "/admin/settings" });
  }
  return used;
}

export async function runAllJobs() {
  const announcements = await publishDueAnnouncements();
  const attendance = await runAttendanceAlerts();
  const fees = await runFeeReminders();
  const storageBytes = await checkStorageUsage();
  const email = await processEmailOutbox(80);
  return { announcements, attendanceAlerts: attendance, feeReminders: fees, storageBytes, email };
}
