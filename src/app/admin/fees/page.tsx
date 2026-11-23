import { requireAdminPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { PageHeader, Card, EmptyState, Badge, FilterBar } from "@/components/ui";
import { ActionForm, SubmitButton, ModalForm, ConfirmAction } from "@/components/ui/client";
import { saveFeeCategory, createFeeStructures, updateFeeStructure, toggleFeeStructure, saveBankDetails, syncFeeObligations } from "@/app/actions/admin/finance";
import { getCurrentSessionTerm, termLabel } from "@/lib/academic";
import { termOptions, classOptions } from "@/lib/options";
import { formatNaira, formatDate, toDateInput } from "@/lib/utils";

export const metadata = { title: "Fees & bank details" };

export default async function FeesAdmin({ searchParams }: { searchParams: Promise<{ termId?: string }> }) {
  await requireAdminPage("finance.configure");
  const sp = await searchParams;
  const { term: current } = await getCurrentSessionTerm();
  const [terms, classes, categories, settings] = await Promise.all([termOptions(), classOptions(), db.feeCategory.findMany({ orderBy: { name: "asc" } }), db.schoolSettings.findUniqueOrThrow({ where: { id: "school" } })]);
  const termId = sp.termId ?? current?.id ?? terms[0]?.id;
  const structures = termId ? await db.feeStructure.findMany({ where: { termId }, include: { class: true, category: true, _count: { select: { obligations: true } } }, orderBy: [{ class: { name: "asc" } }, { category: { name: "asc" } }] }) : [];
  return (
    <div className="space-y-5">
      <PageHeader title="Fees & bank details" description="Fees are configured per class, term and category. Changing an amount re-prices unpaid bills and records the change in the ledger." />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="School bank account" description="Shown to students and parents for transfers." className="lg:col-span-2">
          <ActionForm action={saveBankDetails} className="grid gap-3 sm:grid-cols-2">
            <div><label className="label">Bank name</label><input name="bankName" className="input" defaultValue={settings.bankName ?? ""} required /></div>
            <div><label className="label">Account number</label><input name="bankAccountNumber" className="input" inputMode="numeric" defaultValue={settings.bankAccountNumber ?? ""} required /></div>
            <div className="sm:col-span-2"><label className="label">Account name</label><input name="bankAccountName" className="input" defaultValue={settings.bankAccountName ?? ""} required /></div>
            <div className="sm:col-span-2"><label className="label">Transfer instructions</label><textarea name="transferInstructions" className="input" defaultValue={settings.transferInstructions ?? ""} /></div>
            <div className="sm:col-span-2"><label className="label">Payment reference instructions</label><input name="paymentReferenceInstructions" className="input" defaultValue={settings.paymentReferenceInstructions ?? ""} placeholder="Use the student ID as the transfer narration, e.g. MDC/26/0001" /></div>
            <div><SubmitButton className="btn-secondary">Save bank details</SubmitButton></div>
          </ActionForm>
        </Card>
        <Card title="Fee categories" actions={<ModalForm trigger="Add" triggerClassName="btn-secondary btn-sm" title="Add fee category" action={saveFeeCategory}><label className="label">Name</label><input name="name" className="input" placeholder="Tuition" required /><label className="label">Description</label><input name="description" className="input" /></ModalForm>}>
          {categories.length ? <div className="flex flex-wrap gap-2">{categories.map((c) => (
            <ModalForm key={c.id} trigger={c.name} triggerClassName="btn-secondary btn-sm" title={`Edit ${c.name}`} action={saveFeeCategory}><input type="hidden" name="categoryId" value={c.id} /><label className="label">Name</label><input name="name" className="input" defaultValue={c.name} required /><label className="label">Description</label><input name="description" className="input" defaultValue={c.description ?? ""} /></ModalForm>
          ))}</div> : <EmptyState title="No categories" description="e.g. Tuition, Development levy, Examination fee." />}
        </Card>
      </div>
      <Card title="Fee structure" actions={termId && categories.length > 0 && (
        <ModalForm trigger="Add fee" triggerClassName="btn-primary btn-sm" title="Add fee for classes" action={createFeeStructures} wide>
          <input type="hidden" name="termId" value={termId} />
          <div className="grid gap-3 sm:grid-cols-3">
            <div><label className="label">Category</label><select name="categoryId" className="input">{categories.filter((c) => c.isActive).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div><label className="label">Amount (₦)</label><input name="amount" className="input" inputMode="decimal" required /></div>
            <div><label className="label">Payment deadline</label><input name="dueDate" type="date" className="input" /></div>
          </div>
          <p className="label mt-2">Classes</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{classes.map((c) => <label key={c.id} className="flex items-center gap-2 rounded-lg bg-white/60 p-2 text-sm"><input type="checkbox" name="classIds" value={c.id} className="h-4 w-4 accent-royal" /> {c.name}</label>)}</div>
          <p className="help">Bills are generated immediately for students actively enrolled in these classes for the term&apos;s session.</p>
        </ModalForm>
      )}>
        <FilterBar><select name="termId" defaultValue={termId} className="input max-w-[16rem]" aria-label="Term">{terms.map((t) => <option key={t.id} value={t.id}>{termLabel(t)}</option>)}</select></FilterBar>
        {structures.length ? (
          <div className="table-wrap"><table className="table"><thead><tr><th>Class</th><th>Category</th><th>Amount</th><th>Deadline</th><th>Bills</th><th>Status</th><th /></tr></thead>
            <tbody>{structures.map((f) => (
              <tr key={f.id}><td>{f.class.name}</td><td className="font-medium text-navy">{f.category.name}</td><td className="font-semibold">{formatNaira(f.amount)}</td><td>{formatDate(f.dueDate)}</td><td>{f._count.obligations}</td><td>{f.isActive ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</td>
                <td className="whitespace-nowrap text-right">
                  <ModalForm trigger="Edit" triggerClassName="btn-ghost btn-sm" title={`${f.category.name} — ${f.class.name}`} action={updateFeeStructure}>
                    <input type="hidden" name="feeStructureId" value={f.id} />
                    <label className="label">Amount (₦)</label><input name="amount" className="input" defaultValue={f.amount.toString()} required />
                    <label className="label">Deadline</label><input name="dueDate" type="date" className="input" defaultValue={toDateInput(f.dueDate)} />
                    <p className="help">Unpaid and partly-paid bills are re-priced; fully-paid bills stay unchanged. Every change is ledgered.</p>
                  </ModalForm>
                  <ActionForm action={syncFeeObligations} className="inline"><input type="hidden" name="feeStructureId" value={f.id} /><SubmitButton className="btn-ghost btn-sm">Sync bills</SubmitButton></ActionForm>
                  <ConfirmAction action={toggleFeeStructure} fields={{ feeStructureId: f.id }} label={f.isActive ? "Deactivate" : "Activate"} className="btn-ghost btn-sm" title="Change fee status" message={f.isActive ? "New students will not be billed. Existing bills stay (waive them individually if needed)." : "Re-activate this fee?"} />
                </td></tr>
            ))}</tbody></table></div>
        ) : <EmptyState title="No fees configured for this term" />}
      </Card>
    </div>
  );
}
