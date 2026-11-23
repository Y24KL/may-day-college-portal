import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { PageHeader, Card, EmptyState, StatusBadge, FilterBar, Alert } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { createTimetable } from "@/app/actions/admin/operations";
import { savePeriods } from "@/app/actions/admin/academics";
import { getCurrentSessionTerm, termLabel } from "@/lib/academic";
import { termOptions, classOptions } from "@/lib/options";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Timetable management" };

export default async function TimetablesAdmin({ searchParams }: { searchParams: Promise<{ termId?: string }> }) {
  await requireAdminPage("timetable.manage");
  const sp = await searchParams;
  const { term: current } = await getCurrentSessionTerm();
  const [terms, classes, periods] = await Promise.all([termOptions(), classOptions(), db.periodDefinition.findMany({ orderBy: { order: "asc" } })]);
  const termId = sp.termId ?? current?.id ?? terms[0]?.id;
  const timetables = termId ? await db.timetable.findMany({ where: { termId }, include: { class: true, _count: { select: { periods: true } } }, orderBy: [{ class: { name: "asc" } }, { createdAt: "desc" }] }) : [];
  return (
    <div className="space-y-5">
      <PageHeader title="Timetable management" description="Build per-class timetables for each term. Teacher, class and classroom double-bookings are detected and block publication." />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Bell schedule" description="School-wide lesson times and breaks." className="lg:col-span-1">
          <ActionForm action={savePeriods} className="space-y-2">
            <textarea name="periods" className="input min-h-[240px] font-mono text-xs" defaultValue={periods.map((p) => [p.name, p.startTime, p.endTime, p.isBreak ? "break" : ""].filter(Boolean).join(", ")).join("\n")} placeholder={"Period 1, 08:00, 08:40\nPeriod 2, 08:40, 09:20\nBreak, 10:00, 10:30, break"} required />
            <p className="help">One per line: Name, Start, End[, break]</p>
            <SubmitButton className="btn-secondary btn-sm">Save bell schedule</SubmitButton>
          </ActionForm>
        </Card>
        <Card title="Timetables" className="lg:col-span-2" actions={termId && periods.length > 0 && (
          <ActionForm action={createTimetable} className="flex flex-wrap gap-2">
            <input type="hidden" name="termId" value={termId} />
            <select name="classId" className="input min-h-[34px] py-1 text-sm" aria-label="Class">{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <SubmitButton className="btn-primary btn-sm">New / edit draft</SubmitButton>
          </ActionForm>
        )}>
          <FilterBar><select name="termId" defaultValue={termId} className="input max-w-[16rem]" aria-label="Term">{terms.map((t) => <option key={t.id} value={t.id}>{termLabel(t)}</option>)}</select></FilterBar>
          {!periods.length && <Alert tone="amber">Define the bell schedule first.</Alert>}
          {timetables.length ? (
            <div className="table-wrap"><table className="table"><thead><tr><th>Class</th><th>Status</th><th>Lessons</th><th>Published</th><th /></tr></thead>
              <tbody>{timetables.map((t) => <tr key={t.id}><td className="font-semibold text-navy">{t.class.name}</td><td><StatusBadge status={t.status} /></td><td>{t._count.periods}</td><td className="text-xs">{formatDateTime(t.publishedAt)}</td><td className="text-right"><Link className="btn-ghost btn-sm" href={`/admin/timetables/${t.id}`}>{t.status === "DRAFT" ? "Edit" : "View"}</Link></td></tr>)}</tbody></table></div>
          ) : <EmptyState title="No timetables for this term" />}
        </Card>
      </div>
    </div>
  );
}
