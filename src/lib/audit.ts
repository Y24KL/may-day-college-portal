import type { Prisma } from "@prisma/client";
import { db, type Tx } from "@/lib/db";

export async function audit(
  entry: {
    actorId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    sensitive?: boolean;
    details?: Prisma.InputJsonValue;
    ip?: string;
  },
  tx: Tx = db,
) {
  await tx.auditLog.create({
    data: {
      actorId: entry.actorId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      sensitive: entry.sensitive ?? false,
      details: entry.details,
      ip: entry.ip,
    },
  });
}
