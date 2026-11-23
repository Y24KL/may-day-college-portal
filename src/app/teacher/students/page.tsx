import Link from "next/link";
import { requireTeacherPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { teacherOfferings, classTeacherClasses, teacherStudentIds } from "@/lib/teacher";
import { PageHeader, Card, EmptyState, FilterBar } from "@/components/ui";

export const metadata = { title: "Student directory" };

export default async function StudentDirectory({ searchParams }: { searchParams: Promise<{ q?: string; offering?: string; classId?: string }> }) {
  const u = await requireTeacherPage();
  const sp = await searchParams;
  const [offerings, cts, allowed] = await Promise.all([teacherOfferings(u.teacherId), classTeacherClasses(u.teacherId), teacherStudentIds(u.teacherId)]);
  let ids = [...allowed];
  if (sp.offering && offerings.some((o) => o.id === sp.offering)) {
    const items = await db.subjectRegistrationItem.findMany({ where: { offeringId: sp.offering, registration: { status: "APPROVED" } }, select: { registration: { select: { studentId: true } } } });
    ids = items.map((i) => i.registration.studentId).filter((id) => allowed.has(id));
  }
  const session = await db.academicSession.findFirst({ where: { isCurrent: true } });
  const students = ids.length ? await db.student.findMany({
    where: { id: { in: ids }, ...(sp.q ? { OR: [{ fullName: { contains: sp.q, mode: "insensitive" } }, { studentNumber: { contains: sp.q, mode: "insensitive" } }] } : {}), ...(sp.classId ? { enrollments: { some: { classId: sp.classId, sessionId: session?.id } } } : {}) },
    include: { enrollments: { where: { sessionId: session?.id }, include: { class: true } } },
    orderBy: { fullName: "asc" },
  }) : [];
  const classOpts = [...new Map([...offerings.map((o) => [o.classId, o.class.name] as const), ...cts.map((c) => [c.classId, c.class.name] as const)]).entries()];
  return (
    <div>
      <PageHeader title="Student directory" description="Only students registered for your subjects or in your class-teacher classes." />
      <Card>
        <FilterBar>
          <input name="q" defaultValue={sp.q} placeholder="Name or student ID" className="input max-w-xs" aria-label="Search" />
          <select name="offering" defaultValue={sp.offering ?? ""} className="input max-w-[16rem]" aria-label="Subject"><option value="">All my subjects</option>{offerings.map((o) => <option key={o.id} value={o.id}>{o.subject.name} · {o.class.name}</option>)}</select>
          <select name="classId" defaultValue={sp.classId ?? ""} className="input max-w-[12rem]" aria-label="Class"><option value="">All classes</option>{classOpts.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
        </FilterBar>
        {students.length ? (
          <div className="table-wrap"><table className="table"><thead><tr><th>Student</th><th>Student ID</th><th>Class</th><th /></tr></thead>
            <tbody>{students.map((s) => <tr key={s.id}><td className="font-medium text-navy">{s.fullName}</td><td className="font-mono text-xs">{s.studentNumber}</td><td>{s.enrollments[0]?.class.name ?? "—"}</td><td className="text-right"><Link className="btn-ghost btn-sm" href={`/teacher/students/${s.id}`}>View</Link></td></tr>)}</tbody></table></div>
        ) : <EmptyState title="No students" description={allowed.size ? "No students match your filters." : "You will see students once they register for your assigned subjects."} />}
      </Card>
    </div>
  );
}
