import Link from "next/link";
import type { ApplicationStatus } from "@prisma/client";
import { requireAdminPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { PageHeader, Card, EmptyState, StatusBadge } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Teacher applications" };

export default async function TeacherApplications({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdminPage("teachers.view");
  const status = ((await searchParams).status ?? "PENDING_APPROVAL") as ApplicationStatus;
  const [rows, counts] = await Promise.all([
    db.teacherApplication.findMany({ where: { status }, orderBy: { submittedAt: "asc" }, include: { user: { select: { email: true } } }, take: 200 }),
    db.teacherApplication.groupBy({ by: ["status"], _count: true }),
  ]);
  return (
    <div>
      <PageHeader title="Teacher applications" description="Teachers gain no access to student records until approved AND assigned." actions={<Link href="/admin/teachers" className="btn-secondary">All teachers</Link>} />
      <div className="mb-4 flex flex-wrap gap-2">
        {(["PENDING_APPROVAL", "INFORMATION_REQUIRED", "DRAFT", "APPROVED", "REJECTED"] as const).map((s) => (
          <Link key={s} href={`?status=${s}`} className={s === status ? "btn-primary btn-sm" : "btn-secondary btn-sm"}><StatusBadge status={s} /> {counts.find((c) => c.status === s)?._count ?? 0}</Link>
        ))}
      </div>
      <Card>
        {rows.length ? (
          <div className="table-wrap"><table className="table"><thead><tr><th>Reference</th><th>Applicant</th><th>Specialisation</th><th>Experience</th><th>Submitted</th><th /></tr></thead>
            <tbody>{rows.map((a) => (
              <tr key={a.id}><td className="font-mono text-xs">{a.reference}</td><td><p className="font-semibold text-navy">{a.fullName}</p><p className="text-xs text-muted">{a.user.email}</p></td><td>{a.specialization ?? "—"}</td><td>{a.yearsExperience ?? "—"} yrs</td><td className="text-xs">{formatDateTime(a.submittedAt)}</td><td className="text-right"><Link className="btn-ghost btn-sm" href={`/admin/teachers/applications/${a.id}`}>Review</Link></td></tr>
            ))}</tbody></table></div>
        ) : <EmptyState title="No applications with this status" />}
      </Card>
    </div>
  );
}
