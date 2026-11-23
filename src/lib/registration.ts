import { db } from "@/lib/db";

export type OfferingLite = { id: string; isCompulsory: boolean; isActive: boolean; subjectName: string };

/** Pure validation of a subject selection (unit tested). */
export function validateSelection(offerings: OfferingLite[], selectedIds: string[], cfg: { minElectives: number; maxElectives: number }): string[] {
  const errors: string[] = [];
  const unique = new Set(selectedIds);
  if (unique.size !== selectedIds.length) errors.push("A subject was selected more than once.");
  const byId = new Map(offerings.map((o) => [o.id, o]));
  for (const id of unique) {
    const o = byId.get(id);
    if (!o || !o.isActive) errors.push("One of the selected subjects is not available for your class.");
  }
  for (const o of offerings.filter((x) => x.isActive && x.isCompulsory)) if (!unique.has(o.id)) errors.push(`${o.subjectName} is compulsory.`);
  const electives = [...unique].filter((id) => byId.get(id) && !byId.get(id)!.isCompulsory).length;
  if (electives < cfg.minElectives) errors.push(`Select at least ${cfg.minElectives} elective subject(s).`);
  if (electives > cfg.maxElectives) errors.push(`You may select at most ${cfg.maxElectives} elective subject(s).`);
  return [...new Set(errors)];
}

export function windowState(cfg: { isOpen: boolean; opensAt: Date | null; closesAt: Date | null } | null, now = new Date()) {
  if (!cfg) return { open: false, reason: "Subject registration has not been set up for your class yet." };
  if (!cfg.isOpen) return { open: false, reason: "Subject registration is closed for your class." };
  if (cfg.opensAt && cfg.opensAt > now) return { open: false, reason: `Registration opens ${cfg.opensAt.toLocaleString("en-NG", { timeZone: "Africa/Lagos" })}.` };
  if (cfg.closesAt && cfg.closesAt <= now) return { open: false, reason: "The registration window has closed." };
  return { open: true, reason: null };
}

export async function registrationContext(studentId: string) {
  const session = await db.academicSession.findFirst({ where: { isCurrent: true } });
  if (!session) return null;
  const enrollment = await db.studentEnrollment.findUnique({ where: { studentId_sessionId: { studentId, sessionId: session.id } }, include: { class: true, subjectRegistration: { include: { items: { include: { offering: { include: { subject: true } } } } } } } });
  if (!enrollment) return { session, enrollment: null } as const;
  const [cfg, offerings] = await Promise.all([
    db.subjectRegistrationConfig.findUnique({ where: { sessionId_classId: { sessionId: session.id, classId: enrollment.classId } } }),
    db.subjectOffering.findMany({ where: { sessionId: session.id, classId: enrollment.classId, isActive: true, subject: { isArchived: false } }, include: { subject: true, teacherAssignments: { where: { isActive: true }, include: { teacher: true } } }, orderBy: [{ isCompulsory: "desc" }, { subject: { name: "asc" } }] }),
  ]);
  return { session, enrollment, cfg, offerings, window: windowState(cfg) } as const;
}
