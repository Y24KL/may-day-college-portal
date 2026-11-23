"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { run, type ActionState } from "@/lib/action";
import { authorizeAdmin } from "@/lib/auth/guards";
import { audit } from "@/lib/audit";
import { saveUpload } from "@/lib/storage/files";
import { hashPassword, passwordProblems } from "@/lib/auth/password";
import { revokeAllSessions } from "@/lib/auth/session";
import { processEmailOutbox } from "@/lib/email/worker";
import { PERMISSIONS, type PermissionKey } from "@/lib/permissions";
import { enqueueEmail } from "@/lib/email/outbox";
import { env } from "@/lib/env";
import { kickEmailWorker } from "@/lib/email/worker";

const id = z.string().min(1);
const on = (fd: FormData, k: string) => fd.get(k) === "on";

export async function saveSchoolInfo(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("settings.manage");
    const d = z
      .object({ schoolName: z.string().trim().min(2).max(120), motto: z.string().trim().max(160).optional(), address: z.string().trim().max(300).optional(), phone: z.string().trim().max(60).optional(), email: z.string().trim().email().or(z.literal("")).optional(), website: z.string().trim().max(120).optional(), principalName: z.string().trim().max(120).optional() })
      .parse(Object.fromEntries(fd));
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(d)) data[k] = v === "" ? null : v;
    data.schoolName = d.schoolName;
    const logo = fd.get("logo");
    if (logo instanceof File && logo.size > 0) data.logoFileId = (await saveUpload({ file: logo, purpose: "SCHOOL_LOGO", uploadedById: admin.id })).id;
    await db.schoolSettings.update({ where: { id: "school" }, data });
    await audit({ actorId: admin.id, action: "settings.school_info", entityType: "SchoolSettings" });
    return { ok: true, message: "School information saved." };
  });
}

export async function savePolicies(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("settings.manage");
    const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);
    const d = z
      .object({
        passwordMinLength: int(8, 64), sessionLifetimeHours: int(1, 24 * 30), maxFailedLogins: int(3, 20), lockoutMinutes: int(1, 1440), maxGuardiansPerStudent: int(1, 4),
        studentIdPrefix: z.string().trim().min(2).max(10), staffIdPrefix: z.string().trim().min(2).max(12),
        attendanceEditWindowHours: int(0, 720), attendanceWarningThreshold: int(0, 100), consecutiveAbsenceAlert: int(0, 30), academicDeclineThreshold: int(1, 100),
        feeReminderDaysBefore: int(0, 60), alertCooldownHours: int(1, 24 * 30), emailDailyLimit: int(1, 100000), emailMonthlyLimit: int(1, 10000000),
        schoolDays: z.string().regex(/^[1-7](,[1-7])*$/, "School days must be like 1,2,3,4,5 (1 = Monday)."), storageWarningGb: z.coerce.number().min(0.1).max(10000), maintenanceMessage: z.string().max(300).optional(),
      })
      .parse(Object.fromEntries(fd));
    const { storageWarningGb, ...rest } = d;
    await db.schoolSettings.update({
      where: { id: "school" },
      data: {
        ...rest, maintenanceMessage: d.maintenanceMessage || null, storageWarningBytes: BigInt(Math.round(storageWarningGb * 1024 ** 3)),
        studentRegistrationOpen: on(fd, "studentRegistrationOpen"), teacherRegistrationOpen: on(fd, "teacherRegistrationOpen"), parentRegistrationOpen: on(fd, "parentRegistrationOpen"),
        enableDailyAttendance: on(fd, "enableDailyAttendance"), enableLessonAttendance: on(fd, "enableLessonAttendance"), allowExcusedAttendance: on(fd, "allowExcusedAttendance"),
        showClassPosition: on(fd, "showClassPosition"), maintenanceMode: on(fd, "maintenanceMode"),
      },
    });
    await audit({ actorId: admin.id, action: "settings.policies", entityType: "SchoolSettings", sensitive: true, details: { ...rest, maintenanceMode: on(fd, "maintenanceMode") } });
    return { ok: true, message: "Settings saved." };
  });
}

/* ── Roles & administrators ─────────────────────────────────────────── */

export async function saveRole(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("users.permissions");
    const d = z.object({ roleId: z.string().optional(), name: z.string().trim().min(3).max(60), description: z.string().trim().max(200).optional() }).parse(Object.fromEntries(fd));
    const perms = fd.getAll("permissions").map(String).filter((p): p is PermissionKey => p in PERMISSIONS);
    const role = d.roleId ? await db.role.findUniqueOrThrow({ where: { id: d.roleId } }) : null;
    if (role && role.kind !== "ADMIN") throw new Error("Only administrator roles are editable here.");
    if (role?.key === "super_admin") throw new Error("The Super Administrator role always holds every permission.");
    const all = await db.permission.findMany({ where: { key: { in: perms } } });
    const saved = await db.$transaction(async (tx) => {
      const r = role
        ? await tx.role.update({ where: { id: role.id }, data: { name: d.name, description: d.description || null } })
        : await tx.role.create({ data: { key: `custom_${Date.now().toString(36)}`, name: d.name, description: d.description || null, kind: "ADMIN" } });
      await tx.rolePermission.deleteMany({ where: { roleId: r.id } });
      await tx.rolePermission.createMany({ data: all.map((p) => ({ roleId: r.id, permissionId: p.id })) });
      return r;
    });
    await audit({ actorId: admin.id, action: role ? "role.update" : "role.create", entityType: "Role", entityId: saved.id, sensitive: true, details: { permissions: perms } });
    return { ok: true, message: "Role saved. Changes apply on users' next request." };
  });
}

export async function createAdministrator(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("users.permissions");
    const d = z.object({ fullName: z.string().trim().min(3), email: z.string().trim().toLowerCase().email(), title: z.string().trim().max(80).optional(), tempPassword: z.string() }).parse(Object.fromEntries(fd));
    const roleIds = fd.getAll("roleIds").map(String).filter(Boolean);
    if (!roleIds.length) throw new Error("Assign at least one administrator role.");
    const roles = await db.role.findMany({ where: { id: { in: roleIds }, kind: "ADMIN" } });
    if (roles.some((r) => r.key === "super_admin") && !admin.roleKeys.includes("super_admin")) throw new Error("Only a Super Administrator can create another Super Administrator.");
    const problems = passwordProblems(d.tempPassword, 12, d.email);
    if (problems.length) throw new Error(`Temporary password: ${problems.join(" ")}`);
    if (await db.user.findUnique({ where: { email: d.email } })) throw new Error("A user with this email already exists.");
    const u = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: d.email, passwordHash: await hashPassword(d.tempPassword), accountType: "ADMIN", emailVerifiedAt: new Date(), adminProfile: { create: { fullName: d.fullName, title: d.title || null } }, roles: { create: roles.map((r) => ({ roleId: r.id, assignedById: admin.id })) } },
      });
      await enqueueEmail({ to: d.email, userId: user.id, subject: "Your administrator account", template: "admin-created", priority: "CRITICAL", content: { heading: "An administrator account was created for you", paragraphs: [`${admin.displayName} created an administrator account for you with roles: ${roles.map((r) => r.name).join(", ")}.`, "Your temporary password will be shared with you separately. Sign in and change it immediately."], cta: { label: "Sign in", url: `${env.appBaseUrl}/login` } } }, tx);
      await audit({ actorId: admin.id, action: "admin.create", entityType: "User", entityId: user.id, sensitive: true, details: { roles: roles.map((r) => r.key) } }, tx);
      return user;
    });
    await kickEmailWorker();
    return { ok: true, message: `Administrator ${u.email} created. Share the temporary password through a secure channel.` };
  });
}

export async function setAdminRoles(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("users.permissions");
    const userId = id.parse(fd.get("userId"));
    if (userId === admin.id) throw new Error("You cannot change your own roles.");
    const roleIds = fd.getAll("roleIds").map(String).filter(Boolean);
    const target = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { roles: { include: { role: true } } } });
    const roles = await db.role.findMany({ where: { id: { in: roleIds }, kind: "ADMIN" } });
    const isSuper = admin.roleKeys.includes("super_admin");
    const touchesSuper = target.roles.some((r) => r.role.key === "super_admin") || roles.some((r) => r.key === "super_admin");
    if (touchesSuper && !isSuper) throw new Error("Only a Super Administrator can grant or remove Super Administrator access.");
    if (target.roles.some((r) => r.role.key === "super_admin") && !roles.some((r) => r.key === "super_admin")) {
      const supers = await db.userRole.count({ where: { role: { key: "super_admin" }, user: { status: "ACTIVE" } } });
      if (supers <= 1) throw new Error("At least one active Super Administrator must remain.");
    }
    await db.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId, role: { kind: "ADMIN" } } });
      await tx.userRole.createMany({ data: roles.map((r) => ({ userId, roleId: r.id, assignedById: admin.id })) });
      await audit({ actorId: admin.id, action: "admin.roles", entityType: "User", entityId: userId, sensitive: true, details: { roles: roles.map((r) => r.key) } }, tx);
    });
    if (!roles.length) await revokeAllSessions(userId);
    return { ok: true, message: roles.length ? "Roles updated." : "All administrator access removed." };
  });
}

/* ── Email ──────────────────────────────────────────────────────────── */

export async function retryEmail(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("notifications.manage");
    const deliveryId = z.string().optional().parse(fd.get("deliveryId") ?? undefined);
    const r = await db.notificationDelivery.updateMany({ where: deliveryId ? { id: deliveryId, status: "FAILED" } : { status: "FAILED" }, data: { status: "PENDING", attempts: 0, sendAfter: new Date() } });
    await audit({ actorId: admin.id, action: "email.retry", entityType: "NotificationDelivery", entityId: deliveryId ?? null, details: { count: r.count } });
    const res = await processEmailOutbox();
    return { ok: true, message: `${r.count} email(s) re-queued; ${res.sent} sent now.` };
  });
}

export async function runOutboxNow(_: ActionState): Promise<ActionState> {
  return run(async () => {
    await authorizeAdmin("notifications.manage");
    const res = await processEmailOutbox(50);
    return { ok: true, message: `Sent ${res.sent}, failed ${res.failed}, deferred ${res.deferred}.` };
  });
}
