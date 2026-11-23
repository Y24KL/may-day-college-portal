import { db } from "@/lib/db";

export async function teacherWeek(teacherId: string) {
  const term = await db.term.findFirst({ where: { isCurrent: true } });
  if (!term) return { slots: [], periods: [], days: [] as number[] };
  const [slots, periods, settings] = await Promise.all([
    db.timetablePeriod.findMany({ where: { teacherId, timetable: { status: "PUBLISHED", termId: term.id } }, include: { period: true, timetable: { include: { class: true } }, offering: { include: { subject: true } }, classroom: true } }),
    db.periodDefinition.findMany({ orderBy: { order: "asc" } }),
    db.schoolSettings.findUniqueOrThrow({ where: { id: "school" } }),
  ]);
  return { slots, periods, days: settings.schoolDays.split(",").map(Number) };
}

/** Lagos-local "now": day of week (1=Mon) and minutes since midnight. */
export function lagosNow() {
  const n = new Date(Date.now() + 3600_000);
  return { dow: ((n.getUTCDay() + 6) % 7) + 1, minutes: n.getUTCHours() * 60 + n.getUTCMinutes() };
}
