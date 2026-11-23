import { requireAdminPage } from "@/lib/auth/guards";
import { PortalShell } from "@/components/shell/PortalShell";
import { ADMIN_NAV, filterNav } from "@/components/shell/nav";
import { shellData } from "@/lib/shell";
import { logout } from "@/app/actions/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const u = await requireAdminPage();
  const { settings, unread, logoUrl } = await shellData(u.id);
  const roles = u.roleKeys.filter((k) => !["student", "teacher", "parent"].includes(k));
  return (
    <PortalShell nav={filterNav(ADMIN_NAV, u.permissions)} portalLabel="Administrator" userName={u.displayName} userMeta={roles.map((r) => r.replace(/_/g, " ")).join(", ")} unread={unread} logoUrl={logoUrl} schoolName={settings.schoolName} searchAction="/admin/search" logoutAction={logout}>
      {settings.maintenanceMode && <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">Maintenance mode is ON — students, teachers and parents currently see a maintenance page.</div>}
      {children}
    </PortalShell>
  );
}
