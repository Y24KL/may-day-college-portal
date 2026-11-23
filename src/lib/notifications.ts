import type { EmailPriority } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { enqueueEmail } from "@/lib/email/outbox";
import type { EmailContent } from "@/lib/email/templates";
import { env } from "@/lib/env";

export type NotifyInput = {
  userIds: string[];
  category: string;
  title: string;
  body: string;
  link?: string;
  /** If provided, an email is queued for each recipient with a VERIFIED email. */
  email?: { template: string; priority?: EmailPriority; content?: Partial<EmailContent>; subject?: string };
};

/** Central notification service: in-app + (optional) email outbox. */
export async function notify(input: NotifyInput, tx: Tx = db) {
  const ids = [...new Set(input.userIds)].filter(Boolean);
  if (!ids.length) return;
  await tx.notification.createMany({
    data: ids.map((userId) => ({ userId, category: input.category, title: input.title, body: input.body, link: input.link })),
  });
  if (!input.email) return;
  const users = await tx.user.findMany({
    where: { id: { in: ids }, status: "ACTIVE", emailVerifiedAt: { not: null } },
    select: { id: true, email: true },
  });
  const settings = await tx.schoolSettings.findUnique({ where: { id: "school" }, select: { schoolName: true } });
  for (const u of users) {
    await enqueueEmail(
      {
        to: u.email,
        userId: u.id,
        subject: input.email.subject ?? input.title,
        template: input.email.template,
        priority: input.email.priority,
        schoolName: settings?.schoolName,
        content: {
          heading: input.title,
          paragraphs: [input.body],
          cta: input.link ? { label: "Open the portal", url: `${env.appBaseUrl}${input.link}` } : undefined,
          ...input.email.content,
        },
      },
      tx,
    );
  }
}

/** Users holding an admin permission (for routing admin notifications). */
export async function adminsWithPermission(permission: string, tx: Tx = db): Promise<string[]> {
  const rows = await tx.user.findMany({
    where: { status: "ACTIVE", roles: { some: { role: { kind: "ADMIN", permissions: { some: { permission: { key: permission } } } } } } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** User ids of VERIFIED parents/guardians of a student. */
export async function verifiedParentUserIds(studentId: string, tx: Tx = db): Promise<string[]> {
  const rows = await tx.parentStudentRelationship.findMany({
    where: { studentId, status: "VERIFIED" },
    select: { parent: { select: { userId: true } } },
  });
  return rows.map((r) => r.parent.userId);
}

export async function studentUserId(studentId: string, tx: Tx = db): Promise<string | null> {
  const s = await tx.student.findUnique({ where: { id: studentId }, select: { userId: true } });
  return s?.userId ?? null;
}
