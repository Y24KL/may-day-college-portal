import { requireParentPage } from "@/lib/auth/guards";
import { parentChildren } from "@/lib/parent";
import { PageHeader } from "@/components/ui";
import { ChildPicker } from "@/components/views/ChildPicker";
import { NoChildren } from "@/components/views/NoChildren";
import { ClassTimetableView } from "@/components/views/academics";

export const metadata = { title: "Class timetable" };

export default async function ParentClassTimetableViewPage({ searchParams }: { searchParams: Promise<{ child?: string; term?: string; subject?: string }> }) {
  const u = await requireParentPage();
  const sp = await searchParams;
  // Only VERIFIED children can ever be selected — an arbitrary ?child= id is ignored.
  const { children, selected } = await parentChildren(u.parentId, sp.child);
  return (
    <div>
      <PageHeader title="Class timetable" description={selected ? `${selected.fullName} · ${selected.currentClass?.name ?? ""}` : undefined} />
      <ChildPicker items={children} selectedId={selected?.id} basePath="/parent/timetable" />
      {selected ? <ClassTimetableView studentId={selected.id} /> : <NoChildren />}
    </div>
  );
}
