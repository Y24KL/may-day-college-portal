import { requireAdminPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { PageHeader, Card, EmptyState, StatusBadge, Badge, FilterBar } from "@/components/ui";
import { ModalForm, ConfirmAction } from "@/components/ui/client";
import { saveRegistrationConfig, reviewSubjectRegistration } from "@/app/actions/admin/academics";
import { getCurrentSessionTerm } from "@/lib/academic";
import { classOptions, sessionOptions } from "@/lib/options";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Subject registration" };

export default async function RegistrationAdmin({ searchParams }: { searchParams: Promise<{ sessionId?: string; status?: string }> }) {
  await requireAdminPage("registration.manage");
  const sp = await searchParams;
  const { session } = await getCurrentSessionTerm();
  const [sessions, classes] = await Promise.all([sessionOptions(), classOptions()]);
  const sessionId = sp.sessionId ?? session?.id ?? sessions[0]?.id;
  const [configs, regs, enrolled, regCounts] = await Promise.all([
    db.subjectRegistrationConfig.findMany({ where: { sessionId } }),
    db.subjectRegistration.findMany({ where: { sessionId, status: (sp.status as "SUBMITTED") ?? "SUBMITTED" }, include: { student: true, enrollment: { include: { class: true } }, items: { include: { offering: { include: { subject: true } } } } }, orderBy: { submittedAt: "asc" }, take: 100 }),
    db.studentEnrollment.groupBy({ by: ["classId"], where: { sessionId, status: "ACTIVE" }, _count: true }),
    db.subjectRegistration.groupBy({ by: ["status"], where: { sessionId }, _count: true }),
  ]);
  const cfg = (classId: string) => configs.find((c) => c.classId === classId);
  const now = new Date();
  return (
    <div className="space-y-5">
      <PageHeader title="Subject registration" description="Open registration windows per class, set elective limits and choose whether registrations need approval." />
      <FilterBar><select name="sessionId" defaultValue={sessionId} className="input max-w-[12rem]" aria-label="Session">{sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></FilterBar>
      <Card title="Registration windows" actions={sessionId && classes.length > 0 && (
        <ModalForm trigger="Configure classes" triggerClassName="btn-primary btn-sm" title="Registration settings" action={saveRegistrationConfig} wide>
          <input type="hidden" name="sessionId" value={sessionId} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label">Minimum electives</label><input name="minElectives" type="number" min={0} defaultValue={0} className="input" /></div>
            <div><label className="label">Maximum electives</label><input name="maxElectives" type="number" min={0} defaultValue={3} className="input" /></div>
            <div><label className="label">Opens</label><input name="opensAt" type="datetime-local" className="input" /></div>
            <div><label className="label">Closes</label><input name="closesAt" type="datetime-local" className="input" /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isOpen" defaultChecked className="h-4 w-4 accent-royal" /> Registration open</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="requiresApproval" className="h-4 w-4 accent-royal" /> Require administrator approval</label>
          </div>
          <p className="label mt-2">Apply to classes</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{classes.map((c) => <label key={c.id} className="flex items-center gap-2 rounded-lg bg-white/60 p-2 text-sm"><input type="checkbox" name="classIds" value={c.id} className="h-4 w-4 accent-royal" /> {c.name}</label>)}</div>
        </ModalForm>
      )}>
        {classes.length ? (
          <div className="table-wrap"><table className="table"><thead><tr><th>Class</th><th>Students</th><th>Electives</th><th>Window</th><th>Approval</th><th>Status</th></tr></thead>
            <tbody>{classes.map((c) => {
              const k = cfg(c.id);
              const open = k?.isOpen && (!k.opensAt || k.opensAt <= now) && (!k.closesAt || k.closesAt > now);
              return (
                <tr key={c.id}><td className="font-semibold text-navy">{c.name}</td><td>{enrolled.find((e) => e.classId === c.id)?._count ?? 0}</td>
                  <td>{k ? `${k.minElectives}–${k.maxElectives}` : "—"}</td><td className="text-xs">{k?.opensAt ? formatDateTime(k.opensAt) : "—"} → {k?.closesAt ? formatDateTime(k.closesAt) : "—"}</td>
                  <td>{k?.requiresApproval ? "Required" : "Automatic"}</td><td>{k ? (open ? <Badge tone="green">Open</Badge> : <Badge>Closed</Badge>) : <Badge tone="amber">Not configured</Badge>}</td></tr>
              );
            })}</tbody></table></div>
        ) : <EmptyState title="No classes configured" />}
      </Card>
      <Card title="Registrations" actions={<div className="flex gap-2">{(["SUBMITTED", "APPROVED"] as const).map((s) => <a key={s} href={`?sessionId=${sessionId}&status=${s}`} className={(sp.status ?? "SUBMITTED") === s ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>{s === "SUBMITTED" ? "Awaiting approval" : "Approved"} {regCounts.find((r) => r.status === s)?._count ?? 0}</a>)}</div>}>
        {regs.length ? (
          <ul className="space-y-3">{regs.map((r) => (
            <li key={r.id} className="rounded-xl bg-white/60 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><p className="font-semibold text-navy">{r.student.fullName} <span className="text-xs font-normal text-muted">{r.student.studentNumber} · {r.enrollment.class.name} · {r.reference}</span></p><p className="text-xs text-muted">{formatDateTime(r.submittedAt)}</p></div>
                <div className="flex items-center gap-2"><StatusBadge status={r.status} />
                  {r.status === "SUBMITTED" && <>
                    <ConfirmAction action={reviewSubjectRegistration} fields={{ registrationId: r.id, decision: "APPROVE" }} label="Approve" className="btn-primary btn-sm" title="Approve registration" message="Teachers will see this student in their subject lists." />
                    <ModalForm trigger="Return" triggerClassName="btn-secondary btn-sm" title="Return registration" action={reviewSubjectRegistration}><input type="hidden" name="registrationId" value={r.id} /><input type="hidden" name="decision" value="REJECT" /><textarea name="note" className="input" placeholder="What should the student change?" required /></ModalForm>
                  </>}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">{r.items.map((i) => <Badge key={i.id} tone={i.offering.isCompulsory ? "navy" : "blue"}>{i.offering.subject.name}</Badge>)}</div>
            </li>
          ))}</ul>
        ) : <EmptyState title="No registrations in this list" />}
      </Card>
    </div>
  );
}
