import type { Prisma } from "@prisma/client";
import { requireAdminPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { PageHeader, Card, EmptyState, FilterBar, Pagination, Badge } from "@/components/ui";
import { formatDateTime, pageParams } from "@/lib/utils";

export const metadata = { title: "Audit logs" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdminPage("audit.view");
  const sp = await searchParams;
  const { page, skip, take, pageSize } = pageParams(sp, 30);
  const where: Prisma.AuditLogWhereInput = {
    ...(sp.action ? { action: { contains: sp.action } } : {}),
    ...(sp.entity ? { entityType: sp.entity } : {}),
    ...(sp.actor ? { actor: { email: { contains: sp.actor, mode: "insensitive" } } } : {}),
    ...(sp.sensitive ? { sensitive: true } : {}),
    ...(sp.from || sp.to ? { createdAt: { ...(sp.from ? { gte: new Date(sp.from) } : {}), ...(sp.to ? { lte: new Date(sp.to + "T23:59:59") } : {}) } } : {}),
  };
  const [rows, total, entities] = await Promise.all([
    db.auditLog.findMany({ where, skip, take, orderBy: { createdAt: "desc" }, include: { actor: { select: { email: true } } } }),
    db.auditLog.count({ where }),
    db.auditLog.groupBy({ by: ["entityType"], _count: true }),
  ]);
  return (
    <div>
      <PageHeader title="Audit logs" description="Append-only record of sign-ins, approvals, financial, academic and permission changes." />
      <Card>
        <FilterBar>
          <input name="action" defaultValue={sp.action} placeholder="Action (e.g. payment.)" className="input max-w-[12rem]" aria-label="Action" />
          <select name="entity" defaultValue={sp.entity ?? ""} className="input max-w-[12rem]" aria-label="Entity"><option value="">All entities</option>{entities.map((e) => <option key={e.entityType} value={e.entityType}>{e.entityType} ({e._count})</option>)}</select>
          <input name="actor" defaultValue={sp.actor} placeholder="Actor email" className="input max-w-[12rem]" aria-label="Actor" />
          <input type="date" name="from" defaultValue={sp.from} className="input max-w-[10rem]" aria-label="From" /><input type="date" name="to" defaultValue={sp.to} className="input max-w-[10rem]" aria-label="To" />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="sensitive" value="1" defaultChecked={!!sp.sensitive} className="h-4 w-4 accent-royal" /> Sensitive only</label>
        </FilterBar>
        {rows.length ? (
          <div className="table-wrap"><table className="table"><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}><td className="whitespace-nowrap text-xs">{formatDateTime(r.createdAt)}</td><td className="text-xs">{r.actor?.email ?? "system"}{r.ip && <p className="text-muted">{r.ip}</p>}</td><td><span className="font-mono text-xs text-navy">{r.action}</span> {r.sensitive && <Badge tone="red">sensitive</Badge>}</td><td className="text-xs">{r.entityType}<p className="font-mono text-muted">{r.entityId}</p></td>
                <td className="max-w-md">{r.details ? <pre className="max-h-24 overflow-auto whitespace-pre-wrap rounded-lg bg-white/60 p-2 text-[11px]">{JSON.stringify(r.details, null, 1)}</pre> : "—"}</td></tr>
            ))}</tbody></table></div>
        ) : <EmptyState title="No matching entries" />}
        <Pagination page={page} pageSize={pageSize} total={total} basePath="/admin/audit" params={sp} />
      </Card>
    </div>
  );
}
