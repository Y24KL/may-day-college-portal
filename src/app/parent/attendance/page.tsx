import { requireParentPage } from "@/lib/auth/guards";
import { parentChildren } from "@/lib/parent";
import { PageHeader } from "@/components/ui";
import { ChildPicker } from "@/components/views/ChildPicker";
import { NoChildren } from "@/components/views/NoChildren";
import { AttendanceView } from "@/components/views/academics";

export const metadata = { title: "Attendance" };

export default async function ParentAttendanceViewPage({ searchParams }: { searchParams: Promise<{ child?: string; term?: string; subject?: string }> }) {
  const u = await requireParentPage();
  const sp = await searchParams;
  // Only VERIFIED children can ever be selected — an arbitrary ?child= id is ignored.
  const { children, selected } = await parentChildren(u.parentId, sp.child);
  return (
    <div>
      <PageHeader title="Attendance" description={selected ? `${selected.fullName} · ${selected.currentClass?.name ?? ""}` : undefined} />
      <ChildPicker items={children} selectedId={selected?.id} basePath="/parent/attendance" />
      {selected ? <AttendanceView studentId={selected.id} termId={sp.term} /> : <NoChildren />}
    </div>
  );
}
