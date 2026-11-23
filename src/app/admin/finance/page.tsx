import { Prisma } from "@prisma/client";
import { requireAdminPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { PageHeader, Card, EmptyState, FilterBar, Stat } from "@/components/ui";
import { BarsChart } from "@/components/charts";
import { getCurrentSessionTerm, termLabel } from "@/lib/academic";
import { termOptions } from "@/lib/options";
import { formatNaira, toNumber } from "@/lib/utils";
import { obligationOutstanding } from "@/lib/finance";
import { Download } from "lucide-react";

export const metadata = { title: "Financial reports" };

export default async function FinanceReports({ searchParams }: { searchParams: Promise<{ termId?: string }> }) {
  await requireAdminPage("finance.view");
  const sp = await searchParams;
  const { term: current } = await getCurrentSessionTerm();
  const terms = await termOptions();
  const termId = sp.termId ?? current?.id ?? terms[0]?.id;
  const [obligations, payments, pending, ledgerAdj] = await Promise.all([
    db.studentFeeObligation.findMany({ where: { termId }, include: { enrollment: { include: { class: true } }, feeStructure: { include: { category: true } } } }),
    db.payment.findMany({ where: { submission: { termId } }, select: { amount: true, verifiedAt: true } }),
    db.paymentSubmission.aggregate({ where: { termId, status: "PENDING" }, _sum: { amount: true }, _count: true }),
    db.paymentAdjustment.aggregate({ where: { obligation: { termId } }, _sum: { amount: true } }),
  ]);
  const Z = new Prisma.Decimal(0);
  const billed = obligations.reduce((s, o) => s.add(o.amount), Z);
  const collected = payments.reduce((s, p) => s.add(p.amount), Z);
  const outstanding = obligations.reduce((s, o) => s.add(obligationOutstanding(o)), Z);
  const byClass = new Map<string, { billed: number; paid: number; out: number }>();
  const byCat = new Map<string, { billed: number; paid: number }>();
  for (const o of obligations) {
    const c = byClass.get(o.enrollment.class.name) ?? { billed: 0, paid: 0, out: 0 };
    c.billed += toNumber(o.amount); c.paid += toNumber(o.amountPaid); c.out += toNumber(obligationOutstanding(o));
    byClass.set(o.enrollment.class.name, c);
    const k = byCat.get(o.feeStructure.category.name) ?? { billed: 0, paid: 0 };
    k.billed += toNumber(o.amount); k.paid += toNumber(o.amountPaid);
    byCat.set(o.feeStructure.category.name, k);
  }
  const daily = new Map<string, number>();
  for (const p of payments) { const d = p.verifiedAt.toISOString().slice(0, 10); daily.set(d, (daily.get(d) ?? 0) + toNumber(p.amount)); }
  return (
    <div className="space-y-5">
      <PageHeader title="Financial reports" description="Computed from verified payments and fee bills only." actions={<>
        <a className="btn-secondary" href={`/api/reports/fees?format=csv&termId=${termId}`}><Download className="h-4 w-4" /> CSV</a>
        <a className="btn-secondary" href={`/api/reports/fees?format=xlsx&termId=${termId}`}><Download className="h-4 w-4" /> Excel</a>
        <a className="btn-secondary" href={`/api/reports/fees?format=pdf&termId=${termId}`}><Download className="h-4 w-4" /> PDF</a>
      </>} />
      <FilterBar><select name="termId" defaultValue={termId} className="input max-w-[16rem]" aria-label="Term">{terms.map((t) => <option key={t.id} value={t.id}>{termLabel(t)}</option>)}</select></FilterBar>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Billed" value={formatNaira(billed)} />
        <Stat label="Collected (verified)" value={formatNaira(collected)} tone="green" hint={`${payments.length} payment(s)`} />
        <Stat label="Outstanding" value={formatNaira(outstanding)} tone="red" />
        <Stat label="Awaiting verification" value={formatNaira(pending._sum.amount ?? 0)} tone="gold" hint={`${pending._count} submission(s)`} />
        <Stat label="Adjustments" value={formatNaira(ledgerAdj._sum.amount ?? 0)} tone="navy" />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="By class">{byClass.size ? <BarsChart data={[...byClass.entries()].map(([name, v]) => ({ name, Paid: v.paid, Outstanding: v.out }))} xKey="name" bars={[{ key: "Paid" }, { key: "Outstanding" }]} /> : <EmptyState title="No bills this term" />}</Card>
        <Card title="Collections over time">{daily.size ? <BarsChart data={[...daily.entries()].sort().map(([d, v]) => ({ d: d.slice(5), Amount: v }))} xKey="d" bars={[{ key: "Amount" }]} /> : <EmptyState title="No verified payments yet" />}</Card>
      </div>
      <Card title="By fee category">
        {byCat.size ? <div className="table-wrap"><table className="table"><thead><tr><th>Category</th><th>Billed</th><th>Paid</th><th>Collection rate</th></tr></thead><tbody>{[...byCat.entries()].map(([k, v]) => <tr key={k}><td className="font-medium text-navy">{k}</td><td>{formatNaira(v.billed)}</td><td>{formatNaira(v.paid)}</td><td>{v.billed ? ((v.paid / v.billed) * 100).toFixed(1) : "0"}%</td></tr>)}</tbody></table></div> : <EmptyState title="No data" />}
      </Card>
    </div>
  );
}
