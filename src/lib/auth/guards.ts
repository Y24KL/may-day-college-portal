import { redirect } from "next/navigation";
import { getCurrentUser, homeFor, type CurrentUser } from "./current-user";
import type { PermissionKey } from "@/lib/permissions";

export class AuthError extends Error {
  constructor(message = "You are not allowed to perform this action.") {
    super(message);
    this.name = "AuthError";
  }
}

/* ── Page guards (redirect) ─────────────────────────────────────────────── */

export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireAdminPage(permission?: PermissionKey): Promise<CurrentUser> {
  const u = await requireUser();
  if (!u.isAdmin) redirect(homeFor(u));
  if (permission && !u.permissions.has(permission)) redirect("/admin?denied=1");
  return u;
}

export async function requireStudentPage(): Promise<CurrentUser & { studentId: string }> {
  const u = await requireUser();
  if (!u.studentId) redirect(homeFor(u));
  return u as CurrentUser & { studentId: string };
}

export async function requireTeacherPage(): Promise<CurrentUser & { teacherId: string }> {
  const u = await requireUser();
  if (!u.teacherId) redirect(homeFor(u));
  return u as CurrentUser & { teacherId: string };
}

export async function requireParentPage(): Promise<CurrentUser & { parentId: string }> {
  const u = await requireUser();
  if (!u.parentId) redirect(homeFor(u));
  return u as CurrentUser & { parentId: string };
}

/* ── Action / API guards (throw) ────────────────────────────────────────── */

export async function authorizeAdmin(permission: PermissionKey): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u || !u.isAdmin || !u.permissions.has(permission)) throw new AuthError();
  return u;
}

export async function authorizeStudent(): Promise<CurrentUser & { studentId: string }> {
  const u = await getCurrentUser();
  if (!u?.studentId) throw new AuthError();
  return u as CurrentUser & { studentId: string };
}

export async function authorizeTeacher(): Promise<CurrentUser & { teacherId: string }> {
  const u = await getCurrentUser();
  if (!u?.teacherId) throw new AuthError();
  return u as CurrentUser & { teacherId: string };
}

export async function authorizeParent(): Promise<CurrentUser & { parentId: string }> {
  const u = await getCurrentUser();
  if (!u?.parentId) throw new AuthError();
  return u as CurrentUser & { parentId: string };
}

export async function authorizeSignedIn(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) throw new AuthError("Please sign in.");
  return u;
}
