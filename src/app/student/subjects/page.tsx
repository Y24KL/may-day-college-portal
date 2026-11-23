import Link from "next/link";
import { requireStudentPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { PageHeader, Card, EmptyState, StatusBadge, Badge } from "@/components/ui";
import { Download } from "lucide-react";

export const metadata = { title: "My subjects" };

export default async function MySubjects() {
  const u = await requireStudentPage();
  const regs = await db.subjectRegistration.findMany({ where: { studentId: u.studentId }, include: { session: true, enrollment: { include: { class: true } }, items: { include: { offering: { include: { subject: true, teacherAssignments: { where: { isActive: true }, include: { teacher: true } } } } } } }, orderBy: { session: { startDate: "desc" } } });
  return (
    <div className="space-y-5">
      <PageHeader title="My subjects" actions={regs.some((r) => r.session.isCurrent) && <a className="btn-secondary" href="/api/me/subjects" target="_blank"><Download className="h-4 w-4" /> Download list</a>} />
      {regs.length ? regs.map((r) => (
        <Card key={r.id} title={`${r.session.name} · ${r.enrollment.class.name}`} description={`Reference ${r.reference}`} actions={<StatusBadge status={r.status} />}>
          {r.reviewNote && <p className="mb-3 text-sm text-muted">Note: {r.reviewNote}</p>}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{r.items.sort((a, b) => Number(b.offering.isCompulsory) - Number(a.offering.isCompulsory) || a.offering.subject.name.localeCompare(b.offering.subject.name)).map((i) => (
            <div key={i.id} className="rounded-xl bg-white/60 p-3"><p className="font-semibold text-navy">{i.offering.subject.name}</p><p className="text-xs text-muted">{i.offering.teacherAssignments.map((a) => a.teacher.fullName).join(", ") || "Teacher to be assigned"}</p><Badge tone={i.offering.isCompulsory ? "navy" : "blue"} className="mt-1">{i.offering.isCompulsory ? "Compulsory" : "Elective"}</Badge></div>
          ))}</div>
        </Card>
      )) : <Card><EmptyState title="No subjects registered" action={<Link className="btn-primary" href="/student/registration">Register subjects</Link>} /></Card>}
    </div>
  );
}
