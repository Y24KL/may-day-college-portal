import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { visibleAnnouncementsWhere } from "@/lib/announcements";
import { markAnnouncementRead } from "@/app/actions/user";
import { Card, Badge } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import { Paperclip } from "lucide-react";

export default async function Notice({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  const { id } = await params;
  const a = await db.announcement.findFirst({ where: { id, ...(await visibleAnnouncementsWhere(u)) }, include: { attachments: { where: { deletedAt: null } } } });
  if (!a) notFound();
  await markAnnouncementRead(a.id);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/notices" className="btn-ghost btn-sm">← Notice board</Link>
      <Card className="overflow-hidden p-0 sm:p-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {a.coverFileId && <img src={`/api/files/${a.coverFileId}`} alt="" className="max-h-72 w-full object-cover" />}
        <div className="p-6 sm:p-8">
          <div className="mb-3 flex flex-wrap gap-2"><Badge tone="blue">{a.category}</Badge>{a.priority !== "NORMAL" && <Badge tone={a.priority === "URGENT" ? "red" : "amber"}>{a.priority.toLowerCase()}</Badge>}</div>
          <h1 className="text-2xl font-bold">{a.title}</h1>
          <p className="mt-1 text-xs text-muted">Published {formatDateTime(a.publishAt)}{a.expiresAt && ` · until ${formatDateTime(a.expiresAt)}`}</p>
          <div className="mt-5 whitespace-pre-line text-[15px] leading-7 text-ink">{a.body}</div>
          {a.attachments.length > 0 && (
            <div className="mt-6"><p className="label">Attachments</p><div className="flex flex-wrap gap-2">{a.attachments.map((f) => <a key={f.id} href={`/api/files/${f.id}`} target="_blank" rel="noopener" className="btn-secondary btn-sm"><Paperclip className="h-4 w-4" /> {f.originalName}</a>)}</div></div>
          )}
        </div>
      </Card>
    </div>
  );
}
