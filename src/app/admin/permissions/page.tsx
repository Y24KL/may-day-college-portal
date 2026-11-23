import { requireAdminPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { PageHeader, Card, StatusBadge, Badge } from "@/components/ui";
import { ModalForm, ConfirmAction } from "@/components/ui/client";
import { saveRole, createAdministrator, setAdminRoles } from "@/app/actions/admin/system";
import { setUserStatus } from "@/app/actions/admin/people";
import { PERMISSIONS } from "@/lib/permissions";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "User permissions" };

export default async function PermissionsPage() {
  const me = await requireAdminPage("users.permissions");
  const [roles, admins] = await Promise.all([
    db.role.findMany({ where: { kind: "ADMIN" }, include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } }, orderBy: { createdAt: "asc" } }),
    db.user.findMany({ where: { roles: { some: { role: { kind: "ADMIN" } } } }, include: { adminProfile: true, roles: { include: { role: true } } }, orderBy: { createdAt: "asc" } }),
  ]);
  const groups = [...new Set(Object.values(PERMISSIONS).map((p) => p.group))];
  const permBoxes = (selected: string[]) => (
    <div className="max-h-[50vh] space-y-3 overflow-y-auto">
      {groups.map((g) => (
        <div key={g}><p className="label">{g}</p><div className="grid gap-1 sm:grid-cols-2">{Object.entries(PERMISSIONS).filter(([, p]) => p.group === g).map(([k, p]) => (
          <label key={k} className="flex items-start gap-2 rounded-lg bg-white/60 p-2 text-xs"><input type="checkbox" name="permissions" value={k} defaultChecked={selected.includes(k)} className="mt-0.5 h-4 w-4 accent-royal" /><span><b className="text-navy">{k}</b><br />{p.description}</span></label>
        ))}</div></div>
      ))}
    </div>
  );
  return (
    <div className="space-y-5">
      <PageHeader title="User permissions" description="Granular, role-based administrator access. Permissions are enforced on the server for every action — hiding menus is not relied upon." />
      <Card title="Administrators" actions={
        <ModalForm trigger="Add administrator" triggerClassName="btn-primary btn-sm" title="Create administrator" action={createAdministrator} wide>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label">Full name</label><input name="fullName" className="input" required /></div>
            <div><label className="label">Email</label><input name="email" type="email" className="input" required /></div>
            <div><label className="label">Title</label><input name="title" className="input" placeholder="Bursar" /></div>
            <div><label className="label">Temporary password (12+ chars)</label><input name="tempPassword" className="input" required autoComplete="off" /></div>
          </div>
          <p className="label mt-2">Roles</p>
          <div className="grid gap-2 sm:grid-cols-2">{roles.map((r) => <label key={r.id} className="flex items-center gap-2 rounded-lg bg-white/60 p-2 text-sm"><input type="checkbox" name="roleIds" value={r.id} className="h-4 w-4 accent-royal" /> {r.name}</label>)}</div>
        </ModalForm>
      }>
        <div className="table-wrap"><table className="table"><thead><tr><th>Administrator</th><th>Roles</th><th>Status</th><th>Created</th><th /></tr></thead>
          <tbody>{admins.map((a) => (
            <tr key={a.id}>
              <td><p className="font-semibold text-navy">{a.adminProfile?.fullName ?? a.email}</p><p className="text-xs text-muted">{a.email}</p></td>
              <td className="space-x-1">{a.roles.filter((r) => r.role.kind === "ADMIN").map((r) => <Badge key={r.roleId} tone={r.role.key === "super_admin" ? "gold" : "blue"}>{r.role.name}</Badge>)}</td>
              <td><StatusBadge status={a.status} /></td><td className="text-xs">{formatDateTime(a.createdAt)}</td>
              <td className="whitespace-nowrap text-right">{a.id !== me.id && <>
                <ModalForm trigger="Roles" triggerClassName="btn-ghost btn-sm" title={`Roles — ${a.email}`} action={setAdminRoles}>
                  <input type="hidden" name="userId" value={a.id} />
                  <div className="grid gap-2">{roles.map((r) => <label key={r.id} className="flex items-center gap-2 rounded-lg bg-white/60 p-2 text-sm"><input type="checkbox" name="roleIds" value={r.id} defaultChecked={a.roles.some((x) => x.roleId === r.id)} className="h-4 w-4 accent-royal" /> {r.name}</label>)}</div>
                  <p className="help">Removing all roles revokes administrator access and signs the user out.</p>
                </ModalForm>
                <ConfirmAction action={setUserStatus} fields={{ userId: a.id, status: a.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE", scope: "admins" }} label={a.status === "ACTIVE" ? "Suspend" : "Activate"} danger={a.status === "ACTIVE"} title="Change administrator status" message="This is a high-privilege change and will be audited." requireText={a.status === "ACTIVE" ? "SUSPEND" : undefined} />
              </>}</td>
            </tr>
          ))}</tbody></table></div>
      </Card>
      <Card title="Roles" actions={<ModalForm trigger="New role" triggerClassName="btn-secondary btn-sm" title="Create administrator role" action={saveRole} wide><label className="label">Name</label><input name="name" className="input" required /><label className="label">Description</label><input name="description" className="input" />{permBoxes([])}</ModalForm>}>
        <div className="grid gap-3 md:grid-cols-2">
          {roles.map((r) => (
            <div key={r.id} className="rounded-2xl border border-lavender bg-white/60 p-4">
              <div className="flex items-start justify-between gap-2">
                <div><p className="font-semibold text-navy">{r.name} {r.isSystem && <Badge tone="gold">System</Badge>}</p><p className="text-xs text-muted">{r.description} · {r._count.users} user(s)</p></div>
                {r.key !== "super_admin" && <ModalForm trigger="Edit" triggerClassName="btn-ghost btn-sm" title={`Edit ${r.name}`} action={saveRole} wide><input type="hidden" name="roleId" value={r.id} /><label className="label">Name</label><input name="name" className="input" defaultValue={r.name} required /><label className="label">Description</label><input name="description" className="input" defaultValue={r.description ?? ""} />{permBoxes(r.permissions.map((p) => p.permission.key))}</ModalForm>}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">{r.permissions.map((p) => <span key={p.permissionId} className="badge bg-lavender text-[10px] text-navy">{p.permission.key}</span>)}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
