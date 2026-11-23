"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { run, type ActionState } from "@/lib/action";
import { authorizeParent } from "@/lib/auth/guards";
import { hashToken } from "@/lib/auth/crypto";
import { audit } from "@/lib/audit";
import { notify, adminsWithPermission } from "@/lib/notifications";
import { kickEmailWorker } from "@/lib/email/worker";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Accept an invitation. Verification = possession of the emailed token (or the
 * invitation id while signed in) AND signing in with the SAME verified email
 * the invitation was sent to. Knowing a student's name/ID is never enough.
 */
export async function acceptInvitation(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const u = await authorizeParent();
    if (!rateLimit(`invite:${u.id}`, 10, 60 * 60_000).ok) throw new Error("Too many attempts.");
    const d = z.object({ token: z.string().optional(), invitationId: z.string().optional(), relationship: z.string().trim().min(2).max(40).default("Parent") }).parse(Object.fromEntries(fd));
    const inv = d.token ? await db.parentInvitation.findUnique({ where: { tokenHash: hashToken(d.token) } }) : d.invitationId ? await db.parentInvitation.findUnique({ where: { id: d.invitationId } }) : null;
    if (!inv || inv.status !== "PENDING") throw new Error("This invitation is invalid or has already been used.");
    if (inv.expiresAt < new Date()) {
      await db.parentInvitation.update({ where: { id: inv.id }, data: { status: "EXPIRED" } });
      throw new Error("This invitation has expired. Ask the school to send a new one.");
    }
    if (inv.email.toLowerCase() !== u.email.toLowerCase()) throw new Error(`This invitation was sent to a different email address. Sign in with that email to accept it, or submit a link request for administrator verification.`);
    await db.$transaction(async (tx) => {
      const settings = await tx.schoolSettings.findUniqueOrThrow({ where: { id: "school" } });
      const count = await tx.parentStudentRelationship.count({ where: { studentId: inv.studentId, status: "VERIFIED", NOT: { parentId: u.parentId } } });
      if (count >= settings.maxGuardiansPerStudent) throw new Error("This student already has the maximum number of linked guardians. Contact the school.");
      await tx.parentStudentRelationship.upsert({
        where: { parentId_studentId: { parentId: u.parentId, studentId: inv.studentId } },
        create: { parentId: u.parentId, studentId: inv.studentId, relationship: d.relationship, status: "VERIFIED", method: "INVITATION", verifiedAt: new Date() },
        update: { status: "VERIFIED", method: "INVITATION", verifiedAt: new Date(), revokedAt: null, revokedReason: null, relationship: d.relationship },
      });
      await tx.parentInvitation.update({ where: { id: inv.id }, data: { status: "ACCEPTED", acceptedAt: new Date(), acceptedByParentId: u.parentId } });
      const student = await tx.student.findUniqueOrThrow({ where: { id: inv.studentId } });
      await audit({ actorId: u.id, action: "parent.invitation_accept", entityType: "ParentStudentRelationship", entityId: inv.studentId, sensitive: true }, tx);
      await notify({ userIds: [u.id], category: "PARENT", title: "Child successfully linked", body: `You now have access to ${student.fullName}'s records.`, link: "/parent", email: { template: "parent-linked", priority: "NORMAL" } }, tx);
      await notify({ userIds: [student.userId], category: "PARENT", title: "Parent account linked", body: `${u.displayName} has linked their parent account to your profile.`, link: "/student/profile" }, tx);
    });
    await kickEmailWorker();
    return { ok: true, message: "Child linked.", redirect: "/parent" };
  });
}

export async function requestChildLink(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const u = await authorizeParent();
    if (!rateLimit(`linkreq:${u.id}`, 5, 24 * 3600_000).ok) throw new Error("You have submitted several requests today. Please wait for the school to review them.");
    const d = z.object({ childFullName: z.string().trim().min(3, "Enter the child's full name.").max(120), childStudentNumber: z.string().trim().max(30).optional(), relationship: z.string().trim().min(2).max(40), details: z.string().trim().max(1000).optional() }).parse(Object.fromEntries(fd));
    const r = await db.parentLinkRequest.create({ data: { parentId: u.parentId, childFullName: d.childFullName, childStudentNumber: d.childStudentNumber || null, relationship: d.relationship, details: d.details || null } });
    await audit({ actorId: u.id, action: "parent.link_request", entityType: "ParentLinkRequest", entityId: r.id });
    await notify({ userIds: await adminsWithPermission("parents.manage"), category: "PARENT", title: "Parent link request", body: `${u.displayName} requested access to ${d.childFullName}.`, link: "/admin/parents" });
    return { ok: true, message: "Request submitted. The school will verify the relationship before granting access." };
  });
}
