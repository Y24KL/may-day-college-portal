import Link from "next/link";
import { requireTeacherPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { teacherOfferings } from "@/lib/teacher";
import { PageHeader, Card, EmptyState, Badge, StatusBadge } from "@/components/ui";

export const metadata = { title: "My subjects" };

export default async function TeacherSubjects() {
  const u = await requireTeacherPage();
  const offerings = await teacherOfferings(u.teacherId);
  const term = await db.term.findFirst({ where: { isCurrent: true } });
  const sheets = term ? await db.scoreSubmission.findMany({ where: { termId: term.id, offeringId: { in: offerings.map((o) => o.id) } } }) : [];
  return (
    <div>
      <PageHeader title="My subjects" description="Assigned by the academic office for the current session." />
      {offerings.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{offerings.map((o) => (
          <Card key={o.id} title={o.subject.name} description={o.class.name} actions={<Badge tone={o.isCompulsory ? "navy" : "blue"}>{o.isCompulsory ? "Compulsory" : "Elective"}</Badge>}>
            <p className="text-sm"><b>{o._count.registrationItems}</b> registered student(s)</p>
            <p className="mt-1 text-xs text-muted">This term&apos;s scores: <StatusBadge status={sheets.find((s) => s.offeringId === o.id)?.status ?? "DRAFT"} /></p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link className="btn-secondary btn-sm" href={`/teacher/students?offering=${o.id}`}>Students</Link>
              <Link className="btn-secondary btn-sm" href={`/teacher/attendance?type=LESSON&offeringId=${o.id}`}>Attendance</Link>
              <Link className="btn-primary btn-sm" href={`/teacher/scores?offering=${o.id}`}>Scores</Link>
            </div>
          </Card>
        ))}</div>
      ) : <Card><EmptyState title="No subjects assigned" description="Once the school assigns you to subjects, they appear here." /></Card>}
    </div>
  );
}
