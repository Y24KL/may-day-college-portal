import { requireStudentPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { PageHeader, Card } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { FeesView } from "@/components/views/finance";
import { submitPayment } from "@/app/actions/student";
import { termLabel } from "@/lib/academic";

export const metadata = { title: "School fees" };

export default async function Fees() {
  const u = await requireStudentPage();
  const terms = await db.term.findMany({ where: { feeObligations: { some: { studentId: u.studentId } } }, include: { session: true }, orderBy: [{ session: { startDate: "desc" } }, { order: "desc" }] });
  const current = await db.term.findFirst({ where: { isCurrent: true }, include: { session: true } });
  const options = current && !terms.some((t) => t.id === current.id) ? [current, ...terms] : terms;
  return (
    <div className="space-y-5">
      <PageHeader title="School fees" />
      <FeesView studentId={u.studentId} />
      <Card title="Submit a payment" description="After transferring, submit the details and receipt here. A receipt is not proof of payment — the bursary confirms against the bank statement.">
        {options.length ? (
          <ActionForm action={submitPayment} className="grid gap-4 sm:grid-cols-2" encType="multipart/form-data">
            <div><label className="label" htmlFor="termId">Term</label><select id="termId" name="termId" className="input" defaultValue={current?.id}>{options.map((t) => <option key={t.id} value={t.id}>{termLabel(t)}</option>)}</select></div>
            <div><label className="label" htmlFor="amount">Amount paid (₦)</label><input id="amount" name="amount" inputMode="decimal" className="input" placeholder="150000" required /></div>
            <div><label className="label" htmlFor="paymentDate">Payment date</label><input id="paymentDate" name="paymentDate" type="date" className="input" required /></div>
            <div><label className="label" htmlFor="bankReference">Bank transfer reference</label><input id="bankReference" name="bankReference" className="input" required /></div>
            <div className="sm:col-span-2"><label className="label" htmlFor="description">Description (optional)</label><input id="description" name="description" className="input" placeholder="e.g. First term tuition, part payment" /></div>
            <div className="sm:col-span-2"><label className="label" htmlFor="receipt">Payment receipt (PDF, JPG, PNG — max 5 MB)</label><input id="receipt" name="receipt" type="file" accept="application/pdf,image/jpeg,image/png" className="input" required /></div>
            <div className="sm:col-span-2"><SubmitButton pendingText="Uploading…">Submit for verification</SubmitButton></div>
          </ActionForm>
        ) : <p className="text-sm text-muted">No term is open for payments.</p>}
      </Card>
    </div>
  );
}
