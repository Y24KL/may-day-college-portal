import { db } from "@/lib/db";
import { PERMISSIONS, DEFAULT_ADMIN_ROLES, PORTAL_ROLES } from "@/lib/permissions";

/**
 * Idempotent system bootstrap: permission catalogue, default roles, settings
 * row and default report card template. Creates NO school data (sessions,
 * classes, subjects, fees) — administrators configure those in the portal.
 * Existing role permission assignments are never overwritten.
 */
export async function bootstrapSystem() {
  for (const [key, p] of Object.entries(PERMISSIONS)) {
    await db.permission.upsert({ where: { key }, create: { key, description: p.description, group: p.group }, update: { description: p.description, group: p.group } });
  }
  const perms = await db.permission.findMany();
  const idOf = new Map(perms.map((p) => [p.key, p.id]));
  for (const r of DEFAULT_ADMIN_ROLES) {
    const existing = await db.role.findUnique({ where: { key: r.key } });
    if (existing) {
      if (r.key === "super_admin") {
        // Super admin always holds every permission (incl. newly added ones).
        await db.rolePermission.createMany({ data: perms.map((p) => ({ roleId: existing.id, permissionId: p.id })), skipDuplicates: true });
      }
      continue;
    }
    await db.role.create({
      data: {
        key: r.key,
        name: r.name,
        description: r.description,
        kind: "ADMIN",
        isSystem: r.key === "super_admin",
        permissions: { create: r.permissions.map((k) => ({ permissionId: idOf.get(k)! })) },
      },
    });
  }
  for (const [kind, r] of Object.entries(PORTAL_ROLES)) {
    await db.role.upsert({ where: { key: r.key }, create: { key: r.key, name: r.name, kind: kind as "STUDENT" | "TEACHER" | "PARENT", isSystem: true }, update: {} });
  }
  await db.schoolSettings.upsert({ where: { id: "school" }, create: { id: "school" }, update: {} });
  const tpl = await db.reportCardTemplate.findFirst();
  if (!tpl) await db.reportCardTemplate.create({ data: { name: "Standard", isDefault: true } });
}
