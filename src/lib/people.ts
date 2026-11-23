import { db, type Tx } from "@/lib/db";
import { nextCounter } from "@/lib/counters";
import { hashToken, randomToken } from "@/lib/auth/crypto";
import { enqueueEmail } from "@/lib/email/outbox";
import { env } from "@/lib/env";

export async function generateStudentNumber(tx: Tx, prefix: string) {
  const yy = String(new Date().getUTCFullYear()).slice(2);
  const n = await nextCounter(`student:${yy}`, tx);
  return `${prefix}/${yy}/${String(n).padStart(4, "0")}`;
}

export async function generateStaffNumber(tx: Tx, prefix: string) {
  const n = await nextCounter("staff", tx);
  return `${prefix}/${String(n).padStart(4, "0")}`;
}

/** Create and email a secure parent invitation (token valid 14 days). */
export async function inviteParent(tx: Tx, args: { studentId: string; email: string; studentName: string; schoolName: string }) {
  const token = randomToken(32);
  await tx.parentInvitation.updateMany({ where: { studentId: args.studentId, email: args.email.toLowerCase(), status: "PENDING" }, data: { status: "CANCELLED" } });
  const inv = await tx.parentInvitation.create({
    data: { studentId: args.studentId, email: args.email.toLowerCase(), tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 14 * 86400_000) },
  });
  const firstName = args.studentName.split(" ").slice(-1)[0];
  await enqueueEmail(
    {
      to: args.email,
      subject: `Link your parent account to ${firstName} — ${args.schoolName}`,
      template: "parent-invitation",
      priority: "HIGH",
      schoolName: args.schoolName,
      content: {
        heading: "You have been invited to the parent portal",
        paragraphs: [
          `${args.studentName} has been admitted to ${args.schoolName} and listed this email address as their parent/guardian.`,
          "Create (or sign in to) your parent account with THIS email address, then accept the invitation to view results, attendance, fees and announcements. The link expires in 14 days.",
        ],
        cta: { label: "Accept invitation", url: `${env.appBaseUrl}/parent/invitation?token=${token}` },
        footnote: "If you are not this student's parent or guardian, please ignore this email and contact the school.",
      },
    },
    tx,
  );
  return inv;
}

export async function ensureRole(tx: Tx, userId: string, roleKey: string, assignedById?: string) {
  const role = await tx.role.findUniqueOrThrow({ where: { key: roleKey } });
  await tx.userRole.upsert({ where: { userId_roleId: { userId, roleId: role.id } }, create: { userId, roleId: role.id, assignedById }, update: {} });
}

export async function removeRole(tx: Tx, userId: string, roleKey: string) {
  const role = await tx.role.findUnique({ where: { key: roleKey } });
  if (role) await tx.userRole.deleteMany({ where: { userId, roleId: role.id } });
}

export async function getStudentFull(studentId: string) {
  return db.student.findUnique({
    where: { id: studentId },
    include: {
      user: { select: { email: true, status: true, emailVerifiedAt: true, lastLoginAt: true } },
      enrollments: { include: { class: { include: { level: true, sector: true } }, session: true }, orderBy: { session: { startDate: "desc" } } },
      parents: { include: { parent: { include: { user: { select: { email: true } } } } } },
      invitations: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });
}
