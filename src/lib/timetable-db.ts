import { db } from "@/lib/db";
import { detectConflicts, type Slot } from "@/lib/timetable";

export async function slotsForTimetable(timetableId: string): Promise<Slot[]> {
  const tt = await db.timetable.findUniqueOrThrow({ where: { id: timetableId }, include: { class: true, periods: { include: { period: true, teacher: true, classroom: true } } } });
  return tt.periods.map((p) => ({
    id: p.id, timetableId: tt.id, classLabel: tt.class.name, dayOfWeek: p.dayOfWeek, periodId: p.periodId, startTime: p.period.startTime, endTime: p.period.endTime,
    teacherId: p.teacherId, teacherName: p.teacher?.fullName, classroomId: p.classroomId, classroomName: p.classroom?.name,
  }));
}

/** Conflicts between a timetable and the other non-archived timetables of the same term. */
export async function conflictsFor(timetableId: string) {
  const tt = await db.timetable.findUniqueOrThrow({ where: { id: timetableId } });
  const candidate = await slotsForTimetable(timetableId);
  const others = await db.timetable.findMany({ where: { termId: tt.termId, id: { not: tt.id }, status: { not: "ARCHIVED" } }, select: { id: true } });
  const otherSlots = (await Promise.all(others.map((o) => slotsForTimetable(o.id)))).flat();
  return detectConflicts(candidate, otherSlots);
}
