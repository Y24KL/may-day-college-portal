import { db } from "@/lib/db";
import { getSettingsFresh } from "@/lib/settings";
import { sendViaProvider } from "./provider";
import { env } from "@/lib/env";
import { enqueueEmail } from "./outbox";

const MAX_ATTEMPTS = 6;
const PRIORITY_ORDER = { CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3 } as const;

function startOfLagosDay(d = new Date()) {
  // Lagos is UTC+1 all year (no DST).
  const lagos = new Date(d.getTime() + 3600_000);
  return new Date(Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth(), lagos.getUTCDate()) - 3600_000);
}
function startOfMonth(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export async function emailUsage() {
  const [day, month, pending, failed] = await Promise.all([
    db.notificationDelivery.count({ where: { status: "SENT", sentAt: { gte: startOfLagosDay() }, NOT: { providerId: "dev-console" } } }),
    db.notificationDelivery.count({ where: { status: "SENT", sentAt: { gte: startOfMonth() }, NOT: { providerId: "dev-console" } } }),
    db.notificationDelivery.count({ where: { status: "PENDING" } }),
    db.notificationDelivery.count({ where: { status: "FAILED" } }),
  ]);
  return { day, month, pending, failed };
}

let running = false;

/**
 * Deliver queued emails. Respects the configured daily/monthly allowance:
 * the last 20% of the daily quota is reserved for CRITICAL (security) and
 * HIGH (financial/approval) messages. Lower-priority mail is deferred — never
 * silently discarded.
 */
export async function processEmailOutbox(batchSize = 25): Promise<{ sent: number; failed: number; deferred: number }> {
  if (running) return { sent: 0, failed: 0, deferred: 0 };
  running = true;
  try {
    const settings = await getSettingsFresh();
    const usage = await emailUsage();
    let dayUsed = usage.day;
    let monthUsed = usage.month;
    const reserveFrom = Math.floor(settings.emailDailyLimit * 0.8);

    const candidates = await db.notificationDelivery.findMany({
      where: { status: "PENDING", sendAfter: { lte: new Date() } },
      orderBy: [{ createdAt: "asc" }],
      take: 200,
    });
    candidates.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.createdAt.getTime() - b.createdAt.getTime());

    let sent = 0, failed = 0, deferred = 0;
    for (const m of candidates.slice(0, batchSize)) {
      const essential = m.priority === "CRITICAL" || m.priority === "HIGH";
      const overDaily = dayUsed >= settings.emailDailyLimit || (!essential && dayUsed >= reserveFrom);
      const overMonthly = monthUsed >= settings.emailMonthlyLimit && m.priority !== "CRITICAL";
      if (env.resendApiKey && (overDaily || overMonthly)) {
        const next = overMonthly ? new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1)) : new Date(startOfLagosDay().getTime() + 86400_000);
        await db.notificationDelivery.update({ where: { id: m.id }, data: { sendAfter: next, lastError: "Deferred: email allowance reached" } });
        deferred++;
        continue;
      }
      // Claim the row to avoid double-sending if two workers overlap.
      const claimed = await db.notificationDelivery.updateMany({ where: { id: m.id, status: "PENDING" }, data: { attempts: { increment: 1 } } });
      if (!claimed.count) continue;
      const res = await sendViaProvider({ to: m.toEmail, subject: m.subject, html: m.html, text: m.text });
      if (res.ok) {
        await db.notificationDelivery.update({ where: { id: m.id }, data: { status: "SENT", sentAt: new Date(), providerId: res.providerId, lastError: null } });
        sent++;
        if (res.providerId !== "dev-console") { dayUsed++; monthUsed++; }
      } else {
        const attempts = m.attempts + 1;
        const giveUp = !res.notConfigured && (!res.retryable || attempts >= MAX_ATTEMPTS);
        const backoffMin = Math.min(2 ** attempts * 5, 24 * 60);
        await db.notificationDelivery.update({
          where: { id: m.id },
          data: giveUp
            ? { status: "FAILED", lastError: res.error }
            : { lastError: res.error, sendAfter: new Date(Date.now() + backoffMin * 60_000), ...(res.notConfigured ? { attempts: 0 } : {}) },
        });
        failed++;
        if (res.notConfigured) break; // no point hammering an unconfigured provider
      }
    }

    // Quota warning to administrators (once per day).
    if (env.resendApiKey && dayUsed >= reserveFrom) {
      await quotaWarning(`Daily email usage is ${dayUsed}/${settings.emailDailyLimit}. Non-essential emails are being deferred to tomorrow.`, "email-daily");
    }
    if (env.resendApiKey && monthUsed >= Math.floor(settings.emailMonthlyLimit * 0.8)) {
      await quotaWarning(`Monthly email usage is ${monthUsed}/${settings.emailMonthlyLimit}. Consider upgrading the Resend plan.`, "email-monthly");
    }
    return { sent, failed, deferred };
  } finally {
    running = false;
  }
}

async function quotaWarning(message: string, kind: string) {
  const key = `quota:${kind}:${startOfLagosDay().toISOString().slice(0, 10)}`;
  const created = await db.alertState.createMany({ data: [{ key, lastTriggeredAt: new Date() }], skipDuplicates: true });
  if (!created.count) return;
  const admins = await db.user.findMany({
    where: { status: "ACTIVE", roles: { some: { role: { permissions: { some: { permission: { key: "notifications.manage" } } } } } } },
    select: { id: true },
  });
  await db.notification.createMany({
    data: admins.map((a) => ({ userId: a.id, category: "SYSTEM", title: "Email allowance warning", body: message, link: "/admin/email" })),
  });
  if (env.adminAlertEmail) {
    await enqueueEmail({ to: env.adminAlertEmail, subject: "Email allowance warning", template: "quota", priority: "CRITICAL", content: { heading: "Email allowance warning", paragraphs: [message] } });
  }
}

/** Fire-and-forget delivery after the response is sent (falls back silently). */
export async function kickEmailWorker() {
  try {
    const { after } = await import("next/server");
    after(() => processEmailOutbox().catch((e) => console.error("[email worker]", e)));
  } catch {
    /* outside a request (tests/scripts) — the cron endpoint will deliver */
  }
}
