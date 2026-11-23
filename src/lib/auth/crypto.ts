import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Keyed hash for tokens/OTPs stored in the database (never store raw tokens). */
export function hashToken(token: string): string {
  return createHmac("sha256", env.authSecret).update(token).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function randomOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}
