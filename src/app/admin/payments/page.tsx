import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireAdminPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { PageHeader, Card, EmptyState, StatusBadge, FilterBar, Pagination, Alert } from "@/components/ui";
import { termOptions, classOptions, sessionOptions } from "@/lib/options";
import { termLabel } from "@/lib/academic";
import { formatNaira, formatDate, formatDateTime, pageParams } from "@/lib/utils";

export const metadata = { title: "Payment verification" };

export default async function PaymentsAdmin({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requireAdminPage();
  if (!u.permissions.has("finance.verify") && !u.permissions.has("finance.view")) return <Alert tone="red">Permission required.</Alert>;
  const sp = await searchParams;
  const status = (sp.status ?? "PENDING") as "PENDING";
  const { page, skip, take, pageSize } = pageParams(sp);
  const where: Prisma.PaymentSubmissionWhereInput = {
    ...(status !== ("ALL" as string) ? { status } : {}),
    ...(sp.termId ? { termId: sp.termId } : {}),
    ...(sp.sessionId ? { term: { sessionId: sp.sessionId } } : {}),
    ...(sp.classId ? { student: { enrollments: { some: { classId: sp.classId, status: "ACTIVE" } } } } : {}),
    ...(sp.q ? { OR: [{ reference: { contains: sp.q, mode: "insensitive" } }, { bankReference: { contains: sp.q, mode: "insensitive" } }, { student: { fullName: { contains: sp.q, mode: "insensitive" } } }, { student: { studentNumber: { contains: sp.q, mode: "insensitive" } } }] } : {}),
  };
  const [rows, total, terms, classes, sessions, counts] = await Promise.all([
    db.paymentSubmission.findMany({ where, skip, take, orderBy: { createdAt: status === "PENDING" ? "asc" : "desc" }, include: { student: true, term: { include: { session: true } } } }),
    db.paymentSubmission.count({ where }),
    termOptions(), classOptions(), sessionOptions(),
    db.paymentSubmission.groupBy({ by: ["status"], _count: true }),
  ]);
  return (
    <div>
      <PageHeader title="Payment verification" description="A receipt upload is NOT proof of payment. Confirm the funds in the school bank account before approving." />
      <div className="mb-4 flex flex-wrap gap-2">{["PENDING", "APPROVED", "REJECTED", "ALL"].map((s) => <Link key={s} href={`?status=${s}`} className={s === status ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>{s === "ALL" ? "All" : <StatusBadge status={s} />} {s !== "ALL" && (counts.find((c) => c.status === s)?._count ?? 0)}</Link>)}</div>
      <Card>
        <FilterBar>
          <input type="hidden" name="status" value={status} />
          <input name="q" defaultValue={sp.q} className="input max-w-xs" placeholder="Student, ID, payment or bank reference" aria-label="Search" />
          <select name="sessionId" defaultValue={sp.sessionId ?? ""} className="input max-w-[11rem]" aria-label="Session"><option value="">All sessions</option>{sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <select name="termId" defaultValue={sp.termId ?? ""} className="input max-w-[14rem]" aria-label="Term"><option value="">All terms</option>{terms.map((t) => <option key={t.id} value={t.id}>{termLabel(t)}</option>)}</select>
          <select name="classId" defaultValue={sp.classId ?? ""} className="input max-w-[12rem]" aria-label="Class"><option value="">All classes</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </FilterBar>
        {rows.length ? (
          <div className="table-wrap"><table className="table"><thead><tr><th>Reference</th><th>Student</th><th>Term</th><th>Amount</th><th>Paid on</th><th>Bank ref.</th><th>Status</th><th /></tr></thead>
            <tbody>{rows.map((p) => (
              <tr key={p.id}><td className="font-mono text-xs">{p.reference}<p className="text-muted">{formatDateTime(p.createdAt)}</p></td><td><p className="font-medium text-navy">{p.student.fullName}</p><p className="text-xs text-muted">{p.student.studentNumber}</p></td><td className="text-xs">{termLabel(p.term)}</td><td className="font-semibold">{formatNaira(p.amount)}</td><td>{formatDate(p.paymentDate)}</td><td className="font-mono text-xs">{p.bankReference}</td><td><StatusBadge status={p.status} /></td>
                <td className="text-right"><Link href={`/admin/payments/${p.id}`} className="btn-ghost btn-sm">{p.status === "PENDING" ? "Verify" : "Open"}</Link></td></tr>
            ))}</tbody></table></div>
        ) : <EmptyState title="No payment submissions" />}
        <Pagination page={page} pageSize={pageSize} total={total} basePath="/admin/payments" params={{ status, q: sp.q, termId: sp.termId, classId: sp.classId, sessionId: sp.sessionId }} />
      </Card>
    </div>
  );
}
