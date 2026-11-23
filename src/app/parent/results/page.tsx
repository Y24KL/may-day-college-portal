import { requireParentPage } from "@/lib/auth/guards";
import { parentChildren } from "@/lib/parent";
import { PageHeader } from "@/components/ui";
import { ChildPicker } from "@/components/views/ChildPicker";
import { NoChildren } from "@/components/views/NoChildren";
import { ResultsView } from "@/components/views/academics";

export const metadata = { title: "Academic results" };

export default async function ParentResultsViewPage({ searchParams }: { searchParams: Promise<{ child?: string; term?: string; subject?: string }> }) {
  const u = await requireParentPage();
  const sp = await searchParams;
  // Only VERIFIED children can ever be selected — an arbitrary ?child= id is ignored.
  const { children, selected } = await parentChildren(u.parentId, sp.child);
  return (
    <div>
      <PageHeader title="Academic results" description={selected ? `${selected.fullName} · ${selected.currentClass?.name ?? ""}` : undefined} />
      <ChildPicker items={children} selectedId={selected?.id} basePath="/parent/results" />
      {selected ? <ResultsView studentId={selected.id} termId={sp.term} basePath={`/parent/results?child=${selected.id}`} /> : <NoChildren />}
    </div>
  );
}
