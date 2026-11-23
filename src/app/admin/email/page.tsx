import type { DeliveryStatus } from "@prisma/client";
import { requireAdminPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { PageHeader, Card, EmptyState, StatusBadge, Stat, Alert, Pagination, Progress } from "@/components/ui";
import { ActionForm, SubmitButton, ConfirmAction } from "@/components/ui/client";
import { retryEmail, runOutboxNow } from "@/app/actions/admin/system";
import { emailUsage } from "@/lib/email/worker";
import { env } from "@/lib/env";
import { formatDateTime, pageParams } from "@/lib/utils";

export const metadata = { title: "Email management" };

export default async function EmailPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  await requireAdminPage("notifications.manage");
  const sp = await searchParams;
  const { page, skip, take, pageSize } = pageParams(sp, 25);
  const where = sp.status ? { status: sp.status as DeliveryStatus } : {};
  const [usage, settings, rows, total, templates] = await Promise.all([
    emailUsage(),
    db.schoolSettings.findUniqueOrThrow({ where: { id: "school" } }),
    db.notificationDelivery.findMany({ where, orderBy: { createdAt: "desc" }, skip, take, select: { id: true, toEmail: true, subject: true, template: true, priority: true, status: true, attempts: true, lastError: true, createdAt: true, sentAt: true } }),
    db.notificationDelivery.count({ where }),
    db.notificationDelivery.groupBy({ by: ["template"], _count: true, orderBy: { _count: { template: "desc" } }, take: 12 }),
  ]);
  return (
    <div className="space-y-5">
      <PageHeader title="Email management" description="Transactional email is sent asynchronously through Resend with retries and priority handling." actions={<ActionForm action={runOutboxNow}><SubmitButton className="btn-secondary">Process queue now</SubmitButton></ActionForm>} />
      {!env.resendApiKey && <Alert tone={env.isProd ? "red" : "amber"} title="Resend is not configured">{env.isProd ? "RESEND_API_KEY is missing — emails are queued but NOT being delivered." : "Development mode: emails are printed to the server console and marked sent (not counted towards quota)."}</Alert>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Sent today" value={`${usage.day} / ${settings.emailDailyLimit}`} hint={<Progress value={(usage.day / settings.emailDailyLimit) * 100} tone={usage.day / settings.emailDailyLimit > 0.8 ? "red" : "royal"} />} />
        <Stat label="Sent this month" value={`${usage.month} / ${settings.emailMonthlyLimit}`} hint={<Progress value={(usage.month / settings.emailMonthlyLimit) * 100} tone="gold" />} tone="gold" />
        <Stat label="Pending" value={usage.pending} tone="navy" />
        <Stat label="Failed" value={usage.failed} tone={usage.failed ? "red" : "green"} />
      </div>
      <p className="text-xs text-muted">When 80% of the daily allowance is used, only security (verification, password reset) and essential financial/approval emails are sent; others are deferred to the next day — never discarded.</p>
      <Card title="Deliveries" actions={<div className="flex flex-wrap gap-2">{["", "PENDING", "SENT", "FAILED"].map((s) => <a key={s} href={`?status=${s}`} className={(sp.status ?? "") === s ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>{s || "All"}</a>)}{usage.failed > 0 && <ConfirmAction action={retryEmail} fields={{}} label="Retry all failed" title="Retry failed emails" message="Re-queue every failed email?" />}</div>}>
        {rows.length ? (
          <div className="table-wrap"><table className="table"><thead><tr><th>Recipient</th><th>Subject</th><th>Template</th><th>Priority</th><th>Status</th><th>Attempts</th><th>Created</th><th /></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}><td className="text-xs">{r.toEmail}</td><td className="max-w-[16rem] truncate">{r.subject}</td><td className="text-xs">{r.template}</td><td className="text-xs">{r.priority}</td><td><StatusBadge status={r.status} />{r.lastError && <p className="max-w-[14rem] truncate text-xs text-rose-700" title={r.lastError}>{r.lastError}</p>}</td><td>{r.attempts}</td><td className="text-xs">{formatDateTime(r.createdAt)}</td>
                <td>{r.status === "FAILED" && <ActionForm action={retryEmail}><input type="hidden" name="deliveryId" value={r.id} /><SubmitButton className="btn-ghost btn-sm">Retry</SubmitButton></ActionForm>}</td></tr>
            ))}</tbody></table></div>
        ) : <EmptyState title="No emails" />}
        <Pagination page={page} pageSize={pageSize} total={total} basePath="/admin/email" params={{ status: sp.status }} />
      </Card>
      <Card title="Email templates in use" description="Templates are branded with the school name and logo colours and defined in code (src/lib/email/templates.ts).">
        <div className="flex flex-wrap gap-2">{templates.map((t) => <span key={t.template} className="badge bg-lavender text-navy">{t.template} · {t._count}</span>)}</div>
      </Card>
    </div>
  );
}
