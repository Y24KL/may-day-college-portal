import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { PageHeader, Card, EmptyState, StatusBadge, Badge } from "@/components/ui";
import { ConfirmAction } from "@/components/ui/client";
import { announcementOp } from "@/app/actions/admin/operations";
import { formatDateTime } from "@/lib/utils";
import { Pin, Plus } from "lucide-react";

export const metadata = { title: "Announcements" };

export default async function AnnouncementsAdmin() {
  await requireAdminPage("announcements.manage");
  const rows = await db.announcement.findMany({ orderBy: [{ isPinned: "desc" }, { publishAt: "desc" }], take: 100, include: { audiences: true, _count: { select: { reads: true } } } });
  return (
    <div>
      <PageHeader title="Announcements" description="Create, schedule, pin and archive notices. Engagement shows how many recipients have opened each notice." actions={<Link className="btn-primary" href="/admin/announcements/new"><Plus className="h-4 w-4" /> New announcement</Link>} />
      <Card>
        {rows.length ? (
          <div className="table-wrap"><table className="table"><thead><tr><th>Title</th><th>Category</th><th>Audience</th><th>Publish</th><th>Status</th><th>Reads</th><th /></tr></thead>
            <tbody>{rows.map((a) => (
              <tr key={a.id}>
                <td><p className="flex items-center gap-1 font-semibold text-navy">{a.isPinned && <Pin className="h-3.5 w-3.5 text-gold" />}{a.title}</p>{a.priority !== "NORMAL" && <Badge tone={a.priority === "URGENT" ? "red" : a.priority === "HIGH" ? "amber" : "gray"}>{a.priority}</Badge>}</td>
                <td className="text-xs">{a.category}</td><td className="text-xs">{a.audiences.map((x) => x.type.replace("_", " ").toLowerCase()).join(", ")}</td>
                <td className="text-xs">{formatDateTime(a.publishAt)}{a.expiresAt && <p className="text-muted">until {formatDateTime(a.expiresAt)}</p>}</td>
                <td><StatusBadge status={a.status} /></td><td>{a._count.reads}</td>
                <td className="whitespace-nowrap text-right">
                  <Link className="btn-ghost btn-sm" href={`/admin/announcements/${a.id}`}>Edit</Link>
                  <ConfirmAction action={announcementOp} fields={{ announcementId: a.id, op: "PIN" }} label={a.isPinned ? "Unpin" : "Pin"} className="btn-ghost btn-sm" title="Toggle pin" message="Change the pinned state?" />
                  {a.status !== "ARCHIVED" && <ConfirmAction action={announcementOp} fields={{ announcementId: a.id, op: "ARCHIVE" }} label="Archive" className="btn-ghost btn-sm" title="Archive announcement" message="It will disappear from notice boards." />}
                  {(a.status === "DRAFT" || a.status === "SCHEDULED") && <ConfirmAction action={announcementOp} fields={{ announcementId: a.id, op: "PUBLISH_NOW" }} label="Publish now" className="btn-primary btn-sm" title="Publish now" message="Recipients will be notified immediately." />}
                </td>
              </tr>
            ))}</tbody></table></div>
        ) : <EmptyState title="No announcements yet" action={<Link className="btn-primary" href="/admin/announcements/new">Create the first one</Link>} />}
      </Card>
    </div>
  );
}
