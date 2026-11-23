import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireAdminPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { PageHeader, Card, EmptyState, StatusBadge, Pagination, FilterBar } from "@/components/ui";
import { classOptions, sessionOptions } from "@/lib/options";
import { getCurrentSessionTerm } from "@/lib/academic";
import { pageParams } from "@/lib/utils";
import { UserPlus, ClipboardCheck, ArrowUpRight, Download } from "lucide-react";

export const metadata = { title: "Student management" };

export default async function StudentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requireAdminPage("students.view");
  const sp = await searchParams;
  const { session: current } = await getCurrentSessionTerm();
  const sessionId = sp.sessionId ?? current?.id;
  const { page, skip, take, pageSize } = pageParams(sp);
  const where: Prisma.StudentWhereInput = {
    ...(sp.q ? { OR: [{ fullName: { contains: sp.q, mode: "insensitive" } }, { studentNumber: { contains: sp.q, mode: "insensitive" } }, { user: { email: { contains: sp.q, mode: "insensitive" } } }] } : {}),
    ...(sp.classId || sp.levelId ? { enrollments: { some: { sessionId, ...(sp.classId ? { classId: sp.classId } : {}) } } } : {}),
    ...(sp.status === "SUSPENDED" ? { user: { status: "SUSPENDED" } } : sp.status ? { status: sp.status as "ACTIVE" } : {}),
  };
  const [rows, total, classes, sessions, pending] = await Promise.all([
    db.student.findMany({ where, skip, take, orderBy: { fullName: "asc" }, include: { user: { select: { status: true, email: true } }, enrollments: { where: { sessionId }, include: { class: true } } } }),
    db.student.count({ where }),
    classOptions(false),
    sessionOptions(),
    db.studentApplication.count({ where: { status: "PENDING_APPROVAL" } }),
  ]);
  const canManage = u.permissions.has("students.manage");
  return (
    <div>
      <PageHeader
        title="Student management"
        description="All approved students. Applications are reviewed under Registrations."
        actions={
          <>
            <Link href="/admin/students/applications" className="btn-secondary"><ClipboardCheck className="h-4 w-4" /> Registrations {pending > 0 && <span className="badge bg-gold text-navy">{pending}</span>}</Link>
            {u.permissions.has("students.promote") && <Link href="/admin/students/promote" className="btn-secondary"><ArrowUpRight className="h-4 w-4" /> Promotion</Link>}
            {u.permissions.has("reports.view") && <Link href={`/api/reports/students?format=csv${sessionId ? `&sessionId=${sessionId}` : ""}`} className="btn-secondary"><Download className="h-4 w-4" /> Export</Link>}
            {canManage && <Link href="/admin/students/new" className="btn-primary"><UserPlus className="h-4 w-4" /> Register student</Link>}
          </>
        }
      />
      <Card>
        <FilterBar>
          <input name="q" defaultValue={sp.q} placeholder="Name, student ID or email" className="input max-w-xs" aria-label="Search" />
          <select name="sessionId" defaultValue={sessionId} className="input max-w-[11rem]" aria-label="Session">{sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <select name="classId" defaultValue={sp.classId ?? ""} className="input max-w-[12rem]" aria-label="Class"><option value="">All classes</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select name="status" defaultValue={sp.status ?? ""} className="input max-w-[10rem]" aria-label="Status"><option value="">Any status</option><option value="ACTIVE">Active</option><option value="GRADUATED">Graduated</option><option value="WITHDRAWN">Withdrawn</option><option value="SUSPENDED">Suspended account</option></select>
        </FilterBar>
        {rows.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Student</th><th>Student ID</th><th>Class ({sessions.find((s) => s.id === sessionId)?.name ?? "—"})</th><th>Status</th><th /></tr></thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td><p className="font-semibold text-navy">{s.fullName}</p><p className="text-xs text-muted">{s.user.email}</p></td>
                    <td className="font-mono text-xs">{s.studentNumber}</td>
                    <td>{s.enrollments[0]?.class.name ?? <span className="text-muted">Not enrolled</span>}</td>
                    <td className="space-x-1"><StatusBadge status={s.status} />{s.user.status !== "ACTIVE" && <StatusBadge status={s.user.status} />}</td>
                    <td className="text-right"><Link href={`/admin/students/${s.id}`} className="btn-ghost btn-sm">Open</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No students found" description={sp.q ? "Try a different search." : "Approved student registrations will appear here."} />
        )}
        <Pagination page={page} pageSize={pageSize} total={total} basePath="/admin/students" params={{ q: sp.q, classId: sp.classId, sessionId, status: sp.status }} />
      </Card>
    </div>
  );
}
