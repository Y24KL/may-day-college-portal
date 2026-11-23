import { db } from "@/lib/db";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Readiness probe for Render. Reports service status without secrets. */
export async function GET() {
  const started = Date.now();
  let database = "down";
  try {
    await db.$queryRaw`SELECT 1`;
    database = "up";
  } catch {
    database = "down";
  }
  const body = {
    status: database === "up" ? "ok" : "degraded",
    database,
    storage: env.r2Configured ? "r2" : env.isProd ? (process.env.ALLOW_LOCAL_STORAGE === "true" ? "local-override" : "not-configured") : "local-dev",
    email: env.resendApiKey ? "resend" : env.isProd ? "not-configured" : "console-dev",
    latencyMs: Date.now() - started,
    time: new Date().toISOString(),
  };
  return Response.json(body, { status: database === "up" ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
