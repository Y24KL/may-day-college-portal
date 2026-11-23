import { ZodError } from "zod";
import { AuthError } from "@/lib/auth/guards";
import { Prisma } from "@prisma/client";

export type ActionState = { ok: boolean; message?: string; error?: string; redirect?: string; data?: Record<string, unknown> } | null;

const KNOWN = ["FinanceError", "ResultsError", "UploadError", "Error"];

/** Wrap a server action body: converts known errors into user-facing messages. */
export async function run(fn: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    const r = await fn();
    return r ?? { ok: true };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    if (e instanceof ZodError) return { ok: false, error: e.issues.map((i) => i.message).join(" ") };
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") return { ok: false, error: "A record with these details already exists." };
      if (e.code === "P2003") return { ok: false, error: "This record is linked to other records and cannot be changed this way." };
      if (e.code === "P2025") return { ok: false, error: "Record not found." };
      if (e.code === "P2034") return { ok: false, error: "Another change happened at the same time. Please try again." };
    }
    // Only messages we raised deliberately are shown; system errors (with a
    // `code`, e.g. fs/network) and unknown classes are hidden from users.
    if (e instanceof Error && KNOWN.includes(e.constructor.name) && !("code" in e)) {
      return { ok: false, error: e.message };
    }
    console.error("[action] unexpected", e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/** Read a FormData into a plain object of strings. */
export function formObject(fd: FormData): Record<string, string> {
  const o: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") o[k] = v;
  return o;
}
