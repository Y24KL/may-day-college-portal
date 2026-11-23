import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { PageHeader, Card, EmptyState, StatusBadge, FilterBar, Alert } from "@/components/ui";
import { ConfirmAction } from "@/components/ui/client";
import { publishClassResults } from "@/app/actions/admin/results";
import { getCurrentSessionTerm, termLabel } from "@/lib/academic";
import { termOptions } from "@/lib/options";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Results management" };

export default async function ResultsAdmin({ searchParams }: { searchParams: Promise<{ termId?: string; status?: string }> }) {
  const u = await requireAdminPage();
  if (!u.permissions.has("results.review") && !u.permissions.has("results.publish")) return <Alert tone="red">Permission required.</Alert>;
  const sp = await searchParams;
  const { term: current } = await getCurrentSessionTerm();
  const terms = await termOptions();
  const termId = sp.termId ?? current?.id ?? terms[0]?.id;
  const term = terms.find((t) => t.id === termId);
  const offerings = term ? await db.subjectOffering.findMany({ where: { sessionId: term.sessionId, isActive: true }, include: { subject: true, class: true, scoreSubmissions: { where: { termId } }, teacherAssignments: { where: { isActive: true }, include: { teacher: true } }, _count: { select: { registrationItems: true } } }, orderBy: [{ class: { name: "asc" } }, { subject: { name: "asc" } }] }) : [];
  const rows = offerings.filter((o) => !sp.status || (o.scoreSubmissions[0]?.status ?? "NOT_STARTED") === sp.status);
  const byClass = new Map<string, { classId: string; name: string; items: typeof offerings }>();
  for (const o of offerings) {
    const e = byClass.get(o.classId) ?? { classId: o.classId, name: o.class.name, items: [] };
    e.items.push(o);
    byClass.set(o.classId, e);
  }
  return (
    <div className="space-y-5">
      <PageHeader title="Results management" description="Teacher submits → academic office reviews (return or approve) → authorised officer publishes. Students and parents never see unpublished results." />
      <FilterBar>
        <select name="termId" defaultValue={termId} className="input max-w-[16rem]" aria-label="Term">{terms.map((t) => <option key={t.id} value={t.id}>{termLabel(t)}</option>)}</select>
        <select name="status" defaultValue={sp.status ?? ""} className="input max-w-[12rem]" aria-label="Status"><option value="">All statuses</option>{["NOT_STARTED", "DRAFT", "SUBMITTED", "RETURNED", "APPROVED", "PUBLISHED"].map((s) => <option key={s} value={s}>{s.replace("_", " ").toLowerCase()}</option>)}</select>
      </FilterBar>
      {u.permissions.has("results.publish") && byClass.size > 0 && (
        <Card title="Publish by class" description="Publishing locks approved sheets, computes averages & positions, generates report cards and notifies students and verified parents.">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[...byClass.values()].map((c) => {
              const st = c.items.map((o) => o.scoreSubmissions[0]?.status ?? "NOT_STARTED");
              const approved = st.filter((s) => s === "APPROVED").length, published = st.filter((s) => s === "PUBLISHED").length;
              const withStudents = c.items.filter((o) => o._count.registrationItems > 0).length;
              return (
                <div key={c.classId} className="rounded-2xl border border-lavender bg-white/60 p-4">
                  <p className="font-semibold text-navy">{c.name}</p>
                  <p className="text-xs text-muted">{approved} approved · {published} published · {withStudents} subject(s) with students</p>
                  <div className="mt-3">
                    {approved > 0 ? (
                      <ConfirmAction action={publishClassResults} fields={{ termId: termId!, classId: c.classId }} label={`Publish ${approved} sheet(s)`} className="btn-primary btn-sm" title={`Publish ${c.name} results`}
                        message={<>This publishes {approved} approved subject sheet(s) for {term ? termLabel(term) : ""}. {withStudents - approved - published > 0 && <b className="text-rose-700">{withStudents - approved - published} subject(s) are not yet approved and will be excluded.</b>} Published results are locked and can only be changed through the amendment procedure.</>}
                        requireText="PUBLISH" confirmLabel="Publish results" />
                    ) : <span className="text-xs text-muted">Nothing approved to publish.</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
      <Card title="Score sheets">
        {rows.length ? (
          <div className="table-wrap"><table className="table"><thead><tr><th>Class</th><th>Subject</th><th>Teacher</th><th>Students</th><th>Status</th><th>Submitted</th><th /></tr></thead>
            <tbody>{rows.map((o) => {
              const s = o.scoreSubmissions[0];
              return (
                <tr key={o.id}><td>{o.class.name}</td><td className="font-semibold text-navy">{o.subject.name}</td><td>{o.teacherAssignments.map((a) => a.teacher.fullName).join(", ") || <span className="text-amber-700">Unassigned</span>}</td><td>{o._count.registrationItems}</td>
                  <td>{s ? <StatusBadge status={s.status} /> : <span className="text-xs text-muted">Not started</span>}</td><td className="text-xs">{formatDateTime(s?.submittedAt)}</td>
                  <td className="text-right">{s && <Link href={`/admin/results/${s.id}`} className="btn-ghost btn-sm">{s.status === "SUBMITTED" ? "Review" : "Open"}</Link>}</td></tr>
              );
            })}</tbody></table></div>
        ) : <EmptyState title="No score sheets" description={term ? "Offer subjects and assign teachers to begin." : "Create a term first."} />}
      </Card>
    </div>
  );
}
