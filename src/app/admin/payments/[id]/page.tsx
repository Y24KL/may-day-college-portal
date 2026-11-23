import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { PageHeader, Card, DL, StatusBadge, Alert, EmptyState } from "@/components/ui";
import { ActionForm, SubmitButton, ModalForm } from "@/components/ui/client";
import { approvePayment, rejectPayment } from "@/app/actions/admin/finance";
import { studentBalance } from "@/lib/finance";
import { termLabel } from "@/lib/academic";
import { formatNaira, formatDate, formatDateTime } from "@/lib/utils";
import { FileText, ShieldAlert } from "lucide-react";

export default async function PaymentDetail({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireAdminPage();
  const { id } = await params;
  const p = await db.paymentSubmission.findUnique({ where: { id }, include: { student: true, term: { include: { session: true } }, receipts: { include: { file: true } }, payment: { include: { allocations: { include: { obligation: { include: { feeStructure: { include: { category: true } }, term: true } } } } } } } });
  if (!p) notFound();
  if (!u.permissions.has("finance.verify") && !u.permissions.has("finance.view")) notFound();
  const [bal, dupes] = await Promise.all([
    studentBalance(p.studentId),
    db.paymentSubmission.findMany({ where: { id: { not: p.id }, bankReference: { equals: p.bankReference, mode: "insensitive" } }, include: { student: true } }),
  ]);
  const reviewer = p.reviewedById ? await db.user.findUnique({ where: { id: p.reviewedById }, select: { email: true } }) : null;
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={p.reference} title={`${formatNaira(p.amount)} — ${p.student.fullName}`} description={termLabel(p.term)} actions={<Link href="/admin/payments" className="btn-secondary">Back</Link>} />
      {dupes.length > 0 && <Alert tone="red" title="Duplicate bank reference">This bank reference also appears on: {dupes.map((d) => `${d.reference} (${d.student.fullName}, ${d.status.toLowerCase()})`).join("; ")}. Check carefully.</Alert>}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Submission" className="lg:col-span-2" actions={<StatusBadge status={p.status} />}>
          <DL items={[["Student", `${p.student.fullName} (${p.student.studentNumber})`], ["Amount", formatNaira(p.amount)], ["Payment date", formatDate(p.paymentDate)], ["Bank transfer reference", <span key="r" className="font-mono">{p.bankReference}</span>], ["Description", p.description], ["Submitted", formatDateTime(p.createdAt)], ["Reviewed", p.reviewedAt ? `${formatDateTime(p.reviewedAt)} by ${reviewer?.email ?? "—"}` : "—"], ["Rejection reason", p.rejectionReason]]} />
          <div className="mt-4"><p className="label">Uploaded receipts</p>
            <div className="flex flex-wrap gap-2">{p.receipts.map((r) => <a key={r.id} className="btn-secondary btn-sm" href={`/api/files/${r.fileId}`} target="_blank" rel="noopener"><FileText className="h-4 w-4" /> {r.file.originalName}</a>)}{!p.receipts.length && <span className="text-sm text-muted">None</span>}</div>
          </div>
          {p.payment && (
            <div className="mt-5"><p className="label">Allocation ({p.payment.confirmationNumber})</p>
              <ul className="space-y-1 text-sm">{p.payment.allocations.map((a) => <li key={a.id} className="flex justify-between"><span>{a.obligation.feeStructure.category.name} · {a.obligation.term.name}</span><b>{formatNaira(a.amount)}</b></li>)}</ul>
            </div>
          )}
        </Card>
        <div className="space-y-5">
          {p.status === "PENDING" && u.permissions.has("finance.verify") && (
            <Card title="Verify">
              <Alert tone="amber"><span className="flex gap-2"><ShieldAlert className="h-4 w-4 shrink-0" /> Check the school bank statement for a credit of {formatNaira(p.amount)} with reference <b>{p.bankReference}</b> on or about {formatDate(p.paymentDate)}.</span></Alert>
              <ActionForm action={approvePayment} className="mt-3 space-y-3">
                <input type="hidden" name="submissionId" value={p.id} />
                <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirmFunds" required className="mt-0.5 h-4 w-4 accent-royal" /> I have confirmed these funds have been received in the school&apos;s bank account.</label>
                <textarea name="note" className="input" placeholder="Internal note (optional)" />
                <SubmitButton className="btn-primary w-full" pendingText="Recording…">Approve payment</SubmitButton>
              </ActionForm>
              <div className="mt-2">
                <ModalForm trigger="Reject submission" triggerClassName="btn-secondary w-full" title="Reject payment submission" action={rejectPayment} submitClassName="btn-danger" submitLabel="Reject">
                  <input type="hidden" name="submissionId" value={p.id} />
                  <textarea name="reason" className="input min-h-[100px]" placeholder="e.g. No matching credit found on the bank statement for this reference." required />
                </ModalForm>
              </div>
            </Card>
          )}
          <Card title="Student balance">
            <div className="space-y-2 text-sm">
              <p className="flex justify-between"><span className="text-muted">Billed</span><b>{formatNaira(bal.payable)}</b></p>
              <p className="flex justify-between"><span className="text-muted">Paid (verified)</span><b>{formatNaira(bal.paid)}</b></p>
              <p className="flex justify-between"><span className="text-muted">Adjustments</span><b>{formatNaira(bal.adjusted)}</b></p>
              <p className="flex justify-between"><span className="text-muted">Outstanding</span><b className="text-rose-700">{formatNaira(bal.outstanding)}</b></p>
              {bal.credit.greaterThan(0) && <p className="flex justify-between"><span className="text-muted">Credit</span><b className="text-emerald-700">{formatNaira(bal.credit)}</b></p>}
            </div>
            {!bal.obligations.length && <EmptyState title="No fee bills" />}
            <Link href={`/admin/students/${p.studentId}`} className="btn-ghost btn-sm mt-3">Student record →</Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
