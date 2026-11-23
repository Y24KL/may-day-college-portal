import { env } from "@/lib/env";
import { safeEqual } from "@/lib/auth/crypto";
import { runAllJobs } from "@/lib/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Scheduled background work, triggered by GitHub Actions (see .github/workflows/scheduled-jobs.yml). */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!env.cronSecret || !token || !safeEqual(token, env.cronSecret)) return new Response("Unauthorized", { status: 401 });
  const result = await runAllJobs();
  return Response.json({ ok: true, ...result });
}
