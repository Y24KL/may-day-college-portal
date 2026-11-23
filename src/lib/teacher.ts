import { db } from "@/lib/db";

/** Offerings assigned to a teacher for the current session (admin-controlled). */
export async function teacherOfferings(teacherId: string, sessionId?: string) {
  const sid = sessionId ?? (await db.academicSession.findFirst({ where: { isCurrent: true } }))?.id;
  if (!sid) return [];
  return db.subjectOffering.findMany({
    where: { sessionId: sid, isActive: true, teacherAssignments: { some: { teacherId, isActive: true } } },
    include: { subject: true, class: true, _count: { select: { registrationItems: { where: { registration: { status: "APPROVED" } } } } } },
    orderBy: [{ class: { name: "asc" } }, { subject: { name: "asc" } }],
  });
}

export async function classTeacherClasses(teacherId: string) {
  const s = await db.academicSession.findFirst({ where: { isCurrent: true } });
  if (!s) return [];
  return db.classTeacherAssignment.findMany({ where: { teacherId, sessionId: s.id }, include: { class: true, session: true } });
}

/** All student ids a teacher may access (subject registrations + class-teacher classes). */
export async function teacherStudentIds(teacherId: string): Promise<Set<string>> {
  const offerings = await teacherOfferings(teacherId);
  const items = await db.subjectRegistrationItem.findMany({ where: { offeringId: { in: offerings.map((o) => o.id) }, registration: { status: "APPROVED" } }, select: { registration: { select: { studentId: true } } } });
  const ids = new Set(items.map((i) => i.registration.studentId));
  for (const c of await classTeacherClasses(teacherId)) {
    const enr = await db.studentEnrollment.findMany({ where: { classId: c.classId, sessionId: c.sessionId, status: "ACTIVE" }, select: { studentId: true } });
    enr.forEach((e) => ids.add(e.studentId));
  }
  return ids;
}
