import { db } from "@/lib/db";

/**
 * A teacher may see a student only if the student is registered for an
 * offering the teacher is actively assigned to, or the teacher is the class
 * teacher of the student's class for that session.
 */
export async function teacherCanAccessStudent(teacherId: string, studentId: string): Promise<boolean> {
  const viaSubject = await db.subjectRegistrationItem.findFirst({
    where: {
      registration: { studentId, status: "APPROVED" },
      offering: { teacherAssignments: { some: { teacherId, isActive: true } } },
    },
    select: { id: true },
  });
  if (viaSubject) return true;
  const viaClass = await db.studentEnrollment.findFirst({
    where: { studentId, class: { classTeacherAssignments: { some: { teacherId } } } },
    select: { id: true, classId: true, sessionId: true },
  });
  if (!viaClass) return false;
  const cta = await db.classTeacherAssignment.findFirst({ where: { teacherId, classId: viaClass.classId, sessionId: viaClass.sessionId } });
  return Boolean(cta);
}

export async function teacherOwnsOffering(teacherId: string, offeringId: string): Promise<boolean> {
  const a = await db.teacherAssignment.findFirst({ where: { teacherId, offeringId, isActive: true }, select: { id: true } });
  return Boolean(a);
}

export async function parentCanAccessStudent(parentId: string, studentId: string): Promise<boolean> {
  const rel = await db.parentStudentRelationship.findFirst({ where: { parentId, studentId, status: "VERIFIED" }, select: { id: true } });
  return Boolean(rel);
}

/** Students registered (submitted/approved) for an offering. */
export async function studentsForOffering(offeringId: string) {
  const items = await db.subjectRegistrationItem.findMany({
    where: { offeringId, registration: { status: "APPROVED" } },
    include: { registration: { include: { student: { select: { id: true, fullName: true, studentNumber: true, gender: true, photoFileId: true } } } } },
  });
  return items.map((i) => i.registration.student).sort((a, b) => a.fullName.localeCompare(b.fullName));
}
