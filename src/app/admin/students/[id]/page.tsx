import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { getStudentFull } from "@/lib/people";
import { PageHeader, Card, DL, StatusBadge, EmptyState } from "@/components/ui";
import { ModalForm, ConfirmAction } from "@/components/ui/client";
import { updateStudentRecord, changeStudentClass, setUserStatus, resendParentInvitation, revokeRelationship } from "@/app/actions/admin/people";
import { createAdjustment } from "@/app/actions/admin/finance";
import { classOptions } from "@/lib/options";
import { studentBalance, obligationOutstanding } from "@/lib/finance";
import { attendanceSummary, termLabel } from "@/lib/academic";
import { formatDate, formatNaira, toDateInput, formatDateTime } from "@/lib/utils";

export default async function StudentDetail({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireAdminPage("students.view");
  const { id } = await params;
  const s = await getStudentFull(id);
  if (!s) notFound();
  const canManage = u.permissions.has("students.manage");
  const [classes, results, bal, att, payments] = await Promise.all([
    classOptions(),
    db.result.findMany({ where: { studentId: s.id }, include: { term: { include: { session: true } }, class: true, reportCards: { where: { status: "ACTIVE" } } }, orderBy: [{ term: { session: { startDate: "desc" } } }, { term: { order: "desc" } }] }),
    u.permissions.has("finance.view") || u.permissions.has("finance.verify") ? studentBalance(s.id) : null,
    attendanceSummary(s.id),
    db.paymentSubmission.findMany({ where: { studentId: s.id }, orderBy: { createdAt: "desc" }, take: 10, include: { term: true } }),
  ]);
  const active = s.enrollments.find((e) => e.status === "ACTIVE");
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={s.studentNumber} title={s.fullName} description={active ? `${active.class.name} · ${active.session.name}` : "No active enrollment"}
        actions={
          <>
            <Link href="/admin/students" className="btn-secondary">Back</Link>
            {canManage && (s.user.status === "ACTIVE" ? (
              <ConfirmAction action={setUserStatus} fields={{ userId: s.userId, status: "SUSPENDED", scope: "students" }} label="Suspend account" title="Suspend student account" message="The student will be signed out and blocked from the portal. Records are kept." danger confirmLabel="Suspend">
                <textarea name="reason" className="input" placeholder="Reason (recorded in the audit log)" />
              </ConfirmAction>
            ) : (
              <ConfirmAction action={setUserStatus} fields={{ userId: s.userId, status: "ACTIVE", scope: "students" }} label="Reactivate" title="Reactivate account" message="Allow this student to sign in again?" />
            ))}
          </>
        }
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Profile" className="lg:col-span-2" actions={canManage && (
          <ModalForm trigger="Edit" triggerClassName="btn-secondary btn-sm" title="Edit student record" action={updateStudentRecord}>
            <input type="hidden" name="studentId" value={s.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2"><label className="label">Full name</label><input name="fullName" className="input" defaultValue={s.fullName} required /></div>
              <div><label className="label">Date of birth</label><input type="date" name="dateOfBirth" className="input" defaultValue={toDateInput(s.dateOfBirth)} /></div>
              <div><label className="label">Gender</label><select name="gender" className="input" defaultValue={s.gender ?? ""}><option value="">—</option><option value="MALE">Male</option><option value="FEMALE">Female</option></select></div>
              <div className="sm:col-span-2"><label className="label">Address</label><input name="address" className="input" defaultValue={s.address ?? ""} /></div>
              <div><label className="label">Phone</label><input name="phone" className="input" defaultValue={s.phone ?? ""} /></div>
              <div><label className="label">Guardian name</label><input name="guardianName" className="input" defaultValue={s.guardianName ?? ""} /></div>
              <div><label className="label">Guardian phone</label><input name="guardianPhone" className="input" defaultValue={s.guardianPhone ?? ""} /></div>
            </div>
          </ModalForm>
        )}>
          <div className="flex flex-col gap-5 sm:flex-row">
            {s.photoFileId ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/files/${s.photoFileId}`} alt="" className="h-36 w-28 shrink-0 rounded-xl object-cover shadow-glass" />
            ) : <div className="grid h-36 w-28 place-items-center rounded-xl bg-lavender text-xs text-muted">No photo</div>}
            <DL items={[["Email", s.user.email], ["Account", <StatusBadge key="s" status={s.user.status} />], ["Date of birth", formatDate(s.dateOfBirth)], ["Gender", s.gender], ["Address", s.address], ["Guardian", `${s.guardianName ?? "—"} · ${s.guardianPhone ?? ""}`], ["Guardian email", s.guardianEmail], ["Last sign-in", formatDateTime(s.user.lastLoginAt)], ["Attendance (all terms)", att.percentage === null ? "No records" : `${att.percentage}% of ${att.total}`]]} />
          </div>
        </Card>
        <Card title="Enrollment history" description="Kept permanently across promotions.">
          <ul className="space-y-2">
            {s.enrollments.map((e) => (
              <li key={e.id} className="flex items-center justify-between rounded-xl bg-white/60 p-3 text-sm">
                <div><p className="font-semibold text-navy">{e.class.name}</p><p className="text-xs text-muted">{e.session.name}</p></div>
                <StatusBadge status={e.status} />
              </li>
            ))}
          </ul>
          {canManage && active && (
            <div className="mt-3">
              <ModalForm trigger="Change class / sector" triggerClassName="btn-secondary btn-sm w-full" title="Change class or sector" action={changeStudentClass}>
                <input type="hidden" name="enrollmentId" value={active.id} />
                <p className="text-sm text-muted">Only possible before subjects are registered and scores recorded. Unpaid bills of the old class are reversed and new bills generated.</p>
                <select name="classId" className="input" defaultValue={active.classId}>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                <textarea name="reason" className="input" placeholder="Reason (required, audited)" required />
              </ModalForm>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Parents & guardians" actions={u.permissions.has("parents.manage") && (
          <ModalForm trigger="Send invitation" triggerClassName="btn-secondary btn-sm" title="Invite a parent / guardian" action={resendParentInvitation} submitLabel="Send invitation">
            <input type="hidden" name="studentId" value={s.id} />
            <label className="label">Parent email</label><input name="email" type="email" className="input" defaultValue={s.guardianEmail ?? ""} required />
            <p className="help">The parent must sign in with this exact email to accept.</p>
          </ModalForm>
        )}>
          {s.parents.length ? (
            <ul className="space-y-2">
              {s.parents.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/60 p-3 text-sm">
                  <div><p className="font-semibold text-navy">{p.parent.fullName} <span className="text-xs font-normal text-muted">({p.relationship})</span></p><p className="text-xs text-muted">{p.parent.user.email} · {p.method === "INVITATION" ? "via invitation" : "admin verified"}</p></div>
                  <div className="flex items-center gap-2"><StatusBadge status={p.status} />
                    {p.status === "VERIFIED" && u.permissions.has("parents.manage") && (
                      <ConfirmAction action={revokeRelationship} fields={{ relationshipId: p.id }} label="Revoke" danger title="Revoke parent access" message="The parent will immediately lose access to this student's records."><input name="reason" className="input" placeholder="Reason" required /></ConfirmAction>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : <EmptyState title="No linked parents yet" />}
          {s.invitations.length > 0 && (
            <div className="mt-3 text-xs text-muted">
              <p className="font-semibold uppercase tracking-wide">Invitations</p>
              {s.invitations.map((i) => <p key={i.id}>{i.email} · <StatusBadge status={i.status} /> · expires {formatDate(i.expiresAt)}</p>)}
            </div>
          )}
        </Card>
        <Card title="Academic history" description="Published results only.">
          {results.length ? (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Term</th><th>Class</th><th>Average</th><th>Position</th><th /></tr></thead>
              <tbody>{results.map((r) => (
                <tr key={r.id}><td>{termLabel(r.term)}</td><td>{r.class.name}</td><td className="font-semibold">{r.average.toString()}%</td><td>{r.position ? `${r.position}/${r.classSize}` : "—"}</td>
                  <td className="text-right">{r.reportCards[0]?.fileId && (u.permissions.has("results.review") || u.permissions.has("results.publish")) && <a className="btn-ghost btn-sm" href={`/api/files/${r.reportCards[0].fileId}`} target="_blank">Report card</a>}</td></tr>
              ))}</tbody>
            </table></div>
          ) : <EmptyState title="No published results" />}
        </Card>
      </div>

      {bal && (
        <Card title="Fees & payments" actions={u.permissions.has("finance.adjust") && (
          <ModalForm trigger="Record adjustment" triggerClassName="btn-secondary btn-sm" title="Waiver, discount, surcharge or refund" action={createAdjustment}>
            <input type="hidden" name="studentId" value={s.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="label">Type</label><select name="type" className="input"><option value="WAIVER">Waiver</option><option value="DISCOUNT">Discount</option><option value="SURCHARGE">Surcharge</option><option value="REFUND">Refund (from credit)</option></select></div>
              <div><label className="label">Amount (₦)</label><input name="amount" className="input" inputMode="decimal" required /></div>
              <div className="sm:col-span-2"><label className="label">Applies to fee</label><select name="obligationId" className="input"><option value="">— (refund only)</option>{bal.obligations.map((o) => <option key={o.id} value={o.id}>{o.feeStructure.category.name} · {termLabel(o.term)} · outstanding {formatNaira(obligationOutstanding(o))}</option>)}</select></div>
              <div className="sm:col-span-2"><label className="label">Reason</label><textarea name="reason" className="input" required /></div>
            </div>
          </ModalForm>
        )}>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[["Billed", bal.payable], ["Paid", bal.paid], ["Adjustments", bal.adjusted], ["Outstanding", bal.outstanding]].map(([k, v]) => (
              <div key={k as string} className="rounded-xl bg-white/60 p-3"><p className="text-xs uppercase tracking-wide text-muted">{k as string}</p><p className="font-display text-lg font-bold text-navy">{formatNaira(v as never)}</p></div>
            ))}
          </div>
          {bal.credit.greaterThan(0) && <p className="mb-3 text-sm text-emerald-700">Credit balance (overpayment): {formatNaira(bal.credit)}</p>}
          {payments.length ? (
            <div className="table-wrap"><table className="table"><thead><tr><th>Reference</th><th>Term</th><th>Amount</th><th>Status</th><th /></tr></thead>
              <tbody>{payments.map((p) => <tr key={p.id}><td className="font-mono text-xs">{p.reference}</td><td>{p.term.name}</td><td>{formatNaira(p.amount)}</td><td><StatusBadge status={p.status} /></td><td className="text-right"><Link href={`/admin/payments/${p.id}`} className="btn-ghost btn-sm">Open</Link></td></tr>)}</tbody>
            </table></div>
          ) : <EmptyState title="No payment submissions" />}
        </Card>
      )}
    </div>
  );
}
