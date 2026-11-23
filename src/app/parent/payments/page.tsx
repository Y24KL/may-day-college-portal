import { requireParentPage } from "@/lib/auth/guards";
import { parentChildren } from "@/lib/parent";
import { PageHeader } from "@/components/ui";
import { ChildPicker } from "@/components/views/ChildPicker";
import { NoChildren } from "@/components/views/NoChildren";
import { PaymentHistoryView } from "@/components/views/finance";

export const metadata = { title: "Payment history" };

export default async function ParentPaymentHistoryViewPage({ searchParams }: { searchParams: Promise<{ child?: string; term?: string; subject?: string }> }) {
  const u = await requireParentPage();
  const sp = await searchParams;
  // Only VERIFIED children can ever be selected — an arbitrary ?child= id is ignored.
  const { children, selected } = await parentChildren(u.parentId, sp.child);
  return (
    <div>
      <PageHeader title="Payment history" description={selected ? `${selected.fullName} · ${selected.currentClass?.name ?? ""}` : undefined} />
      <ChildPicker items={children} selectedId={selected?.id} basePath="/parent/payments" />
      {selected ? <PaymentHistoryView studentId={selected.id} /> : <NoChildren />}
    </div>
  );
}
