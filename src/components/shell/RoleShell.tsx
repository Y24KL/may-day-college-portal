import type { ReactNode } from "react";
import type { CurrentUser } from "@/lib/auth/current-user";
import { PortalShell } from "./PortalShell";
import { ADMIN_NAV, PARENT_NAV, STUDENT_NAV, TEACHER_NAV, filterNav } from "./nav";
import { shellData } from "@/lib/shell";
import { logout } from "@/app/actions/auth";
import { Maintenance } from "./Maintenance";
import { db } from "@/lib/db";

export type PortalKind = "student" | "teacher" | "parent" | "admin";

export function primaryPortal(u: CurrentUser): PortalKind | null {
  if (u.isAdmin) return "admin";
  if (u.studentId) return "student";
  if (u.teacherId) return "teacher";
  if (u.parentId) return "parent";
  return null;
}

export async function RoleShell({ u, kind, children }: { u: CurrentUser; kind: PortalKind; children: ReactNode }) {
  const { settings, unread, logoUrl } = await shellData(u.id);
  if (settings.maintenanceMode && kind !== "admin" && !u.isAdmin) return <Maintenance message={settings.maintenanceMessage} schoolName={settings.schoolName} />;
  let meta: string | undefined;
  if (kind === "student" && u.studentId) {
    const s = await db.student.findUnique({ where: { id: u.studentId }, select: { studentNumber: true } });
    meta = s?.studentNumber;
  } else if (kind === "teacher" && u.teacherId) {
    const t = await db.teacher.findUnique({ where: { id: u.teacherId }, select: { staffNumber: true } });
    meta = t?.staffNumber;
  } else if (kind === "parent") meta = "Parent / Guardian";
  const nav = kind === "admin" ? filterNav(ADMIN_NAV, u.permissions) : kind === "student" ? STUDENT_NAV : kind === "teacher" ? TEACHER_NAV : PARENT_NAV;
  const label = { admin: "Administrator", student: "Student Portal", teacher: "Teacher Portal", parent: "Parent Portal" }[kind];
  return (
    <PortalShell nav={nav} portalLabel={label} userName={u.displayName} userMeta={meta} unread={unread} logoUrl={logoUrl} schoolName={settings.schoolName} searchAction={kind === "admin" ? "/admin/search" : undefined} logoutAction={logout}>
      {children}
    </PortalShell>
  );
}
