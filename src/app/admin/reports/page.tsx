import { requireAdminPage } from "@/lib/auth/guards";
import { PageHeader, Card } from "@/components/ui";
import { termOptions, classOptions, sessionOptions } from "@/lib/options";
import { termLabel } from "@/lib/academic";
import { REPORTS } from "@/lib/reports";
import type { PermissionKey } from "@/lib/permissions";

export const metadata = { title: "Reports & exports" };

const META: Record<string, { title: string; desc: string; filters: ("session" | "term" | "class" | "status" | "dates")[] }> = {
  students: { title: "Student enrollment", desc: "All enrolled students for a session.", filters: ["session", "class"] },
  distribution: { title: "Student distribution", desc: "Active students per class, level and sector.", filters: ["session"] },
  teachers: { title: "Teacher assignments", desc: "Subjects and classes per teacher.", filters: ["session"] },
  registrations: { title: "Subject registrations", desc: "Registered subjects per student.", filters: ["session"] },
  performance: { title: "Academic performance", desc: "Published term results with positions.", filters: ["term", "class"] },
  "class-performance": { title: "Class performance", desc: "Subject averages, highs, lows and pass rates.", filters: ["term"] },
  attendance: { title: "Attendance", desc: "Daily register summary per student.", filters: ["term", "class"] },
  fees: { title: "School fees & outstanding balances", desc: "Bills, payments and balances.", filters: ["term", "class", "status"] },
  collections: { title: "Payment collections", desc: "Verified payments in a date range.", filters: ["dates"] },
};

export default async function ReportsPage() {
  const u = await requireAdminPage("reports.view");
  const [terms, classes, sessions] = await Promise.all([termOptions(), classOptions(), sessionOptions()]);
  return (
    <div className="space-y-5">
      <PageHeader title="Reports & exports" description="Every report is generated from live database records. Exports are logged in the audit trail." />
      <div className="grid gap-4 lg:grid-cols-2">
        {Object.entries(META).filter(([k]) => u.permissions.has(REPORTS[k].permission as PermissionKey)).map(([k, m]) => (
          <Card key={k} title={m.title} description={m.desc}>
            <form action={`/api/reports/${k}`} method="get" target="_blank" className="flex flex-wrap items-end gap-2">
              {m.filters.includes("session") && <select name="sessionId" className="input max-w-[11rem]" aria-label="Session">{sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
              {m.filters.includes("term") && <select name="termId" className="input max-w-[15rem]" aria-label="Term">{terms.map((t) => <option key={t.id} value={t.id}>{termLabel(t)}</option>)}</select>}
              {m.filters.includes("class") && <select name="classId" className="input max-w-[12rem]" aria-label="Class"><option value="">All classes</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
              {m.filters.includes("status") && <select name="status" className="input max-w-[10rem]" aria-label="Payment status"><option value="">Any status</option><option value="UNPAID">Unpaid</option><option value="PARTIAL">Partial</option><option value="PAID">Paid</option><option value="WAIVED">Waived</option></select>}
              {m.filters.includes("dates") && <><input type="date" name="from" className="input max-w-[10rem]" aria-label="From" /><input type="date" name="to" className="input max-w-[10rem]" aria-label="To" /></>}
              <select name="format" className="input max-w-[7rem]" aria-label="Format"><option value="csv">CSV</option><option value="xlsx">Excel</option><option value="pdf">PDF</option></select>
              <button className="btn-primary" type="submit">Export</button>
            </form>
          </Card>
        ))}
      </div>
    </div>
  );
}
