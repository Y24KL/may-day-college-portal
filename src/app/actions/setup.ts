"use server";
import { z } from "zod";
import { run, type ActionState } from "@/lib/action";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/auth/crypto";
import { createInitialSuperAdmin } from "@/lib/setup";
import { rateLimit } from "@/lib/rate-limit";
import { clientInfo } from "@/lib/auth/session";

export async function setupSuperAdmin(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const { ip } = await clientInfo();
    if (!rateLimit(`setup:${ip}`, 5, 60 * 60_000).ok) throw new Error("Too many attempts.");
    const d = z.object({ token: z.string(), fullName: z.string().trim().min(3), email: z.string().email(), password: z.string(), confirm: z.string() }).parse(Object.fromEntries(fd));
    if (!env.setupToken || (env.isProd && env.setupToken.length < 16)) throw new Error("Setup is disabled: SETUP_TOKEN is not configured on the server.");
    if (!safeEqual(d.token, env.setupToken)) throw new Error("Invalid setup token.");
    if (d.password !== d.confirm) throw new Error("Passwords do not match.");
    await createInitialSuperAdmin({ email: d.email, password: d.password, fullName: d.fullName });
    return { ok: true, message: "Super Administrator created. Please sign in and remove SETUP_TOKEN from the server.", redirect: "/login" };
  });
}
