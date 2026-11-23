import { requireStudentPage } from "@/lib/auth/guards";
import { PageHeader } from "@/components/ui";
import { PerformanceView } from "@/components/views/academics";

export const metadata = { title: "Academic performance" };

export default async function Performance({ searchParams }: { searchParams: Promise<{ subject?: string }> }) {
  const u = await requireStudentPage();
  const { subject } = await searchParams;
  return <div><PageHeader title="Academic performance" description="Trends and insights from your published results." /><PerformanceView studentId={u.studentId} subject={subject} /></div>;
}
