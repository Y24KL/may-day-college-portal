import Link from "next/link";
import type { ApplicationStatus } from "@prisma/client";
import { requireAdminPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { PageHeader, Card, EmptyState, StatusBadge, Pagination } from "@/components/ui";
import { formatDateTime, pageParams } from "@/lib/utils";

export const metadata = { title: "Student registrations" };
const TABS: { key: ApplicationStatus | "ALL"; label: string }[] = [
  { key: "PENDING_APPROVAL", label: "Pending approval" },
  { key: "INFORMATION_REQUIRED", label: "Information required" },
  { key: "DRAFT", label: "Incomplete" },
  { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Rejected" },
];

export default async function StudentApplications({ searchParams }: { searchParams: Promise<{ status?: string; page?: string; q?: string }> }) {
  await requireAdminPage("students.view");
  const sp = await searchParams;
  const status = (sp.status ?? "PENDING_APPROVAL") as ApplicationStatus;
  const { page, skip, take, pageSize } = pageParams(sp);
  const where = { status, ...(sp.q ? { OR: [{ fullName: { contains: sp.q, mode: "insensitive" as const } }, { reference: { contains: sp.q, mode: "insensitive" as const } }] } : {}) };
  const [rows, total, counts] = await Promise.all([
    db.studentApplication.findMany({ where, skip, take, orderBy: { submittedAt: "asc" }, include: { user: { select: { email: true, emailVerifiedAt: true } }, requestedClass: true, session: true } }),
    db.studentApplication.count({ where }),
    db.studentApplication.groupBy({ by: ["status"], _count: true }),
  ]);
  const c = (s: string) => counts.find((x) => x.status === s)?._count ?? 0;
  return (
    <div>
      <PageHeader title="Student registrations" description="Review self-registrations. Students cannot access protected features until approved." actions={<Link href="/admin/students" className="btn-secondary">All students</Link>} />
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link key={t.key} href={`?status=${t.key}`} className={t.key === status ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>{t.label} <span className="opacity-70">{c(t.key)}</span></Link>
        ))}
      </div>
      <Card>
        {rows.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Reference</th><th>Applicant</th><th>Class requested</th><th>Submitted</th><th>Status</th><th /></tr></thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td className="font-mono text-xs">{a.reference}</td>
                    <td><p className="font-semibold text-navy">{a.fullName ?? "—"}</p><p className="text-xs text-muted">{a.user.email}{!a.user.emailVerifiedAt && " · email not verified"}</p></td>
                    <td>{a.requestedClass?.name ?? "—"}<p className="text-xs text-muted">{a.session?.name}</p></td>
                    <td className="text-xs">{formatDateTime(a.submittedAt)}</td>
                    <td><StatusBadge status={a.status} /></td>
                    <td className="text-right"><Link className="btn-ghost btn-sm" href={`/admin/students/applications/${a.id}`}>Review</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="Nothing here" description="No applications with this status." />}
        <Pagination page={page} pageSize={pageSize} total={total} basePath="/admin/students/applications" params={{ status }} />
      </Card>
    </div>
  );
}
