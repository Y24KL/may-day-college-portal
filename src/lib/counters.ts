import { db, type Tx } from "@/lib/db";
import { randomBytes } from "node:crypto";

/** Atomically increments and returns a named counter (safe under concurrency). */
export async function nextCounter(key: string, tx: Tx = db): Promise<number> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "Counter" ("key", "value") VALUES (${key}, 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "Counter"."value" + 1
    RETURNING "value"`;
  return Number(rows[0].value);
}

/** Human-friendly unique reference, e.g. APP-26-7KQ2M9XA */
export function makeReference(prefix: string): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  let s = "";
  for (const b of bytes) s += alphabet[b % alphabet.length];
  const yy = String(new Date().getUTCFullYear()).slice(2);
  return `${prefix}-${yy}-${s}`;
}
