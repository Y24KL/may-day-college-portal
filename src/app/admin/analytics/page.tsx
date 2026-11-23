import { requireAdminPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { PageHeader, Card, EmptyState, FilterBar, Stat } from "@/components/ui";
import { BarsChart, TrendChart } from "@/components/charts";
import { getCurrentSessionTerm, termLabel } from "@/lib/academic";
import { termOptions, classOptions } from "@/lib/options";
import { round1 } from "@/lib/analytics";
import type { Prisma } from "@prisma/client";

export const metadata = { title: "Academic analytics" };

export default async function AdminAnalytics({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdminPage("reports.view");
  const sp = await searchParams;
  const { term: current } = await getCurrentSessionTerm();
  const [terms, classes, subjects, sectors] = await Promise.all([termOptions(), classOptions(), db.subject.findMany({ orderBy: { name: "asc" } }), db.academicSector.findMany()]);
  const termId = sp.termId ?? current?.id ?? terms[0]?.id;
  const where: Prisma.ResultDetailWhereInput = {
    termId,
    total: { not: null },
    submission: { status: "PUBLISHED", offering: { ...(sp.classId ? { classId: sp.classId } : {}), ...(sp.subjectId ? { subjectId: sp.subjectId } : {}), ...(sp.sectorId ? { class: { sectorId: sp.sectorId } } : {}) } },
    ...(sp.q ? { student: { OR: [{ fullName: { contains: sp.q, mode: "insensitive" } }, { studentNumber: sp.q }] } } : {}),
  };
  const details = await db.resultDetail.findMany({ where, select: { total: true, grade: true, studentId: true, submission: { select: { offering: { select: { subject: { select: { name: true } }, class: { select: { name: true } } } } } } } });
  const avg = (xs: number[]) => (xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
  const group = (key: (d: (typeof details)[number]) => string) => {
    const m = new Map<string, number[]>();
    for (const d of details) m.set(key(d), [...(m.get(key(d)) ?? []), Number(d.total)]);
    return [...m.entries()].map(([name, xs]) => ({ name, Average: avg(xs), n: xs.length })).sort((a, b) => b.Average - a.Average);
  };
  const bySubject = group((d) => d.submission.offering.subject.name);
  const byClass = group((d) => d.submission.offering.class.name);
  const grades = new Map<string, number>();
  details.forEach((d) => d.grade && grades.set(d.grade, (grades.get(d.grade) ?? 0) + 1));
  const pass = details.filter((d) => Number(d.total) >= 50).length;
  // Trend across terms for the same filters (school average per term)
  const trendRows = await db.result.groupBy({ by: ["termId"], where: { status: "PUBLISHED", ...(sp.classId ? { classId: sp.classId } : {}) }, _avg: { average: true } });
  const trend = trendRows.map((r) => ({ t: terms.find((x) => x.id === r.termId), avg: Number(r._avg.average ?? 0) })).filter((x) => x.t).sort((a, b) => a.t!.session.startDate.getTime() - b.t!.session.startDate.getTime() || a.t!.order - b.t!.order).map((x) => ({ term: termLabel(x.t!), Average: round1(x.avg) }));
  return (
    <div className="space-y-5">
      <PageHeader title="Academic analytics" description="School-wide performance from published results only." />
      <FilterBar>
        <select name="termId" defaultValue={termId} className="input max-w-[15rem]" aria-label="Term">{terms.map((t) => <option key={t.id} value={t.id}>{termLabel(t)}</option>)}</select>
        <select name="classId" defaultValue={sp.classId ?? ""} className="input max-w-[12rem]" aria-label="Class"><option value="">All classes</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select name="sectorId" defaultValue={sp.sectorId ?? ""} className="input max-w-[11rem]" aria-label="Sector"><option value="">All sectors</option>{sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select name="subjectId" defaultValue={sp.subjectId ?? ""} className="input max-w-[12rem]" aria-label="Subject"><option value="">All subjects</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <input name="q" defaultValue={sp.q} placeholder="Student name / ID" className="input max-w-[12rem]" aria-label="Student" />
      </FilterBar>
      {details.length ? (<>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Average score" value={`${avg(details.map((d) => Number(d.total)))}%`} />
          <Stat label="Pass rate (≥50)" value={`${round1((pass / details.length) * 100)}%`} tone="green" />
          <Stat label="Subject results" value={details.length} tone="navy" />
          <Stat label="Students" value={new Set(details.map((d) => d.studentId)).size} tone="gold" />
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Average by subject"><BarsChart data={bySubject} xKey="name" bars={[{ key: "Average" }]} layout="vertical" domain={[0, 100]} height={Math.max(220, bySubject.length * 30)} /></Card>
          <Card title="Average by class"><BarsChart data={byClass} xKey="name" bars={[{ key: "Average" }]} domain={[0, 100]} /></Card>
          <Card title="Grade distribution"><BarsChart data={[...grades.entries()].sort().map(([g, c]) => ({ g, Count: c }))} xKey="g" bars={[{ key: "Count" }]} /></Card>
          <Card title="Average across terms">{trend.length > 1 ? <TrendChart data={trend} xKey="term" lines={[{ key: "Average" }]} /> : <EmptyState title="Needs more than one published term" />}</Card>
        </div>
      </>) : <Card><EmptyState title="No published results match these filters" /></Card>}
    </div>
  );
}
