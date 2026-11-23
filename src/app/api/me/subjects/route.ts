import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/current-user";
import { tablePdf, pdfResponse } from "@/lib/pdf/simple";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Downloadable registered-subjects slip for the signed-in student. */
export async function GET() {
  const u = await getCurrentUser();
  if (!u?.studentId) return new Response("Unauthorized", { status: 401 });
  const reg = await db.subjectRegistration.findFirst({ where: { studentId: u.studentId, session: { isCurrent: true } }, include: { student: true, session: true, enrollment: { include: { class: true } }, items: { include: { offering: { include: { subject: true, teacherAssignments: { where: { isActive: true }, include: { teacher: true } } } } } } } });
  if (!reg) return new Response("No registration found", { status: 404 });
  const pdf = await tablePdf({
    title: "Registered Subjects",
    subtitle: [`${reg.student.fullName} (${reg.student.studentNumber}) - ${reg.enrollment.class.name}`, `${reg.session.name} - Reference ${reg.reference} - ${reg.status} - ${formatDate(reg.submittedAt)}`],
    headers: ["#", "Subject", "Code", "Type", "Teacher"],
    rows: reg.items.sort((a, b) => a.offering.subject.name.localeCompare(b.offering.subject.name)).map((i, k) => [String(k + 1), i.offering.subject.name, i.offering.subject.code, i.offering.isCompulsory ? "Compulsory" : "Elective", i.offering.teacherAssignments.map((a) => a.teacher.fullName).join(", ")]),
    widths: [30, 170, 60, 90, 173],
  });
  return pdfResponse(pdf, `subjects-${reg.reference}.pdf`);
}
