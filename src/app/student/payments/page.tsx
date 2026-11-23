import { requireStudentPage } from "@/lib/auth/guards";
import { PageHeader } from "@/components/ui";
import { PaymentHistoryView } from "@/components/views/finance";

export const metadata = { title: "Payment history" };

export default async function Payments() {
  const u = await requireStudentPage();
  return <div><PageHeader title="Payment history" description="Download official confirmations for verified payments." /><PaymentHistoryView studentId={u.studentId} /></div>;
}
