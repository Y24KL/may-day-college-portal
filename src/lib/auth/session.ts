import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";
import { hashToken, randomToken } from "./crypto";
import { env } from "@/lib/env";

export const SESSION_COOKIE = "mdc_session";

export async function clientInfo() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") || "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  return { ip, userAgent: (h.get("user-agent") || "").slice(0, 300) };
}

export async function createSession(userId: string, lifetimeHours: number) {
  const token = randomToken(32);
  const { ip, userAgent } = await clientInfo();
  const expiresAt = new Date(Date.now() + lifetimeHours * 3600_000);
  await db.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt, ip, userAgent } });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroyCurrentSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.updateMany({ where: { tokenHash: hashToken(token), revokedAt: null }, data: { revokedAt: new Date() } });
  }
  jar.delete(SESSION_COOKIE);
}

/** Revoke every session of a user (suspension, password reset, role change). */
export async function revokeAllSessions(userId: string, exceptTokenHash?: string) {
  await db.session.updateMany({
    where: { userId, revokedAt: null, ...(exceptTokenHash ? { NOT: { tokenHash: exceptTokenHash } } : {}) },
    data: { revokedAt: new Date() },
  });
}
