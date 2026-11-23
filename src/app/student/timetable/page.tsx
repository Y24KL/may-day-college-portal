import { requireStudentPage } from "@/lib/auth/guards";
import { PageHeader } from "@/components/ui";
import { ClassTimetableView } from "@/components/views/academics";

export const metadata = { title: "Class timetable" };

export default async function Timetable() {
  const u = await requireStudentPage();
  return <div><PageHeader title="Class timetable" /><ClassTimetableView studentId={u.studentId} /></div>;
}
