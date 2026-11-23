import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { PageHeader, Card, EmptyState, StatusBadge, Pagination, FilterBar } from "@/components/ui";
import { getCurrentSessionTerm } from "@/lib/academic";
import { pageParams } from "@/lib/utils";
import { ClipboardCheck } from "lucide-react";

export const metadata = { title: "Teacher management" };

export default async function TeachersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await requireAdminPage("teachers.view");
  const sp = await searchParams;
  const { session } = await getCurrentSessionTerm();
  const { page, skip, take, pageSize } = pageParams(sp);
  const where = sp.q ? { OR: [{ fullName: { contains: sp.q, mode: "insensitive" as const } }, { staffNumber: { contains: sp.q, mode: "insensitive" as const } }, { user: { email: { contains: sp.q, mode: "insensitive" as const } } }] } : {};
  const [rows, total, pending] = await Promise.all([
    db.teacher.findMany({ where, skip, take, orderBy: { fullName: "asc" }, include: { user: { select: { email: true, status: true } }, assignments: { where: { isActive: true, offering: { sessionId: session?.id } }, select: { id: true } }, classTeacherAssignments: { where: { sessionId: session?.id }, include: { class: true } } } }),
    db.teacher.count({ where }),
    db.teacherApplication.count({ where: { status: "PENDING_APPROVAL" } }),
  ]);
  return (
    <div>
      <PageHeader title="Teacher management" description="Approved teachers and their current-session assignments." actions={<Link href="/admin/teachers/applications" className="btn-secondary"><ClipboardCheck className="h-4 w-4" /> Applications {pending > 0 && <span className="badge bg-gold text-navy">{pending}</span>}</Link>} />
      <Card>
        <FilterBar><input name="q" defaultValue={sp.q} placeholder="Name, staff number or email" className="input max-w-xs" aria-label="Search" /></FilterBar>
        {rows.length ? (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Teacher</th><th>Staff no.</th><th>Specialisation</th><th>Subjects ({session?.name ?? "—"})</th><th>Class teacher</th><th>Status</th><th /></tr></thead>
            <tbody>{rows.map((t) => (
              <tr key={t.id}>
                <td><p className="font-semibold text-navy">{t.fullName}</p><p className="text-xs text-muted">{t.user.email}</p></td>
                <td className="font-mono text-xs">{t.staffNumber}</td>
                <td>{t.specialization ?? "—"}</td>
                <td>{t.assignments.length || <span className="text-amber-700">Unassigned</span>}</td>
                <td>{t.classTeacherAssignments.map((c) => c.class.name).join(", ") || "—"}</td>
                <td><StatusBadge status={t.user.status} /></td>
                <td className="text-right"><Link className="btn-ghost btn-sm" href={`/admin/teachers/${t.id}`}>Manage</Link></td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <EmptyState title="No teachers yet" description="Approved teacher applications appear here." />}
        <Pagination page={page} pageSize={pageSize} total={total} basePath="/admin/teachers" params={{ q: sp.q }} />
      </Card>
    </div>
  );
}
