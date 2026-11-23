import Link from "next/link";
import { db } from "@/lib/db";
import { publishedResultsForStudent, attendanceSummary, termLabel } from "@/lib/academic";
import { generateInsights, termAverages, gradeDistribution, subjectSeries, pointChange } from "@/lib/analytics";
import { Card, EmptyState, Badge, Stat, StatusBadge, Progress } from "@/components/ui";
import { TrendChart, BarsChart } from "@/components/charts";
import { formatDate, cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Star, AlertTriangle, Info, Download } from "lucide-react";

/** Published results grouped by term. */
export async function ResultsView({ studentId, termId, basePath }: { studentId: string; termId?: string; basePath: string }) {
  const [rows, results, settings] = await Promise.all([
    publishedResultsForStudent(studentId),
    db.result.findMany({ where: { studentId, status: "PUBLISHED" }, include: { term: { include: { session: true } }, class: true, reportCards: { where: { status: "ACTIVE" } } } }),
    db.schoolSettings.findUniqueOrThrow({ where: { id: "school" } }),
  ]);
  if (!rows.length) return <Card><EmptyState title="No published results yet" description="Results appear here once the school publishes them." /></Card>;
  const terms = [...new Map(rows.map((r) => [r.termId, { id: r.termId, label: r.termLabel, order: r.order }])).values()].sort((a, b) => b.order - a.order);
  const active = termId && terms.some((t) => t.id === termId) ? termId : terms[0].id;
  const current = rows.filter((r) => r.termId === active);
  const summary = results.find((r) => r.termId === active);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">{terms.map((t) => <Link key={t.id} href={`${basePath}${basePath.includes("?") ? "&" : "?"}term=${t.id}`} className={t.id === active ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>{t.label}</Link>)}</div>
      {summary && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Average" value={`${summary.average.toString()}%`} />
          <Stat label="Total marks" value={summary.totalMarks.toString()} tone="navy" hint={`${summary.subjectCount} subjects`} />
          {settings.showClassPosition && summary.position ? <Stat label="Class position" value={`${summary.position} / ${summary.classSize}`} tone="gold" hint={summary.class.name} /> : <Stat label="Class" value={summary.class.name} tone="gold" />}
          <Stat label="Report card" value={summary.reportCards[0]?.fileId ? <a className="btn-primary btn-sm mt-1" href={`/api/files/${summary.reportCards[0].fileId}`} target="_blank"><Download className="h-4 w-4" /> PDF</a> : <span className="text-base text-muted">Pending</span>} tone="green" />
        </div>
      )}
      <Card title={current[0]?.termLabel}>
        <div className="table-wrap"><table className="table"><thead><tr><th>Subject</th><th>CA</th><th>Exam</th><th>Total</th><th>Grade</th><th>Remark</th><th>Teacher&apos;s comment</th></tr></thead>
          <tbody>{current.map((r) => <tr key={r.subject}><td className="font-semibold text-navy">{r.subject}</td><td>{r.ca ?? "—"}</td><td>{r.exam ?? "—"}</td><td className="font-bold">{r.total}</td><td><Badge tone={r.total >= 70 ? "green" : r.total >= 50 ? "blue" : r.total >= 40 ? "amber" : "red"}>{r.grade}</Badge></td><td className="text-xs">{r.gradeDescription}</td><td className="max-w-xs text-xs text-muted">{r.teacherRemark}</td></tr>)}</tbody>
        </table></div>
        {summary && (summary.classTeacherRemark || summary.principalRemark) && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {summary.classTeacherRemark && <div className="rounded-xl bg-white/60 p-3 text-sm"><p className="label">Class teacher&apos;s remark</p>{summary.classTeacherRemark}</div>}
            {summary.principalRemark && <div className="rounded-xl bg-white/60 p-3 text-sm"><p className="label">Principal&apos;s remark</p>{summary.principalRemark}</div>}
          </div>
        )}
      </Card>
    </div>
  );
}

const ICON = { improved: TrendingUp, declined: TrendingDown, strongest: Star, weakest: AlertTriangle, consistent: TrendingUp, info: Info };
const TONE = { improved: "text-emerald-700 bg-emerald-50", declined: "text-rose-700 bg-rose-50", strongest: "text-amber-800 bg-gold/15", weakest: "text-rose-700 bg-rose-50", consistent: "text-royal bg-royal/10", info: "text-muted bg-white/60" };

export async function PerformanceView({ studentId, subject }: { studentId: string; subject?: string }) {
  const rows = await publishedResultsForStudent(studentId);
  if (!rows.length) return <Card><EmptyState title="No published results to analyse yet" description="Analytics are computed only from officially published results." /></Card>;
  const terms = termAverages(rows);
  const insights = generateInsights(rows);
  const latest = terms[terms.length - 1];
  const prev = terms[terms.length - 2];
  const latestRows = rows.filter((r) => r.termId === latest.termId).sort((a, b) => b.total - a.total);
  const series = subjectSeries(rows);
  const subjects = [...series.keys()].sort();
  const chosen = subject && series.has(subject) ? subject : subjects[0];
  const sessions = new Map<string, number[]>();
  rows.forEach((r) => sessions.set(r.sessionName, [...(sessions.get(r.sessionName) ?? []), r.total]));
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Current average" value={`${latest.average}%`} hint={latest.label} />
        <Stat label="Change vs previous term" value={prev ? `${pointChange(prev.average, latest.average) > 0 ? "+" : ""}${pointChange(prev.average, latest.average)} pts` : "—"} tone={prev && latest.average >= prev.average ? "green" : "red"} hint="percentage points" />
        <Stat label="Best subject" value={latestRows[0]?.subject ?? "—"} tone="gold" hint={latestRows[0] ? `${latestRows[0].total}%` : undefined} />
        <Stat label={(latestRows[latestRows.length - 1]?.total ?? 100) < 50 ? "Needs improvement" : "Lowest subject"} value={latestRows[latestRows.length - 1]?.subject ?? "—"} tone={(latestRows[latestRows.length - 1]?.total ?? 100) < 50 ? "red" : "navy"} hint={latestRows.length ? `${latestRows[latestRows.length - 1].total}%` : undefined} />
      </div>
      <Card title="Personalised insights" description="Generated from your published results — changes are in percentage points.">
        <ul className="grid gap-2 md:grid-cols-2">{insights.map((i, k) => { const I = ICON[i.kind]; return <li key={k} className={cn("flex items-start gap-3 rounded-xl p-3 text-sm", TONE[i.kind])}><I className="mt-0.5 h-4 w-4 shrink-0" />{i.text}</li>; })}</ul>
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Term-by-term average">{terms.length > 1 ? <TrendChart data={terms.map((t) => ({ term: t.label.replace(/^\d{4}\/\d{4} /, ""), session: t.label, Average: t.average }))} xKey="term" lines={[{ key: "Average" }]} /> : <EmptyState title="Trend appears after a second published term" />}</Card>
        <Card title={`Subjects — ${latest.label}`}><BarsChart data={latestRows.map((r) => ({ subject: r.subject, Score: r.total }))} xKey="subject" bars={[{ key: "Score" }]} layout="vertical" domain={[0, 100]} height={Math.max(220, latestRows.length * 32)} /></Card>
        <Card title="Subject progress" actions={<form className="flex gap-2"><select name="subject" defaultValue={chosen} className="input min-h-[34px] py-1 text-sm" aria-label="Subject">{subjects.map((s) => <option key={s}>{s}</option>)}</select><button className="btn-secondary btn-sm">View</button></form>}>
          {chosen && <TrendChart data={(series.get(chosen) ?? []).map((s) => ({ term: s.termLabel.replace(/^\d{4}\/\d{4} /, ""), [chosen]: s.total }))} xKey="term" lines={[{ key: chosen }]} />}
        </Card>
        <Card title="Grade distribution (all published terms)"><BarsChart data={gradeDistribution(rows)} xKey="grade" bars={[{ key: "count", label: "Subjects" }]} /></Card>
      </div>
      {sessions.size > 1 && (
        <Card title="Session-by-session"><BarsChart data={[...sessions.entries()].map(([s, xs]) => ({ session: s, Average: Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 }))} xKey="session" bars={[{ key: "Average" }]} domain={[0, 100]} /></Card>
      )}
    </div>
  );
}

export async function ReportCardsView({ studentId }: { studentId: string }) {
  const cards = await db.reportCard.findMany({ where: { studentId, status: "ACTIVE", result: { status: "PUBLISHED" } }, include: { term: { include: { session: true } }, result: { include: { class: true } } }, orderBy: [{ term: { session: { startDate: "desc" } } }, { term: { order: "desc" } }] });
  if (!cards.length) return <Card><EmptyState title="No report cards yet" description="Report cards are generated when the school publishes term results." /></Card>;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((c) => (
        <Card key={c.id} title={termLabel(c.term)} description={c.result.class.name}>
          <p className="text-sm">Average <b>{c.result.average.toString()}%</b></p>
          <p className="mt-1 font-mono text-xs text-muted">{c.reference}</p>
          <p className="text-xs text-muted">Generated {formatDate(c.generatedAt)}{c.version > 1 && ` · version ${c.version}`}</p>
          {c.fileId && <div className="mt-3 flex gap-2"><a className="btn-primary btn-sm" href={`/api/files/${c.fileId}`} target="_blank"><Download className="h-4 w-4" /> View</a><a className="btn-secondary btn-sm" href={`/api/files/${c.fileId}?download=1`}>Download</a></div>}
        </Card>
      ))}
    </div>
  );
}

export async function AttendanceView({ studentId, termId }: { studentId: string; termId?: string }) {
  const term = termId ? await db.term.findUnique({ where: { id: termId }, include: { session: true } }) : await db.term.findFirst({ where: { isCurrent: true }, include: { session: true } });
  const [summary, records, terms] = await Promise.all([
    attendanceSummary(studentId, term?.id),
    db.attendanceRecord.findMany({ where: { studentId, session: { termId: term?.id } }, include: { session: { include: { offering: { include: { subject: true } } } } }, orderBy: { session: { date: "desc" } }, take: 60 }),
    db.term.findMany({ where: { attendanceSessions: { some: { records: { some: { studentId } } } } }, include: { session: true }, orderBy: [{ session: { startDate: "desc" } }, { order: "desc" }] }),
  ]);
  return (
    <div className="space-y-5">
      {terms.length > 0 && <form className="flex gap-2"><select name="term" defaultValue={term?.id} className="input max-w-xs" aria-label="Term">{terms.map((t) => <option key={t.id} value={t.id}>{termLabel(t)}</option>)}</select><button className="btn-secondary">View</button></form>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Attendance" value={summary.percentage === null ? "—" : `${summary.percentage}%`} hint={summary.percentage !== null ? <Progress value={summary.percentage} tone={summary.percentage >= 75 ? "green" : "red"} /> : term ? termLabel(term) : undefined} />
        <Stat label="Present" value={summary.present} tone="green" />
        <Stat label="Late" value={summary.late} tone="gold" />
        <Stat label="Absent" value={summary.absent} tone="red" />
        <Stat label="Excused" value={summary.excused} tone="navy" />
      </div>
      <Card title="Attendance records" description={summary.type === "DAILY" ? "Percentages use daily class registers. Lesson records are listed separately." : undefined}>
        {records.length ? (
          <div className="table-wrap"><table className="table"><thead><tr><th>Date</th><th>Register</th><th>Status</th><th>Remark</th></tr></thead>
            <tbody>{records.map((r) => <tr key={r.id}><td>{formatDate(r.session.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</td><td>{r.session.type === "DAILY" ? "Daily register" : r.session.offering?.subject.name}</td><td><StatusBadge status={r.status} /></td><td className="text-xs text-muted">{r.remark}</td></tr>)}</tbody></table></div>
        ) : <EmptyState title="No attendance recorded" />}
      </Card>
    </div>
  );
}

const DAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export async function ClassTimetableView({ studentId }: { studentId: string }) {
  const term = await db.term.findFirst({ where: { isCurrent: true } });
  const enr = term ? await db.studentEnrollment.findUnique({ where: { studentId_sessionId: { studentId, sessionId: term.sessionId } }, include: { class: true } }) : null;
  const tt = enr && term ? await db.timetable.findFirst({ where: { classId: enr.classId, termId: term.id, status: "PUBLISHED" }, include: { periods: { include: { period: true, offering: { include: { subject: true } }, teacher: true, classroom: true } } } }) : null;
  if (!tt) return <Card><EmptyState title="No published timetable" description="Your class timetable will appear here once the school publishes it." /></Card>;
  const [periods, settings] = await Promise.all([db.periodDefinition.findMany({ orderBy: { order: "asc" } }), db.schoolSettings.findUniqueOrThrow({ where: { id: "school" } })]);
  const days = settings.schoolDays.split(",").map(Number);
  const today = ((new Date().getUTCDay() + 6) % 7) + 1;
  return (
    <Card title={`${enr!.class.name} timetable`} actions={<a className="btn-secondary btn-sm" href={`/api/timetables/${tt.id}/pdf`} target="_blank"><Download className="h-4 w-4" /> PDF</a>}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-separate border-spacing-1 text-xs">
          <thead><tr><th className="w-28 text-left text-muted">Period</th>{days.map((d) => <th key={d} className={cn("rounded-lg p-1 text-left font-semibold", d === today ? "bg-royal text-white" : "text-navy")}>{DAYS[d]}</th>)}</tr></thead>
          <tbody>{periods.map((p) => (
            <tr key={p.id}>
              <td className="rounded-lg bg-white/50 p-2"><p className="font-semibold text-navy">{p.name}</p><p className="text-muted">{p.startTime}–{p.endTime}</p></td>
              {days.map((d) => {
                if (p.isBreak) return <td key={d} className="rounded-lg bg-gold/10 p-2 text-center text-amber-800">Break</td>;
                const c = tt.periods.find((x) => x.dayOfWeek === d && x.periodId === p.id);
                return <td key={d} className={cn("rounded-lg p-2 align-top", c ? "bg-royal/10" : "bg-white/40")}>{c ? <><p className="font-semibold text-navy">{c.offering?.subject.name ?? c.note}</p><p className="text-muted">{c.teacher?.fullName}{c.classroom && ` · ${c.classroom.name}`}</p></> : <span className="text-muted">—</span>}</td>;
              })}
            </tr>
          ))}</tbody>
        </table>
      </div>
    </Card>
  );
}
