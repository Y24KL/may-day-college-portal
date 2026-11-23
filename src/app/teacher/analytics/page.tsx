import { requireTeacherPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { teacherOfferings } from "@/lib/teacher";
import { termLabel } from "@/lib/academic";
import { round1 } from "@/lib/analytics";
import { PageHeader, Card, EmptyState, Stat } from "@/components/ui";
import { BarsChart, TrendChart } from "@/components/charts";

export const metadata = { title: "Academic analytics" };

export default async function TeacherAnalytics({ searchParams }: { searchParams: Promise<{ offering?: string }> }) {
  const u = await requireTeacherPage();
  const sp = await searchParams;
  const offerings = await teacherOfferings(u.teacherId);
  const offering = offerings.find((o) => o.id === sp.offering) ?? offerings[0];
  if (!offering) return <><PageHeader title="Academic analytics" /><Card><EmptyState title="No assigned subjects" /></Card></>;
  // Only students taking this teacher's subject; all statuses of the teacher's own sheets.
  const sheets = await db.scoreSubmission.findMany({ where: { offeringId: offering.id }, include: { term: { include: { session: true } }, details: { include: { student: true } } }, orderBy: { term: { order: "asc" } } });
  const latest = sheets[sheets.length - 1];
  const totals = latest?.details.filter((d) => d.total !== null).map((d) => ({ name: d.student.fullName, total: Number(d.total), grade: d.grade })) ?? [];
  const avg = totals.length ? round1(totals.reduce((a, b) => a + b.total, 0) / totals.length) : null;
  const grades = new Map<string, number>();
  totals.forEach((t) => t.grade && grades.set(t.grade, (grades.get(t.grade) ?? 0) + 1));
  return (
    <div className="space-y-5">
      <PageHeader title="Academic analytics" description="Performance of students taking your assigned subjects." />
      <form className="flex gap-2"><select name="offering" defaultValue={offering.id} className="input max-w-sm" aria-label="Subject">{offerings.map((o) => <option key={o.id} value={o.id}>{o.subject.name} · {o.class.name}</option>)}</select><button className="btn-secondary">View</button></form>
      {!totals.length ? <Card><EmptyState title="No scores entered yet" /></Card> : (<>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Average" value={`${avg}%`} hint={termLabel(latest.term)} />
          <Stat label="Highest" value={Math.max(...totals.map((t) => t.total))} tone="green" />
          <Stat label="Lowest" value={Math.min(...totals.map((t) => t.total))} tone="red" />
          <Stat label="Pass rate (≥50)" value={`${round1((totals.filter((t) => t.total >= 50).length / totals.length) * 100)}%`} tone="gold" />
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Grade distribution"><BarsChart data={[...grades.entries()].sort().map(([g, c]) => ({ g, Students: c }))} xKey="g" bars={[{ key: "Students" }]} /></Card>
          <Card title="Average by term">{sheets.length > 1 ? <TrendChart data={sheets.map((s) => { const xs = s.details.filter((d) => d.total !== null).map((d) => Number(d.total)); return { term: s.term.name, Average: xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null }; })} xKey="term" lines={[{ key: "Average" }]} /> : <EmptyState title="Needs more than one term" />}</Card>
        </div>
        <Card title="Students needing support (below 50)">
          {totals.filter((t) => t.total < 50).length ? <ul className="flex flex-wrap gap-2 text-sm">{totals.filter((t) => t.total < 50).sort((a, b) => a.total - b.total).map((t) => <li key={t.name} className="rounded-xl bg-rose-50 px-3 py-1.5 text-rose-800">{t.name} · {t.total}</li>)}</ul> : <EmptyState title="Everyone scored 50 or above" />}
        </Card>
      </>)}
    </div>
  );
}
