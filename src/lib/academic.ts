import { cache } from "react";
import { db } from "@/lib/db";

export const getCurrentSessionTerm = cache(async () => {
  const [session, term] = await Promise.all([
    db.academicSession.findFirst({ where: { isCurrent: true } }),
    db.term.findFirst({ where: { isCurrent: true }, include: { session: true } }),
  ]);
  return { session, term };
});

export function termLabel(t: { name: string; session?: { name: string } | null }) {
  return t.session ? `${t.session.name} ${t.name}` : t.name;
}

/** The student's enrollment for the current session (if any). */
export async function currentEnrollment(studentId: string) {
  const { session } = await getCurrentSessionTerm();
  if (!session) return null;
  return db.studentEnrollment.findUnique({
    where: { studentId_sessionId: { studentId, sessionId: session.id } },
    include: { class: { include: { level: true, sector: true } }, session: true },
  });
}

export async function latestEnrollment(studentId: string) {
  return db.studentEnrollment.findFirst({
    where: { studentId },
    orderBy: { session: { startDate: "desc" } },
    include: { class: { include: { level: true, sector: true } }, session: true },
  });
}

/** Published subject results for a student, chronologically. */
export async function publishedResultsForStudent(studentId: string) {
  const details = await db.resultDetail.findMany({
    where: { studentId, submission: { status: "PUBLISHED" }, total: { not: null } },
    include: { submission: { include: { offering: { include: { subject: true } } } }, term: { include: { session: true } } },
  });
  return details
    .map((d) => ({
      termId: d.termId,
      termLabel: termLabel(d.term),
      order: d.term.session.startDate.getTime() / 1e5 + d.term.order,
      subject: d.submission.offering.subject.name,
      total: Number(d.total),
      grade: d.grade,
      ca: d.caScore === null ? null : Number(d.caScore),
      exam: d.examScore === null ? null : Number(d.examScore),
      gradeDescription: d.gradeDescription,
      teacherRemark: d.teacherRemark,
      sessionName: d.term.session.name,
      termName: d.term.name,
    }))
    .sort((a, b) => a.order - b.order || a.subject.localeCompare(b.subject));
}

/** Attendance summary for a student (optionally a term), daily registers preferred. */
export async function attendanceSummary(studentId: string, termId?: string) {
  const records = await db.attendanceRecord.findMany({
    where: { studentId, session: termId ? { termId } : undefined },
    select: { status: true, session: { select: { type: true, date: true } } },
  });
  const daily = records.filter((r) => r.session.type === "DAILY");
  const use = daily.length ? daily : records;
  const count = (s: string) => use.filter((r) => r.status === s).length;
  const present = count("PRESENT"), late = count("LATE"), absent = count("ABSENT"), excused = count("EXCUSED");
  const total = use.length;
  const pct = total ? Math.round(((present + late) / total) * 1000) / 10 : null;
  return { type: daily.length ? "DAILY" : records.length ? "LESSON" : null, total, present, late, absent, excused, percentage: pct };
}
