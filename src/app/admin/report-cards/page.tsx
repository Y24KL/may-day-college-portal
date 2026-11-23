import { requireAdminPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { PageHeader, Card, EmptyState, StatusBadge, FilterBar } from "@/components/ui";
import { ActionForm, SubmitButton, ModalForm, ConfirmAction } from "@/components/ui/client";
import { saveReportTemplate, regenerateClassReportCards, saveResultRemarks, bulkPrincipalRemark } from "@/app/actions/admin/results";
import { getCurrentSessionTerm, termLabel } from "@/lib/academic";
import { termOptions, classOptions } from "@/lib/options";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Report card management" };

export default async function ReportCardsAdmin({ searchParams }: { searchParams: Promise<{ termId?: string; classId?: string }> }) {
  const u = await requireAdminPage();
  const sp = await searchParams;
  const { term: current } = await getCurrentSessionTerm();
  const [terms, classes, template] = await Promise.all([termOptions(), classOptions(), db.reportCardTemplate.findFirst({ where: { isDefault: true } })]);
  const termId = sp.termId ?? current?.id ?? terms[0]?.id;
  const classId = sp.classId ?? classes[0]?.id;
  const results = termId && classId ? await db.result.findMany({ where: { termId, classId }, include: { student: true, reportCards: { orderBy: { version: "desc" } } }, orderBy: { position: "asc" } }) : [];
  const canPublish = u.permissions.has("results.publish");
  const options = (template?.commentOptions ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return (
    <div className="space-y-5">
      <PageHeader title="Report card management" description="Report cards are generated only from published results and carry a unique reference and QR verification code." />
      {u.permissions.has("reportcards.configure") && template && (
        <Card title="Template">
          <ActionForm action={saveReportTemplate} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="templateId" value={template.id} />
            <div><label className="label">Principal's name</label><input name="principalName" className="input" defaultValue={template.principalName ?? ""} /></div>
            <div><label className="label">Signature labels (comma-separated)</label><input name="signatureLabels" className="input" defaultValue={template.signatureLabels} /></div>
            <div className="sm:col-span-2"><label className="label">Footer note</label><input name="footerNote" className="input" defaultValue={template.footerNote ?? ""} /></div>
            <div className="sm:col-span-2"><label className="label">Stock remarks (comma-separated)</label><input name="commentOptions" className="input" defaultValue={template.commentOptions ?? ""} placeholder="Excellent result, keep it up, A good result — aim higher, …" /></div>
            <div className="flex flex-wrap gap-4 text-sm sm:col-span-2">
              {(["showPosition", "showAttendance", "showGradingKey", "showStampArea"] as const).map((k) => <label key={k} className="flex items-center gap-2"><input type="checkbox" name={k} defaultChecked={template[k]} className="h-4 w-4 accent-royal" /> {k.replace("show", "Show ").replace(/([A-Z])/g, " $1").trim()}</label>)}
            </div>
            <div className="sm:col-span-2"><SubmitButton className="btn-secondary">Save template</SubmitButton></div>
          </ActionForm>
        </Card>
      )}
      <FilterBar>
        <select name="termId" defaultValue={termId} className="input max-w-[16rem]" aria-label="Term">{terms.map((t) => <option key={t.id} value={t.id}>{termLabel(t)}</option>)}</select>
        <select name="classId" defaultValue={classId} className="input max-w-[14rem]" aria-label="Class">{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      </FilterBar>
      <Card title="Students" actions={canPublish && results.length > 0 && <>
        <ModalForm trigger="Bulk principal remark" triggerClassName="btn-secondary btn-sm" title="Apply principal's remark by average range" action={bulkPrincipalRemark}>
          <input type="hidden" name="termId" value={termId} /><input type="hidden" name="classId" value={classId} />
          <div className="grid grid-cols-2 gap-3"><div><label className="label">Average from</label><input name="minAverage" type="number" className="input" defaultValue={70} /></div><div><label className="label">to</label><input name="maxAverage" type="number" className="input" defaultValue={100} /></div></div>
          <input name="remark" className="input" list="remark-options" placeholder="Remark" required />
          <datalist id="remark-options">{options.map((o) => <option key={o} value={o} />)}</datalist>
        </ModalForm>
        <ConfirmAction action={regenerateClassReportCards} fields={{ termId: termId!, classId: classId! }} label="Regenerate all" className="btn-primary btn-sm" title="Regenerate report cards" message="New versions are created with current remarks and template. Previous versions are kept as superseded." />
      </>}>
        {results.length ? (
          <div className="table-wrap"><table className="table"><thead><tr><th>Pos.</th><th>Student</th><th>Average</th><th>Remarks</th><th>Report card</th></tr></thead>
            <tbody>{results.map((r) => {
              const active = r.reportCards.find((c) => c.status === "ACTIVE");
              return (
                <tr key={r.id}><td>{r.position ?? "—"}</td><td><p className="font-medium text-navy">{r.student.fullName}</p><p className="text-xs text-muted">{r.student.studentNumber}</p></td><td className="font-semibold">{r.average.toString()}%</td>
                  <td className="max-w-xs text-xs">
                    <p><span className="text-muted">Class teacher:</span> {r.classTeacherRemark ?? "—"}</p><p><span className="text-muted">Principal:</span> {r.principalRemark ?? "—"}</p>
                    {canPublish && <ModalForm trigger="Edit remarks" triggerClassName="btn-ghost btn-sm mt-1" title={`Remarks — ${r.student.fullName}`} action={saveResultRemarks}>
                      <input type="hidden" name="resultId" value={r.id} />
                      <label className="label">Class teacher's remark</label><input name="classTeacherRemark" className="input" list="remark-options" defaultValue={r.classTeacherRemark ?? ""} />
                      <label className="label">Principal's remark</label><input name="principalRemark" className="input" list="remark-options" defaultValue={r.principalRemark ?? ""} />
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="regenerate" defaultChecked className="h-4 w-4 accent-royal" /> Regenerate report card</label>
                    </ModalForm>}
                  </td>
                  <td className="text-xs">{active ? <><a className="btn-secondary btn-sm" href={`/api/files/${active.fileId}`} target="_blank">v{active.version} PDF</a><p className="mt-1 font-mono text-muted">{active.reference}</p><p className="text-muted">{formatDateTime(active.generatedAt)}</p></> : <StatusBadge status="PENDING" />}
                    {r.reportCards.length > 1 && <p className="text-muted">{r.reportCards.length - 1} earlier version(s)</p>}</td></tr>
              );
            })}</tbody></table></div>
        ) : <EmptyState title="No published results for this class and term" />}
      </Card>
    </div>
  );
}
