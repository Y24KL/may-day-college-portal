import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { visibleAnnouncementsWhere } from "@/lib/announcements";
import { PageHeader, EmptyState, Badge } from "@/components/ui";
import { Stagger, StaggerItem } from "@/components/ui/client";
import { CATEGORIES } from "@/components/forms/AnnouncementForm";
import { formatDate, cn } from "@/lib/utils";
import { Pin } from "lucide-react";

export const metadata = { title: "Notice board" };

export default async function NoticeBoard({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const where = await visibleAnnouncementsWhere(u);
  const rows = await db.announcement.findMany({ where: { ...where, ...(sp.category ? { category: sp.category } : {}) }, orderBy: [{ isPinned: "desc" }, { publishAt: "desc" }], take: 60, include: { reads: { where: { userId: u.id } } } });
  return (
    <div>
      <PageHeader title="Digital notice board" description="Announcements for you, newest first. Pinned notices stay at the top." />
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/notices" className={!sp.category ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>All</Link>
        {CATEGORIES.map((c) => <Link key={c} href={`/notices?category=${encodeURIComponent(c)}`} className={sp.category === c ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>{c}</Link>)}
      </div>
      {rows.length ? (
        <Stagger className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((a) => (
            <StaggerItem key={a.id}>
              <Link href={`/notices/${a.id}`} className={cn("glass group block h-full overflow-hidden transition hover:-translate-y-0.5 hover:shadow-glass-lg", a.isPinned && "ring-2 ring-gold/60")}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {a.coverFileId && <img src={`/api/files/${a.coverFileId}`} alt="" className="h-36 w-full object-cover" />}
                <div className="p-5">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    {a.isPinned && <Badge tone="gold"><Pin className="h-3 w-3" /> Pinned</Badge>}
                    <Badge tone="blue">{a.category}</Badge>
                    {(a.priority === "HIGH" || a.priority === "URGENT") && <Badge tone="red">{a.priority === "URGENT" ? "Urgent" : "Important"}</Badge>}
                    {!a.reads.length && <span className="ml-auto h-2.5 w-2.5 rounded-full bg-royal" aria-label="Unread" />}
                  </div>
                  <h2 className={cn("text-base font-semibold group-hover:text-royal", !a.reads.length ? "text-navy" : "text-ink")}>{a.title}</h2>
                  <p className="mt-1 line-clamp-3 text-sm text-muted">{a.body}</p>
                  <p className="mt-3 text-xs text-muted">{formatDate(a.publishAt)}</p>
                </div>
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      ) : <EmptyState title="No announcements" description="School announcements for you will appear here." />}
    </div>
  );
}
