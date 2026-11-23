import { requireStudentPage } from "@/lib/auth/guards";
import { PageHeader } from "@/components/ui";
import { ResultsView } from "@/components/views/academics";

export const metadata = { title: "Academic results" };

export default async function Results({ searchParams }: { searchParams: Promise<{ term?: string }> }) {
  const u = await requireStudentPage();
  const { term } = await searchParams;
  return <div><PageHeader title="Academic results" description="Only officially published results are shown." /><ResultsView studentId={u.studentId} termId={term} basePath="/student/results" /></div>;
}
