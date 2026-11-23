import { env } from "@/lib/env";

export type SendResult = { ok: true; providerId: string } | { ok: false; error: string; retryable: boolean; notConfigured?: boolean };

/** Resend over HTTPS (Render free tier blocks outbound SMTP). */
export async function sendViaProvider(msg: { to: string; subject: string; html: string; text: string }): Promise<SendResult> {
  if (!env.resendApiKey) {
    if (!env.isProd) {
      console.info(`[email:dev] to=${msg.to} subject="${msg.subject}"\n${msg.text}\n`);
      return { ok: true, providerId: "dev-console" };
    }
    return { ok: false, error: "RESEND_API_KEY is not configured", retryable: true, notConfigured: true };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.emailFrom, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (res.ok && body.id) return { ok: true, providerId: body.id };
    return { ok: false, error: `Resend ${res.status}: ${body.message ?? "unknown error"}`, retryable: res.status === 429 || res.status >= 500 };
  } catch (e) {
    return { ok: false, error: `Network error: ${(e as Error).message}`, retryable: true };
  }
}
