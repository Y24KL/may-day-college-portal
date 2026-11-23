import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Inbox } from "lucide-react";

export function Card({ className, children, title, description, actions }: { className?: string; children?: ReactNode; title?: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={cn("glass p-5 sm:p-6", className)}>
      {(title || actions) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-lg font-semibold">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: ReactNode; actions?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-royal">{eyebrow}</p>}
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-lavender bg-white/40 px-6 py-12 text-center">
      <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-lavender text-royal">{icon ?? <Inbox className="h-6 w-6" />}</div>
      <h3 className="text-base font-semibold text-navy">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const TONES = {
  gray: "bg-slate-100 text-slate-700",
  blue: "bg-royal/10 text-royal",
  green: "bg-emerald-100 text-emerald-700",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-rose-100 text-rose-700",
  gold: "bg-gold/20 text-amber-900",
  navy: "bg-navy text-white",
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = "gray", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn("badge", TONES[tone], className)}>{children}</span>;
}

const STATUS_TONE: Record<string, Tone> = {
  APPROVED: "green", ACTIVE: "green", PUBLISHED: "green", VERIFIED: "green", PAID: "green", SENT: "green", PRESENT: "green", ACCEPTED: "green",
  PENDING: "amber", PENDING_APPROVAL: "amber", SUBMITTED: "amber", PARTIAL: "amber", SCHEDULED: "blue", LATE: "amber", DRAFT: "gray",
  INFORMATION_REQUIRED: "blue", RETURNED: "blue", UPCOMING: "blue", EXCUSED: "blue",
  REJECTED: "red", SUSPENDED: "red", FAILED: "red", ABSENT: "red", UNPAID: "red", REVOKED: "red", CANCELLED: "gray", EXPIRED: "gray",
  ARCHIVED: "gray", WAIVED: "gray", SUPERSEDED: "gray", SKIPPED: "gray", GRADUATED: "navy", WITHDRAWN: "gray", PROMOTED: "blue", DEACTIVATED: "gray",
};
export const STATUS_LABEL: Record<string, string> = {
  EMAIL_VERIFICATION_PENDING: "Email Verification Pending",
  PENDING_APPROVAL: "Pending Approval",
  INFORMATION_REQUIRED: "Information Required",
};
export function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABEL[status] ?? status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ");
  return <Badge tone={STATUS_TONE[status] ?? "gray"}>{label}</Badge>;
}

export function Field({ label, htmlFor, help, children, className }: { label: string; htmlFor?: string; help?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="label" htmlFor={htmlFor}>{label}</label>
      {children}
      {help && <p className="help">{help}</p>}
    </div>
  );
}

export function Stat({ label, value, hint, icon, tone = "blue", href }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: "blue" | "gold" | "green" | "red" | "navy"; href?: string }) {
  const tones = { blue: "from-royal/15 text-royal", gold: "from-gold/25 text-amber-700", green: "from-emerald-200/60 text-emerald-700", red: "from-rose-200/60 text-rose-700", navy: "from-navy/15 text-navy" };
  const body = (
    <div className="glass group relative h-full overflow-hidden p-5 transition hover:-translate-y-0.5 hover:shadow-glass-lg">
      <div className={cn("pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-gradient-to-br to-transparent blur-xl", tones[tone])} />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
          <div className="mt-2 font-display text-2xl font-bold text-navy sm:text-3xl">{value}</div>
          {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
        </div>
        {icon && <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/70", tones[tone].split(" ")[1])}>{icon}</div>}
      </div>
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

export function Pagination({ page, pageSize, total, basePath, params }: { page: number; pageSize: number; total: number; basePath: string; params?: Record<string, string | undefined> }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return <p className="mt-4 text-xs text-muted">{total} record{total === 1 ? "" : "s"}</p>;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    Object.entries(params ?? {}).forEach(([k, v]) => v && sp.set(k, v));
    sp.set("page", String(p));
    return `${basePath}?${sp.toString()}`;
  };
  return (
    <nav className="mt-4 flex items-center justify-between gap-2 text-sm" aria-label="Pagination">
      <span className="text-xs text-muted">Page {page} of {pages} · {total} records</span>
      <div className="flex gap-2">
        {page > 1 ? <Link className="btn-secondary btn-sm" href={href(page - 1)}>Previous</Link> : <span className="btn-secondary btn-sm opacity-50">Previous</span>}
        {page < pages ? <Link className="btn-secondary btn-sm" href={href(page + 1)}>Next</Link> : <span className="btn-secondary btn-sm opacity-50">Next</span>}
      </div>
    </nav>
  );
}

/** GET-form search & filter bar (works without JS). */
export function FilterBar({ children, action }: { children: ReactNode; action?: string }) {
  return (
    <form method="get" action={action} className="mb-4 flex flex-wrap items-end gap-3">
      {children}
      <button className="btn-secondary" type="submit">Apply</button>
    </form>
  );
}

export function Alert({ tone = "blue", title, children }: { tone?: "blue" | "amber" | "red" | "green"; title?: string; children?: ReactNode }) {
  const t = { blue: "border-royal/20 bg-royal/5 text-navy", amber: "border-amber-300/60 bg-amber-50/80 text-amber-900", red: "border-rose-300/60 bg-rose-50/80 text-rose-900", green: "border-emerald-300/60 bg-emerald-50/80 text-emerald-900" };
  return (
    <div className={cn("rounded-2xl border px-4 py-3 text-sm", t[tone])} role={tone === "red" ? "alert" : "status"}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? "mt-0.5" : ""}>{children}</div>}
    </div>
  );
}

export function DL({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{k}</dt>
          <dd className="mt-0.5 break-words text-sm text-ink">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Progress({ value, tone = "royal" }: { value: number; tone?: "royal" | "gold" | "green" | "red" }) {
  const c = { royal: "bg-royal", gold: "bg-gold", green: "bg-emerald-500", red: "bg-rose-500" }[tone];
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-lavender" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-all duration-700", c)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
