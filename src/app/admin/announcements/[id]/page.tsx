import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { PageHeader, Card, Alert } from "@/components/ui";
import { AnnouncementForm } from "@/components/forms/AnnouncementForm";

export default async function EditAnnouncement({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage("announcements.manage");
  const { id } = await params;
  const a = await db.announcement.findUnique({ where: { id }, include: { audiences: true, attachments: { where: { deletedAt: null } } } });
  if (!a) notFound();
  return (
    <div className="space-y-4">
      <PageHeader title="Edit announcement" actions={<Link className="btn-secondary" href="/admin/announcements">Back</Link>} />
      {a.notifiedAt && <Alert tone="blue">Recipients were notified {a.notifiedAt.toLocaleString("en-NG", { timeZone: "Africa/Lagos" })}. Edits update the notice board but do not re-send notifications.</Alert>}
      {a.attachments.length > 0 && <Alert tone="blue">Current attachments: {a.attachments.map((f) => f.originalName).join(", ")}</Alert>}
      <Card><AnnouncementForm a={a} /></Card>
    </div>
  );
}
