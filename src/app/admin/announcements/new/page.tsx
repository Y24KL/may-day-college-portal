import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/guards";
import { PageHeader, Card } from "@/components/ui";
import { AnnouncementForm } from "@/components/forms/AnnouncementForm";

export const metadata = { title: "New announcement" };

export default async function NewAnnouncement() {
  await requireAdminPage("announcements.manage");
  return (
    <div>
      <PageHeader title="New announcement" actions={<Link className="btn-secondary" href="/admin/announcements">Back</Link>} />
      <Card><AnnouncementForm /></Card>
    </div>
  );
}
