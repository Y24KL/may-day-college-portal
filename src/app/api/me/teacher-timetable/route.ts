import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/current-user";
import { tablePdf, pdfResponse } from "@/lib/pdf/simple";

export const dynamic = "force-dynamic";
const DAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export async function GET() {
  const u = await getCurrentUser();
  if (!u?.teacherId) return new Response("Unauthorized", { status: 401 });
  const term = await db.term.findFirst({ where: { isCurrent: true } });
  const [slots, periods, settings, t] = await Promise.all([
    db.timetablePeriod.findMany({ where: { teacherId: u.teacherId, timetable: { status: "PUBLISHED", termId: term?.id } }, include: { timetable: { include: { class: true } }, offering: { include: { subject: true } }, classroom: true } }),
    db.periodDefinition.findMany({ orderBy: { order: "asc" } }),
    db.schoolSettings.findUniqueOrThrow({ where: { id: "school" } }),
    db.teacher.findUniqueOrThrow({ where: { id: u.teacherId } }),
  ]);
  const days = settings.schoolDays.split(",").map(Number);
  const rows = periods.map((p) => [`${p.name} ${p.startTime}-${p.endTime}`, ...days.map((d) => (p.isBreak ? "Break" : slots.filter((s) => s.dayOfWeek === d && s.periodId === p.id).map((s) => `${s.offering?.subject.name ?? ""} - ${s.timetable.class.name}${s.classroom ? ` (${s.classroom.name})` : ""}`).join("; ")))]);
  const pdf = await tablePdf({ title: "Teaching Timetable", subtitle: [`${t.fullName} (${t.staffNumber})`], headers: ["Period", ...days.map((d) => DAYS[d])], rows, landscape: true, widths: [120, ...days.map(() => (770 - 120) / days.length)] });
  return pdfResponse(pdf, "my-timetable.pdf");
}
