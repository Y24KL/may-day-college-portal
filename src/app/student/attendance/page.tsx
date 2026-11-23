import { requireStudentPage } from "@/lib/auth/guards";
import { PageHeader } from "@/components/ui";
import { AttendanceView } from "@/components/views/academics";

export const metadata = { title: "Attendance" };

export default async function Attendance({ searchParams }: { searchParams: Promise<{ term?: string }> }) {
  const u = await requireStudentPage();
  const { term } = await searchParams;
  return <div><PageHeader title="Attendance" /><AttendanceView studentId={u.studentId} termId={term} /></div>;
}
