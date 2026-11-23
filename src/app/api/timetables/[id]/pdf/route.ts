import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/current-user";
import { tablePdf, pdfResponse } from "@/lib/pdf/simple";
import { termLabel } from "@/lib/academic";

export const dynamic = "force-dynamic";
const DAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await getCurrentUser();
  if (!u) return new Response("Unauthorized", { status: 401 });
  const tt = await db.timetable.findUnique({ where: { id }, include: { class: true, term: { include: { session: true } }, periods: { include: { period: true, offering: { include: { subject: true } }, teacher: true, classroom: true } } } });
  if (!tt) return new Response("Not found", { status: 404 });
  let allowed = u.isAdmin && u.permissions.has("timetable.manage");
  if (!allowed && tt.status === "PUBLISHED") {
    if (u.studentId) allowed = !!(await db.studentEnrollment.findFirst({ where: { studentId: u.studentId, classId: tt.classId, sessionId: tt.sessionId } }));
    if (!allowed && u.parentId) allowed = !!(await db.parentStudentRelationship.findFirst({ where: { parentId: u.parentId, status: "VERIFIED", student: { enrollments: { some: { classId: tt.classId, sessionId: tt.sessionId } } } } }));
    if (!allowed && u.teacherId) allowed = tt.periods.some((p) => p.teacherId === u.teacherId);
  }
  if (!allowed) return new Response("Not found", { status: 404 });
  const [periods, settings] = await Promise.all([db.periodDefinition.findMany({ orderBy: { order: "asc" } }), db.schoolSettings.findUniqueOrThrow({ where: { id: "school" } })]);
  const days = settings.schoolDays.split(",").map(Number);
  const rows = periods.map((p) => [
    `${p.name} ${p.startTime}-${p.endTime}`,
    ...days.map((d) => {
      if (p.isBreak) return "Break";
      const c = tt.periods.find((x) => x.dayOfWeek === d && x.periodId === p.id);
      return c ? `${c.offering?.subject.name ?? c.note ?? ""}${c.teacher ? ` (${c.teacher.fullName.split(" ")[0]})` : ""}${c.classroom ? ` ${c.classroom.name}` : ""}` : "";
    }),
  ]);
  const pdf = await tablePdf({ title: `${tt.class.name} Timetable`, subtitle: [termLabel(tt.term), tt.status === "PUBLISHED" ? "" : `Status: ${tt.status}`], headers: ["Period", ...days.map((d) => DAYS[d])], rows, landscape: true, widths: [120, ...days.map(() => (770 - 120) / days.length)] });
  return pdfResponse(pdf, `timetable-${tt.class.name.replace(/\s+/g, "-")}.pdf`);
}
