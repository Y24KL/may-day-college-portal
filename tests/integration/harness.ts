import { vi } from "vitest";

/** In-memory cookie jar standing in for the browser (next/headers). */
export const jar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)! } : undefined),
    set: (n: string, v: string) => void jar.set(n, v),
    delete: (n: string) => void jar.delete(n),
  }),
  headers: async () => new Headers({ "x-forwarded-for": "127.0.0.1", "user-agent": "vitest" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => { throw new Error(`REDIRECT:${u}`); }, notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("next/server", () => ({ after: () => { throw new Error("no request scope"); } }));

import { db } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { _resetRateLimits } from "@/lib/rate-limit";

export async function resetDatabase() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  _resetRateLimits();
}

export async function signInAs(email: string) {
  jar.clear();
  const u = await db.user.findUniqueOrThrow({ where: { email } });
  await createSession(u.id, 24);
  return u;
}

export function signOut() {
  jar.clear();
}

export function form(data: Record<string, string | string[] | File>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(data)) {
    if (Array.isArray(v)) v.forEach((x) => fd.append(k, x));
    else fd.append(k, v);
  }
  return fd;
}

export async function pngFile(name = "photo.png") {
  const sharp = (await import("sharp")).default;
  const buf = await sharp({ create: { width: 60, height: 80, channels: 3, background: { r: 49, g: 87, b: 200 } } }).png().toBuffer();
  return new File([new Uint8Array(buf)], name, { type: "image/png" });
}

export function pdfFile(name = "receipt.pdf") {
  return new File([new TextEncoder().encode("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF")], name, { type: "application/pdf" });
}

export async function latestOtp(email: string) {
  const m = await db.notificationDelivery.findFirst({ where: { toEmail: email, template: "verify-email" }, orderBy: { createdAt: "desc" } });
  const code = /Code: (\d{6})/.exec(m?.text ?? "")?.[1];
  if (!code) throw new Error("OTP email not found");
  return code;
}
