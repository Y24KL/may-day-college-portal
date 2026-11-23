import { requireAdminPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { PageHeader, Card, EmptyState, StatusBadge, FilterBar, Pagination } from "@/components/ui";
import { ModalForm, ConfirmAction } from "@/components/ui/client";
import { reviewLinkRequest, revokeRelationship, verifyRelationship, setUserStatus } from "@/app/actions/admin/people";
import { formatDateTime, pageParams } from "@/lib/utils";

export const metadata = { title: "Parent management" };

export default async function ParentsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const u = await requireAdminPage("parents.view");
  const sp = await searchParams;
  const { page, skip, take, pageSize } = pageParams(sp);
  const where = sp.q ? { OR: [{ fullName: { contains: sp.q, mode: "insensitive" as const } }, { user: { email: { contains: sp.q, mode: "insensitive" as const } } }, { phone: { contains: sp.q } }] } : {};
  const [requests, parents, total] = await Promise.all([
    db.parentLinkRequest.findMany({ where: { status: "PENDING" }, include: { parent: { include: { user: true } } }, orderBy: { createdAt: "asc" } }),
    db.parent.findMany({ where, skip, take, orderBy: { fullName: "asc" }, include: { user: true, relationships: { include: { student: true } } } }),
    db.parent.count({ where }),
  ]);
  // Suggest candidate students for each request (by student number or name).
  const candidates = await Promise.all(
    requests.map((r) => db.student.findMany({ where: { OR: [...(r.childStudentNumber ? [{ studentNumber: r.childStudentNumber }] : []), { fullName: { contains: r.childFullName.split(" ")[0], mode: "insensitive" as const } }] }, take: 10, select: { id: true, fullName: true, studentNumber: true, guardianEmail: true } })),
  );
  const manage = u.permissions.has("parents.manage");
  return (
    <div className="space-y-5">
      <PageHeader title="Parent management" description="Parents only see children whose relationships are VERIFIED (by invitation to the registered guardian email, or by an administrator)." />
      <Card title="Pending link requests" description="Verify the relationship offline (e.g. ID check at the school office) before approving.">
        {requests.length ? (
          <ul className="space-y-3">
            {requests.map((r, i) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/60 p-4 text-sm">
                <div>
                  <p className="font-semibold text-navy">{r.parent.fullName} <span className="font-normal text-muted">({r.parent.user.email}, {r.parent.phone})</span></p>
                  <p>Requests access to <b>{r.childFullName}</b>{r.childStudentNumber && <> · ID {r.childStudentNumber}</>} as <b>{r.relationship}</b></p>
                  {r.details && <p className="text-xs text-muted">“{r.details}”</p>}
                  <p className="text-xs text-muted">{formatDateTime(r.createdAt)}</p>
                </div>
                {manage && (
                  <div className="flex gap-2">
                    <ModalForm trigger="Approve" triggerClassName="btn-primary btn-sm" title="Verify and link" action={reviewLinkRequest} submitLabel="Link verified child">
                      <input type="hidden" name="requestId" value={r.id} /><input type="hidden" name="decision" value="APPROVE" />
                      <label className="label">Student</label>
                      <select name="studentId" className="input" required>
                        <option value="">Select the verified student…</option>
                        {candidates[i].map((c) => <option key={c.id} value={c.id}>{c.fullName} · {c.studentNumber}{c.guardianEmail === r.parent.user.email ? " · guardian email matches" : ""}</option>)}
                      </select>
                      <textarea name="note" className="input" placeholder="How was the relationship verified? (audited)" />
                    </ModalForm>
                    <ModalForm trigger="Reject" triggerClassName="btn-secondary btn-sm" title="Reject request" action={reviewLinkRequest} submitLabel="Reject">
                      <input type="hidden" name="requestId" value={r.id} /><input type="hidden" name="decision" value="REJECT" />
                      <textarea name="note" className="input" placeholder="Reason shown to the parent" required />
                    </ModalForm>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : <EmptyState title="No pending requests" />}
      </Card>
      <Card title="Parents">
        <FilterBar><input name="q" defaultValue={sp.q} placeholder="Name, email or phone" className="input max-w-xs" aria-label="Search" /></FilterBar>
        {parents.length ? (
          <div className="table-wrap"><table className="table"><thead><tr><th>Parent</th><th>Children</th><th>Account</th><th /></tr></thead>
            <tbody>{parents.map((p) => (
              <tr key={p.id}>
                <td><p className="font-semibold text-navy">{p.fullName}</p><p className="text-xs text-muted">{p.user.email} · {p.phone}</p></td>
                <td>
                  <ul className="space-y-1">{p.relationships.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-medium">{r.student.fullName}</span><StatusBadge status={r.status} />
                      {manage && r.status === "VERIFIED" && <ConfirmAction action={revokeRelationship} fields={{ relationshipId: r.id }} label="Revoke" danger title="Revoke access" message={`Remove ${p.fullName}'s access to ${r.student.fullName}?`}><input name="reason" className="input" placeholder="Reason" required /></ConfirmAction>}
                      {manage && r.status !== "VERIFIED" && <ConfirmAction action={verifyRelationship} fields={{ relationshipId: r.id }} label="Verify" title="Verify relationship" message="Confirm you have verified this relationship." />}
                    </li>
                  ))}{!p.relationships.length && <li className="text-xs text-muted">None linked</li>}</ul>
                </td>
                <td><StatusBadge status={p.user.emailVerifiedAt ? p.user.status : "PENDING"} /></td>
                <td className="text-right">{manage && (p.user.status === "ACTIVE"
                  ? <ConfirmAction action={setUserStatus} fields={{ userId: p.userId, status: "SUSPENDED", scope: "parents" }} label="Deactivate" danger title="Deactivate parent" message="Blocks this parent from signing in." />
                  : <ConfirmAction action={setUserStatus} fields={{ userId: p.userId, status: "ACTIVE", scope: "parents" }} label="Activate" title="Activate parent" message="Allow sign-in again?" />)}</td>
              </tr>
            ))}</tbody></table></div>
        ) : <EmptyState title="No parents found" />}
        <Pagination page={page} pageSize={pageSize} total={total} basePath="/admin/parents" params={{ q: sp.q }} />
      </Card>
    </div>
  );
}
