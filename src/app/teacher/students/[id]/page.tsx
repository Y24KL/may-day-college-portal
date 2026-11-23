import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeacherPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { teacherCanAccessStudent } from "@/lib/access";
import { teacherOfferings } from "@/lib/teacher";
import { attendanceSummary, termLabel } from "@/lib/academic";
import { PageHeader, Card, DL, EmptyState, Badge } from "@/components/ui";

export default async function TeacherStudentView({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireTeacherPage();
  const { id } = await params;
  if (!(await teacherCanAccessStudent(u.teacherId, id))) notFound();
  const offerings = await teacherOfferings(u.teacherId);
  const [s, att, details] = await Promise.all([
    db.student.findUniqueOrThrow({ where: { id }, include: { enrollments: { include: { class: true, session: true }, orderBy: { session: { startDate: "desc" } }, take: 1 } } }),
    attendanceSummary(id),
    // Only results in subjects this teacher teaches (published or own drafts).
    db.resultDetail.findMany({ where: { studentId: id, submission: { offeringId: { in: offerings.map((o) => o.id) } } }, include: { submission: { include: { offering: { include: { subject: true } }, term: { include: { session: true } } } } } }),
  ]);
  return (
    <div className="space-y-5">
      <PageHeader title={s.fullName} eyebrow={s.studentNumber} actions={<Link className="btn-secondary" href="/teacher/students">Back</Link>} />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Profile">
          <div className="flex gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {s.photoFileId ? <img src={`/api/files/${s.photoFileId}`} alt="" className="h-28 w-24 rounded-xl object-cover" /> : null}
            <DL items={[["Class", s.enrollments[0]?.class.name], ["Session", s.enrollments[0]?.session.name], ["Gender", s.gender], ["Attendance", att.percentage === null ? "—" : `${att.percentage}%`]]} />
          </div>
        </Card>
        <Card title="My subject scores" className="lg:col-span-2">
          {details.length ? (
            <div className="table-wrap"><table className="table"><thead><tr><th>Term</th><th>Subject</th><th>CA</th><th>Exam</th><th>Total</th><th>Grade</th><th>Status</th></tr></thead>
              <tbody>{details.map((d) => <tr key={d.id}><td className="text-xs">{termLabel(d.submission.term)}</td><td>{d.submission.offering.subject.name}</td><td>{d.caScore?.toString() ?? "—"}</td><td>{d.examScore?.toString() ?? "—"}</td><td className="font-semibold">{d.total?.toString() ?? "—"}</td><td>{d.grade}</td><td><Badge>{d.submission.status.toLowerCase()}</Badge></td></tr>)}</tbody></table></div>
          ) : <EmptyState title="No scores yet" />}
        </Card>
      </div>
    </div>
  );
}
