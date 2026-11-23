/** Pure timetable conflict detection. */
export type Slot = {
  id?: string;
  timetableId: string;
  classLabel: string;
  dayOfWeek: number;
  periodId: string;
  startTime: string;
  endTime: string;
  teacherId?: string | null;
  teacherName?: string | null;
  classroomId?: string | null;
  classroomName?: string | null;
};

export function toMinutes(t: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function overlaps(a: { startTime: string; endTime: string }, b: { startTime: string; endTime: string }) {
  return toMinutes(a.startTime) < toMinutes(b.endTime) && toMinutes(b.startTime) < toMinutes(a.endTime);
}

export function validatePeriods(periods: { name: string; startTime: string; endTime: string }[]): string[] {
  const errs: string[] = [];
  for (const p of periods) {
    const s = toMinutes(p.startTime), e = toMinutes(p.endTime);
    if (Number.isNaN(s) || Number.isNaN(e)) errs.push(`${p.name}: times must be HH:MM.`);
    else if (s >= e) errs.push(`${p.name}: start must be before end.`);
  }
  for (let i = 0; i < periods.length; i++)
    for (let j = i + 1; j < periods.length; j++)
      if (overlaps(periods[i], periods[j])) errs.push(`${periods[i].name} overlaps ${periods[j].name}.`);
  return errs;
}

export type Conflict = { type: "TEACHER" | "CLASSROOM" | "CLASS"; message: string };

/**
 * Detect conflicts between the candidate timetable's slots and every other
 * slot in scope (other timetables of the same term).
 */
export function detectConflicts(candidate: Slot[], others: Slot[]): Conflict[] {
  const conflicts: Conflict[] = [];
  const day = (d: number) => ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d] ?? String(d);
  // Within the candidate: one class can't have two lessons overlapping.
  for (let i = 0; i < candidate.length; i++) {
    for (let j = i + 1; j < candidate.length; j++) {
      const a = candidate[i], b = candidate[j];
      if (a.dayOfWeek === b.dayOfWeek && a.periodId !== b.periodId && overlaps(a, b)) {
        conflicts.push({ type: "CLASS", message: `${a.classLabel} has overlapping lessons on ${day(a.dayOfWeek)} ${a.startTime}.` });
      }
    }
  }
  const all = [...candidate, ...others.filter((o) => o.timetableId !== candidate[0]?.timetableId)];
  for (const a of candidate) {
    for (const b of all) {
      if (a === b || a.dayOfWeek !== b.dayOfWeek || !overlaps(a, b)) continue;
      if (a.id && b.id && a.id === b.id) continue;
      const sameTt = a.timetableId === b.timetableId;
      if (a.teacherId && a.teacherId === b.teacherId && !(sameTt && a.periodId === b.periodId)) {
        conflicts.push({ type: "TEACHER", message: `${a.teacherName ?? "Teacher"} is double-booked on ${day(a.dayOfWeek)} ${a.startTime} (${a.classLabel} and ${b.classLabel}).` });
      }
      if (a.classroomId && a.classroomId === b.classroomId && !(sameTt && a.periodId === b.periodId)) {
        conflicts.push({ type: "CLASSROOM", message: `${a.classroomName ?? "Classroom"} is double-booked on ${day(a.dayOfWeek)} ${a.startTime} (${a.classLabel} and ${b.classLabel}).` });
      }
    }
  }
  // de-duplicate symmetric messages
  return [...new Map(conflicts.map((c) => [c.message, c])).values()];
}
