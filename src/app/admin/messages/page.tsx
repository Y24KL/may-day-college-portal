import { requireAdminPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { sendTargetedMessage } from "@/app/actions/admin/operations";
import { AudiencePicker } from "@/components/forms/AudiencePicker";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Notification management" };

export default async function MessagesPage() {
  await requireAdminPage("notifications.manage");
  const recent = await db.auditLog.findMany({ where: { action: "message.send" }, orderBy: { createdAt: "desc" }, take: 15, include: { actor: { select: { email: true } } } });
  return (
    <div className="space-y-5">
      <PageHeader title="Notification management" description="Send targeted in-app messages (optionally by email) to students, parents, teachers or individuals." />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Compose" className="lg:col-span-2">
          <ActionForm action={sendTargetedMessage} className="space-y-4" resetOnSuccess>
            <div><label className="label">Title</label><input name="title" className="input" required /></div>
            <div><label className="label">Message</label><textarea name="body" className="input min-h-[140px]" required /></div>
            <AudiencePicker />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="sendEmail" className="h-4 w-4 accent-royal" /> Also send by email (counts towards the daily email allowance)</label>
            <SubmitButton>Send message</SubmitButton>
          </ActionForm>
        </Card>
        <Card title="Recently sent">
          {recent.length ? <ul className="space-y-2 text-sm">{recent.map((r) => { const d = r.details as { title?: string; recipients?: number } | null; return <li key={r.id} className="rounded-xl bg-white/60 p-3"><p className="font-medium text-navy">{d?.title}</p><p className="text-xs text-muted">{d?.recipients} recipient(s) · {r.actor?.email} · {formatDateTime(r.createdAt)}</p></li>; })}</ul> : <EmptyState title="Nothing sent yet" />}
        </Card>
      </div>
    </div>
  );
}
