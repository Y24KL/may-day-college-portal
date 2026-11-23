import type { EmailPriority } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { renderEmail, type EmailContent } from "./templates";

/**
 * Queue an email in the outbox. Call inside the same transaction as the
 * business change so emails are never lost (or sent for rolled-back work).
 */
export async function enqueueEmail(
  args: { to: string; userId?: string | null; subject: string; template: string; content: EmailContent; priority?: EmailPriority; schoolName?: string },
  tx: Tx = db,
) {
  const { html, text } = renderEmail(args.content, args.schoolName);
  return tx.notificationDelivery.create({
    data: {
      toEmail: args.to.toLowerCase(),
      userId: args.userId ?? null,
      subject: args.subject,
      template: args.template,
      html,
      text,
      priority: args.priority ?? "NORMAL",
    },
  });
}
