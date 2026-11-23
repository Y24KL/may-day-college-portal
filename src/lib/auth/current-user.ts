import { cache } from "react";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { hashToken } from "./crypto";
import { SESSION_COOKIE } from "./session";
import type { AccountType } from "@prisma/client";
import type { PermissionKey } from "@/lib/permissions";

export type CurrentUser = {
  id: string;
  email: string;
  accountType: AccountType;
  emailVerified: boolean;
  sessionId: string;
  sessionTokenHash: string;
  roleKeys: string[];
  /** Roles of kind ADMIN held by this user */
  isAdmin: boolean;
  permissions: Set<PermissionKey>;
  displayName: string;
  studentId?: string;
  teacherId?: string;
  parentId?: string;
};

/**
 * Resolve the signed-in user from the session cookie. Every value comes from
 * the database — nothing about roles is trusted from the client.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const tokenHash = hashToken(token);
  const session = await db.session.findUnique({
    where: { tokenHash },
    include: {
      user: {
        include: {
          roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
          student: { select: { id: true, fullName: true, status: true } },
          teacher: { select: { id: true, fullName: true, isActive: true } },
          parent: { select: { id: true, fullName: true } },
          adminProfile: { select: { fullName: true } },
          studentApplication: { select: { fullName: true } },
          teacherApplication: { select: { fullName: true } },
        },
      },
    },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  const u = session.user;
  if (u.status !== "ACTIVE") return null;

  // Touch session at most every 5 minutes.
  if (Date.now() - session.lastSeenAt.getTime() > 5 * 60_000) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }

  const permissions = new Set<PermissionKey>();
  let isAdmin = false;
  for (const ur of u.roles) {
    if (ur.role.kind === "ADMIN") {
      isAdmin = true;
      for (const rp of ur.role.permissions) permissions.add(rp.permission.key as PermissionKey);
    }
  }
  const roleKeys = u.roles.map((r) => r.role.key);
  const hasRole = (k: string) => roleKeys.includes(k);

  return {
    id: u.id,
    email: u.email,
    accountType: u.accountType,
    emailVerified: Boolean(u.emailVerifiedAt),
    sessionId: session.id,
    sessionTokenHash: tokenHash,
    roleKeys,
    isAdmin,
    permissions,
    displayName:
      u.adminProfile?.fullName ||
      u.student?.fullName ||
      u.teacher?.fullName ||
      u.parent?.fullName ||
      u.studentApplication?.fullName ||
      u.teacherApplication?.fullName ||
      u.email,
    studentId: hasRole("student") && u.student?.status === "ACTIVE" ? u.student.id : undefined,
    teacherId: hasRole("teacher") && u.teacher?.isActive ? u.teacher.id : undefined,
    parentId: hasRole("parent") && u.emailVerifiedAt ? u.parent?.id : undefined,
  };
});

/** Where a user should land after signing in. */
export function homeFor(u: CurrentUser): string {
  if (!u.emailVerified) return "/verify-email";
  if (u.isAdmin) return "/admin";
  if (u.studentId) return "/student";
  if (u.teacherId) return "/teacher";
  if (u.parentId) return "/parent";
  if (u.accountType === "PARENT") return "/register/parent/profile";
  return "/application";
}
