import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { PageHeader, Card, EmptyState, Badge, Pagination } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { markNotificationsRead } from "@/app/actions/user";
import { formatDateTime, pageParams, cn } from "@/lib/utils";
import { Bell } from "lucide-react";

export const metadata = { title: "Notifications" };

export default async function Notifications({ searchParams }: { searchParams: Promise<{ category?: string; page?: string; unread?: string }> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const { page, skip, take, pageSize } = pageParams(sp, 25);
  const where = { userId: u.id, ...(sp.category ? { category: sp.category } : {}), ...(sp.unread ? { readAt: null } : {}) };
  const [rows, total, cats, unread] = await Promise.all([
    db.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    db.notification.count({ where }),
    db.notification.groupBy({ by: ["category"], where: { userId: u.id }, _count: true }),
    db.notification.count({ where: { userId: u.id, readAt: null } }),
  ]);
  return (
    <div>
      <PageHeader title="Notifications" description={`${unread} unread`} actions={unread > 0 && <ActionForm action={markNotificationsRead}><SubmitButton className="btn-secondary">Mark all as read</SubmitButton></ActionForm>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/notifications" className={!sp.category && !sp.unread ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>All</Link>
        <Link href="/notifications?unread=1" className={sp.unread ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>Unread</Link>
        {cats.map((c) => <Link key={c.category} href={`/notifications?category=${c.category}`} className={sp.category === c.category ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>{c.category.toLowerCase()} · {c._count}</Link>)}
      </div>
      <Card>
        {rows.length ? (
          <ul className="divide-y divide-lavender">
            {rows.map((n) => (
              <li key={n.id} className={cn("flex items-start gap-3 py-3", !n.readAt && "bg-royal/[0.03]")}>
                <div className={cn("mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-xl", n.readAt ? "bg-lavender text-muted" : "bg-royal/10 text-royal")}><Bell className="h-4 w-4" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-navy">{n.title}</p><Badge tone="gray">{n.category.toLowerCase()}</Badge>{!n.readAt && <Badge tone="gold">New</Badge>}</div>
                  <p className="mt-0.5 text-sm text-ink">{n.body}</p>
                  <p className="mt-1 text-xs text-muted">{formatDateTime(n.createdAt)}</p>
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  {n.link && <Link href={n.link} className="btn-secondary btn-sm">Open</Link>}
                  {!n.readAt && <ActionForm action={markNotificationsRead}><input type="hidden" name="id" value={n.id} /><SubmitButton className="btn-ghost btn-sm">Mark read</SubmitButton></ActionForm>}
                </div>
              </li>
            ))}
          </ul>
        ) : <EmptyState title="You're all caught up" description="New notifications will appear here." />}
        <Pagination page={page} pageSize={pageSize} total={total} basePath="/notifications" params={{ category: sp.category, unread: sp.unread }} />
      </Card>
    </div>
  );
}
