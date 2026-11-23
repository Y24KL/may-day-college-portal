import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

type DecimalLike = { toString(): string } | number | string | null | undefined;

export function toNumber(v: DecimalLike): number {
  if (v === null || v === undefined) return 0;
  return typeof v === "number" ? v : Number(v.toString());
}

export function formatNaira(v: DecimalLike): string {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 2 }).format(
    toNumber(v),
  );
}

export function formatDate(d: Date | string | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-NG", opts ?? { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" }).format(date);
}

export function formatDateTime(d: Date | string | null | undefined): string {
  return formatDate(d, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" });
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Parse "YYYY-MM-DD" into a UTC-midnight Date (for @db.Date columns). */
export function parseDateOnly(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toDateInput(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

/** Today's date in Lagos as UTC-midnight Date. */
export function todayLagos(): Date {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());
  return parseDateOnly(s);
}

export function pageParams(sp: { page?: string }, pageSize = 20) {
  const page = Math.max(1, Number(sp.page) || 1);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

/** <input type="datetime-local"> values are entered in Lagos time (UTC+1, no DST). */
export function parseLagosInput(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(`${s.length === 16 ? s + ":00" : s}+01:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toLagosInput(d: Date | null | undefined): string {
  if (!d) return "";
  return new Date(d.getTime() + 3600_000).toISOString().slice(0, 16);
}
