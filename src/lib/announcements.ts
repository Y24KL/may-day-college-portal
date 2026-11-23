import type { AudienceType, Prisma } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/current-user";
import { notify } from "@/lib/notifications";

/** Resolve an announcement's audiences into recipient user ids. */
export async function resolveAudience(audiences: { type: AudienceType; targetId: string | null }[], tx: Tx = db): Promise<string[]> {
  const ids = new Set<string>();
  const current = await tx.academicSession.findFirst({ where: { isCurrent: true } });
  const studentsWhere = async (where: Prisma.StudentEnrollmentWhereInput) => {
    if (!current) return [];
    const enr = await tx.studentEnrollment.findMany({ where: { ...where, sessionId: current.id, status: "ACTIVE", student: { status: "ACTIVE", user: { status: "ACTIVE" } } }, select: { student: { select: { id: true, userId: true } } } });
    return enr.map((e) => e.student);
  };
  const addStudentsAndParents = async (students: { id: string; userId: string }[], includeParents: boolean) => {
    students.forEach((s) => ids.add(s.userId));
    if (includeParents && students.length) {
      const rels = await tx.parentStudentRelationship.findMany({ where: { studentId: { in: students.map((s) => s.id) }, status: "VERIFIED" }, select: { parent: { select: { userId: true } } } });
      rels.forEach((r) => ids.add(r.parent.userId));
    }
  };
  for (const a of audiences) {
    switch (a.type) {
      case "EVERYONE": {
        const users = await tx.user.findMany({ where: { status: "ACTIVE", roles: { some: { role: { key: { in: ["student", "teacher", "parent"] } } } } }, select: { id: true } });
        users.forEach((u) => ids.add(u.id));
        break;
      }
      case "ALL_STUDENTS":
        await addStudentsAndParents(await studentsWhere({}), false);
        break;
      case "CLASS_LEVEL":
        if (a.targetId) await addStudentsAndParents(await studentsWhere({ class: { levelId: a.targetId } }), true);
        break;
      case "SECTOR":
        if (a.targetId) await addStudentsAndParents(await studentsWhere({ class: { sectorId: a.targetId } }), true);
        break;
      case "CLASS":
        if (a.targetId) await addStudentsAndParents(await studentsWhere({ classId: a.targetId }), true);
        break;
      case "TEACHERS": {
        const t = await tx.teacher.findMany({ where: { isActive: true, user: { status: "ACTIVE" } }, select: { userId: true } });
        t.forEach((x) => ids.add(x.userId));
        break;
      }
      case "PARENTS": {
        const p = await tx.parent.findMany({ where: { user: { status: "ACTIVE", emailVerifiedAt: { not: null } } }, select: { userId: true } });
        p.forEach((x) => ids.add(x.userId));
        break;
      }
      case "USER":
        if (a.targetId) ids.add(a.targetId);
        break;
    }
  }
  return [...ids];
}

/** Prisma filter for announcements visible to a user (notice board). */
export async function visibleAnnouncementsWhere(u: CurrentUser): Promise<Prisma.AnnouncementWhereInput> {
  const now = new Date();
  const or: Prisma.AnnouncementAudienceWhereInput[] = [{ type: "EVERYONE" }, { type: "USER", targetId: u.id }];
  const classScopes = async (studentIds: string[]) => {
    const current = await db.academicSession.findFirst({ where: { isCurrent: true } });
    if (!current || !studentIds.length) return;
    const enr = await db.studentEnrollment.findMany({ where: { studentId: { in: studentIds }, sessionId: current.id }, include: { class: true } });
    for (const e of enr) or.push({ type: "CLASS", targetId: e.classId }, { type: "CLASS_LEVEL", targetId: e.class.levelId }, { type: "SECTOR", targetId: e.class.sectorId });
  };
  if (u.studentId) {
    or.push({ type: "ALL_STUDENTS" });
    await classScopes([u.studentId]);
  }
  if (u.teacherId) or.push({ type: "TEACHERS" });
  if (u.parentId) {
    or.push({ type: "PARENTS" });
    const rels = await db.parentStudentRelationship.findMany({ where: { parentId: u.parentId, status: "VERIFIED" }, select: { studentId: true } });
    await classScopes(rels.map((r) => r.studentId));
  }
  const base: Prisma.AnnouncementWhereInput = {
    OR: [{ status: "PUBLISHED" }, { status: "SCHEDULED", publishAt: { lte: now } }],
    publishAt: { lte: now },
    AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
  };
  if (u.isAdmin) return base; // administrators see the whole board
  return { ...base, audiences: { some: { OR: or } } };
}

/** Send in-app/email notifications for an announcement (once). */
export async function dispatchAnnouncement(announcementId: string) {
  return db.$transaction(async (tx) => {
    const claimed = await tx.announcement.updateMany({ where: { id: announcementId, notifiedAt: null }, data: { notifiedAt: new Date(), status: "PUBLISHED" } });
    if (!claimed.count) return 0;
    const a = await tx.announcement.findUniqueOrThrow({ where: { id: announcementId }, include: { audiences: true } });
    const recipients = await resolveAudience(a.audiences, tx);
    const sendEmail = a.priority === "HIGH" || a.priority === "URGENT";
    // Chunk to keep each insert reasonable.
    for (let i = 0; i < recipients.length; i += 500) {
      await notify(
        {
          userIds: recipients.slice(i, i + 500),
          category: "ANNOUNCEMENT",
          title: a.title,
          body: a.body.length > 220 ? a.body.slice(0, 217) + "…" : a.body,
          link: `/notices/${a.id}`,
          email: sendEmail ? { template: "announcement", priority: a.priority === "URGENT" ? "HIGH" : "LOW" } : undefined,
        },
        tx,
      );
    }
    return recipients.length;
  }, { timeout: 60_000 });
}
