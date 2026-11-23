import { db } from "@/lib/db";
import { studentBalance, obligationOutstanding } from "@/lib/finance";
import { termLabel } from "@/lib/academic";
import { Card, EmptyState, StatusBadge, Stat, Alert, DL } from "@/components/ui";
import { CopyButton } from "@/components/ui/client";
import { formatNaira, formatDate, formatDateTime } from "@/lib/utils";
import { Download } from "lucide-react";

export async function FeesView({ studentId, showBank = true }: { studentId: string; showBank?: boolean }) {
  const [settings, term, all] = await Promise.all([db.schoolSettings.findUniqueOrThrow({ where: { id: "school" } }), db.term.findFirst({ where: { isCurrent: true }, include: { session: true } }), studentBalance(studentId)]);
  const current = term ? all.obligations.filter((o) => o.termId === term.id) : [];
  const sum = (xs: typeof current, f: (o: (typeof current)[number]) => number) => xs.reduce((s, o) => s + f(o), 0);
  const payable = sum(current, (o) => Number(o.amount) - Number(o.amountAdjusted));
  const paid = sum(current, (o) => Number(o.amountPaid));
  const outstanding = sum(current, (o) => Number(obligationOutstanding(o)));
  const deadline = current.map((o) => o.dueDate).filter(Boolean).sort((a, b) => a!.getTime() - b!.getTime())[0];
  const status = !current.length ? "—" : outstanding <= 0 ? "PAID" : paid > 0 ? "PARTIAL" : "UNPAID";
  const student = await db.student.findUniqueOrThrow({ where: { id: studentId }, select: { studentNumber: true } });
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Amount payable" value={formatNaira(payable)} hint={term ? termLabel(term) : "No current term"} />
        <Stat label="Amount paid (verified)" value={formatNaira(paid)} tone="green" />
        <Stat label="Outstanding" value={formatNaira(outstanding)} tone={outstanding > 0 ? "red" : "green"} hint={deadline ? `Deadline ${formatDate(deadline)}` : undefined} />
        <Stat label="Status" value={status === "—" ? "—" : <StatusBadge status={status} />} tone="navy" />
      </div>
      {all.credit.greaterThan(0) && <Alert tone="green">You have a credit balance of {formatNaira(all.credit)} from an overpayment. The bursary will apply it to future fees or arrange a refund.</Alert>}
      {showBank && (
        <Card title="Pay by bank transfer" description="Payments are confirmed only after the bursary verifies the funds in the school account.">
          {settings.bankAccountNumber ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-navy p-5 text-white">
                <p className="text-xs uppercase tracking-[0.18em] text-gold">{settings.bankName}</p>
                <p className="mt-3 font-display text-3xl font-bold tracking-wider">{settings.bankAccountNumber}</p>
                <p className="mt-1 text-sm text-white/80">{settings.bankAccountName}</p>
                <div className="mt-4 flex flex-wrap gap-2"><CopyButton value={settings.bankAccountNumber} label="Copy account number" /><CopyButton value={student.studentNumber} label="Copy student ID" /></div>
              </div>
              <div className="space-y-3 text-sm">
                {settings.transferInstructions && <p className="whitespace-pre-line">{settings.transferInstructions}</p>}
                <Alert tone="blue" title="Payment reference">{settings.paymentReferenceInstructions || `Use your student ID (${student.studentNumber}) as the transfer narration.`}</Alert>
              </div>
            </div>
          ) : <Alert tone="amber">The school has not published bank details yet.</Alert>}
        </Card>
      )}
      <Card title="Fee breakdown">
        {all.obligations.length ? (
          <div className="table-wrap"><table className="table"><thead><tr><th>Term</th><th>Fee</th><th>Amount</th><th>Adjustments</th><th>Paid</th><th>Outstanding</th><th>Deadline</th><th>Status</th></tr></thead>
            <tbody>{[...all.obligations].reverse().map((o) => <tr key={o.id}><td className="text-xs">{termLabel(o.term)}</td><td className="font-medium text-navy">{o.feeStructure.category.name}</td><td>{formatNaira(o.amount)}</td><td>{Number(o.amountAdjusted) ? formatNaira(o.amountAdjusted) : "—"}</td><td>{formatNaira(o.amountPaid)}</td><td className="font-semibold">{formatNaira(obligationOutstanding(o))}</td><td>{formatDate(o.dueDate)}</td><td><StatusBadge status={o.status} /></td></tr>)}</tbody></table></div>
        ) : <EmptyState title="No fees billed yet" />}
      </Card>
    </div>
  );
}

export async function PaymentHistoryView({ studentId }: { studentId: string }) {
  const subs = await db.paymentSubmission.findMany({ where: { studentId }, orderBy: { createdAt: "desc" }, include: { term: { include: { session: true } }, payment: true, receipts: true } });
  if (!subs.length) return <Card><EmptyState title="No payments yet" /></Card>;
  return (
    <Card>
      <div className="table-wrap"><table className="table"><thead><tr><th>Reference</th><th>Term</th><th>Amount</th><th>Paid on</th><th>Bank ref.</th><th>Status</th><th /></tr></thead>
        <tbody>{subs.map((p) => (
          <tr key={p.id}><td className="font-mono text-xs">{p.reference}<p className="text-muted">{formatDateTime(p.createdAt)}</p></td><td className="text-xs">{termLabel(p.term)}</td><td className="font-semibold">{formatNaira(p.amount)}</td><td>{formatDate(p.paymentDate)}</td><td className="font-mono text-xs">{p.bankReference}</td>
            <td><StatusBadge status={p.status === "PENDING" ? "PENDING" : p.status} />{p.status === "PENDING" && <p className="text-xs text-muted">Awaiting bursary verification</p>}{p.rejectionReason && <p className="max-w-[14rem] text-xs text-rose-700">{p.rejectionReason}</p>}</td>
            <td className="whitespace-nowrap text-right">{p.payment && <a className="btn-secondary btn-sm" href={`/api/payments/${p.payment.id}/confirmation`} target="_blank"><Download className="h-4 w-4" /> Confirmation</a>}{p.receipts[0] && <a className="btn-ghost btn-sm" href={`/api/files/${p.receipts[0].fileId}`} target="_blank">Receipt</a>}</td></tr>
        ))}</tbody></table></div>
    </Card>
  );
}

export function PaymentConfirmationDetails({ rows }: { rows: [string, string][] }) {
  return <DL items={rows} />;
}
