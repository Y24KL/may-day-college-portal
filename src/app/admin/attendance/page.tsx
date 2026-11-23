import { requireAdminPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { PageHeader, Card, EmptyState, StatusBadge, FilterBar, Stat } from "@/components/ui";
import { ConfirmAction } from "@/components/ui/client";
import { reviewAttendanceCorrection } from "@/app/actions/admin/operations";
import { getCurrentSessionTerm, termLabel } from "@/lib/academic";
import { termOptions, classOptions } from "@/lib/options";
import { formatDateTime, formatDate } from "@/lib/utils";
import { BarsChart } from "@/components/charts";

export const metadata = { title: "Attendance management" };

export default async function AttendanceAdmin({ searchParams }: { searchParams: Promise<{ termId?: string; classId?: string }> }) {
  const u = await requireAdminPage("attendance.view");
  const sp = await searchParams;
  const { term: current } = await getCurrentSessionTerm();
  const [terms, classes, settings] = await Promise.all([termOptions(), classOptions(), db.schoolSettings.findUniqueOrThrow({ where: { id: "school" } })]);
  const termId = sp.termId ?? current?.id ?? terms[0]?.id;
  const where = { session: { termId, type: "DAILY" as const, ...(sp.classId ? { classId: sp.classId } : {}) } };
  const [byStatus, byClass, corrections, recentSessions, records] = await Promise.all([
    db.attendanceRecord.groupBy({ by: ["status"], where, _count: true }),
    db.attendanceSession.findMany({ where: { termId, type: "DAILY" }, select: { classId: true, class: { select: { name: true } }, records: { select: { status: true } } } }),
    db.attendanceCorrection.findMany({ where: { status: "PENDING" }, include: { record: { include: { student: true, session: { include: { class: true } } } } }, orderBy: { createdAt: "asc" } }),
    db.attendanceSession.findMany({ where: { termId, ...(sp.classId ? { classId: sp.classId } : {}) }, include: { class: true, offering: { include: { subject: true } }, takenBy: true, _count: { select: { records: true } } }, orderBy: { date: "desc" }, take: 15 }),
    db.attendanceRecord.findMany({ where, select: { studentId: true, status: true, student: { select: { fullName: true, studentNumber: true } } } }),
  ]);
  const total = byStatus.reduce((s, x) => s + x._count, 0);
  const n = (s: string) => byStatus.find((x) => x.status === s)?._count ?? 0;
  const classAgg = new Map<string, { p: number; t: number }>();
  for (const s of byClass) {
    const a = classAgg.get(s.class.name) ?? { p: 0, t: 0 };
    a.t += s.records.length;
    a.p += s.records.filter((r) => r.status === "PRESENT" || r.status === "LATE").length;
    classAgg.set(s.class.name, a);
  }
  const perStudent = new Map<string, { name: string; num: string; absent: number; total: number }>();
  for (const r of records) {
    const e = perStudent.get(r.studentId) ?? { name: r.student.fullName, num: r.student.studentNumber, absent: 0, total: 0 };
    e.total++;
    if (r.status === "ABSENT") e.absent++;
    perStudent.set(r.studentId, e);
  }
  const atRisk = [...perStudent.values()].filter((s) => s.total >= 3 && ((s.total - s.absent) / s.total) * 100 < settings.attendanceWarningThreshold).sort((a, b) => b.absent - a.absent).slice(0, 20);
  return (
    <div className="space-y-5">
      <PageHeader title="Attendance management" description={`Daily registers and lesson attendance are stored separately. Alerts fire below ${settings.attendanceWarningThreshold}% or after ${settings.consecutiveAbsenceAlert || "—"} consecutive absences (configure in System Settings).`} />
      <FilterBar>
        <select name="termId" defaultValue={termId} className="input max-w-[16rem]" aria-label="Term">{terms.map((t) => <option key={t.id} value={t.id}>{termLabel(t)}</option>)}</select>
        <select name="classId" defaultValue={sp.classId ?? ""} className="input max-w-[14rem]" aria-label="Class"><option value="">All classes</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      </FilterBar>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Attendance rate" value={total ? `${(((n("PRESENT") + n("LATE")) / total) * 100).toFixed(1)}%` : "—"} />
        <Stat label="Present" value={n("PRESENT")} tone="green" />
        <Stat label="Absent" value={n("ABSENT")} tone="red" />
        <Stat label="Late" value={n("LATE")} tone="gold" />
        <Stat label="Excused" value={n("EXCUSED")} tone="navy" />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Attendance rate by class (daily)">
          {classAgg.size ? <BarsChart data={[...classAgg.entries()].map(([name, a]) => ({ name, Rate: Math.round((a.p / a.t) * 1000) / 10 }))} xKey="name" bars={[{ key: "Rate" }]} domain={[0, 100]} /> : <EmptyState title="No daily registers yet" />}
        </Card>
        <Card title="Students below threshold">
          {atRisk.length ? <ul className="divide-y divide-lavender text-sm">{atRisk.map((s) => <li key={s.num} className="flex justify-between py-2"><span>{s.name} <span className="text-xs text-muted">{s.num}</span></span><span className="text-rose-700">{s.absent} absent / {s.total}</span></li>)}</ul> : <EmptyState title="No students below the threshold" />}
        </Card>
      </div>
      <Card title="Correction requests" description="Teachers request corrections after the edit window closes.">
        {corrections.length ? (
          <ul className="space-y-2">{corrections.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/60 p-3 text-sm">
              <span><b>{c.record.student.fullName}</b> · {c.record.session.class.name} · {formatDate(c.record.session.date)}: <StatusBadge status={c.oldStatus} /> → <StatusBadge status={c.newStatus} /> <span className="text-muted">“{c.reason}”</span></span>
              {u.permissions.has("attendance.manage") && <span className="flex gap-2">
                <ConfirmAction action={reviewAttendanceCorrection} fields={{ correctionId: c.id, decision: "APPROVE" }} label="Approve" className="btn-primary btn-sm" title="Approve correction" message="The attendance record will be updated." />
                <ConfirmAction action={reviewAttendanceCorrection} fields={{ correctionId: c.id, decision: "REJECT" }} label="Reject" title="Reject correction" message="The record stays unchanged." />
              </span>}
            </li>
          ))}</ul>
        ) : <EmptyState title="No pending corrections" />}
      </Card>
      <Card title="Recent registers">
        {recentSessions.length ? (
          <div className="table-wrap"><table className="table"><thead><tr><th>Date</th><th>Class</th><th>Type</th><th>Taken by</th><th>Records</th><th>Submitted</th></tr></thead>
            <tbody>{recentSessions.map((s) => <tr key={s.id}><td>{formatDate(s.date)}</td><td>{s.class.name}</td><td>{s.type === "DAILY" ? "Daily" : `Lesson · ${s.offering?.subject.name}`}</td><td>{s.takenBy.fullName}</td><td>{s._count.records}</td><td className="text-xs">{formatDateTime(s.submittedAt)}</td></tr>)}</tbody></table></div>
        ) : <EmptyState title="No attendance recorded for this term" />}
      </Card>
    </div>
  );
}
