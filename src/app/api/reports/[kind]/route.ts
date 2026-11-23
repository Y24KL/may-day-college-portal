import { getCurrentUser } from "@/lib/auth/current-user";
import { REPORTS, toCsv, toXlsx, toPdf } from "@/lib/reports";
import { audit } from "@/lib/audit";
import type { PermissionKey } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const report = REPORTS[kind];
  const u = await getCurrentUser();
  if (!report) return new Response("Unknown report", { status: 404 });
  if (!u?.isAdmin || !u.permissions.has(report.permission as PermissionKey)) return new Response("Forbidden", { status: 403 });
  const sp = new URL(req.url).searchParams;
  const format = sp.get("format") ?? "csv";
  const table = await report.build(sp);
  await audit({ actorId: u.id, action: "report.export", entityType: "Report", entityId: kind, details: { format, rows: table.rows.length } });
  const name = `${kind}-${new Date().toISOString().slice(0, 10)}`;
  const headers = { "Cache-Control": "private, no-store" };
  if (format === "xlsx") return new Response(new Uint8Array(await toXlsx(table)), { headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${name}.xlsx"` } });
  if (format === "pdf") return new Response(new Uint8Array(await toPdf(table)), { headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}.pdf"` } });
  return new Response("﻿" + toCsv(table), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"` } });
}
