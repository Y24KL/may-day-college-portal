import { requireStudentPage } from "@/lib/auth/guards";
import { PageHeader } from "@/components/ui";
import { ReportCardsView } from "@/components/views/academics";

export const metadata = { title: "Report cards" };

export default async function ReportCards() {
  const u = await requireStudentPage();
  return <div><PageHeader title="Report cards" description="Each report card carries a QR code that anyone can scan to verify it is genuine." /><ReportCardsView studentId={u.studentId} /></div>;
}
