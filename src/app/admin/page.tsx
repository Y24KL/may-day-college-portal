import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { getCurrentSessionTerm, termLabel } from "@/lib/academic";
import { PageHeader, Stat, Card, Alert, EmptyState, StatusBadge } from "@/components/ui";
import { Stagger, StaggerItem } from "@/components/ui/client";
import { DonutChart, BarsChart } from "@/components/charts";
import { formatNaira, formatDateTime } from "@/lib/utils";
import { GraduationCap, Briefcase, Users, BookOpen, UserPlus, Link2, Receipt, Wallet, CheckSquare, Award, Settings2 } from "lucide-react";
import { Prisma } from "@prisma/client";

export const metadata = { title: "Administrator overview" };

export default async function AdminOverview({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const u = await requireAdminPage();
  const sp = await searchParams;
  const { session, term } = await getCurrentSessionTerm();
  const [
    byLevel, bySector, teachers, parents, subjects, pendingStudents, pendingTeachers, pendingLinks, pendingPayments, approvedPayments, outstandingRows, attendance, sheets, recent, classes, gradingCfg,
  ] = await Promise.all([
    session ? db.studentEnrollment.findMany({ where: { sessionId: session.id, status: "ACTIVE" }, select: { class: { select: { level: { select: { name: true, order: true } }, sector: { select: { name: true } } } } } }) : [],
    Promise.resolve(null),
    db.teacher.count({ where: { isActive: true } }),
    db.parent.count(),
    db.subject.count({ where: { isArchived: false } }),
    db.studentApplication.count({ where: { status: "PENDING_APPROVAL" } }),
    db.teacherApplication.count({ where: { status: "PENDING_APPROVAL" } }),
    db.parentLinkRequest.count({ where: { status: "PENDING" } }),
    db.paymentSubmission.count({ where: { status: "PENDING" } }),
    term ? db.payment.aggregate({ where: { submission: { termId: term.id } }, _sum: { amount: true }, _count: true }) : null,
    term ? db.studentFeeObligation.findMany({ where: { termId: term.id, status: { in: ["UNPAID", "PARTIAL"] } }, select: { amount: true, amountPaid: true, amountAdjusted: true } }) : [],
    term ? db.attendanceRecord.groupBy({ by: ["status"], where: { session: { termId: term.id, type: "DAILY" } }, _count: true }) : [],
    term ? db.scoreSubmission.groupBy({ by: ["status"], where: { termId: term.id }, _count: true }) : [],
    db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { actor: { select: { email: true } } } }),
    db.class.count({ where: { isActive: true } }),
    session ? db.scoreConfiguration.findUnique({ where: { sessionId: session.id } }) : null,
  ]);
  void bySector;
  const levelCounts = new Map<string, { n: number; order: number }>();
  const sectorCounts = new Map<string, number>();
  for (const e of byLevel) {
    const l = e.class.level;
    levelCounts.set(l.name, { n: (levelCounts.get(l.name)?.n ?? 0) + 1, order: l.order });
    sectorCounts.set(e.class.sector.name, (sectorCounts.get(e.class.sector.name) ?? 0) + 1);
  }
  const outstanding = outstandingRows.reduce((s, o) => s.add(o.amount.sub(o.amountAdjusted).sub(o.amountPaid)), new Prisma.Decimal(0));
  const attTotal = attendance.reduce((s, a) => s + a._count, 0);
  const attPresent = attendance.filter((a) => a.status === "PRESENT" || a.status === "LATE").reduce((s, a) => s + a._count, 0);
  const setup = [
    { done: classes > 0, label: "Configure classes and academic sectors", href: "/admin/classes" },
    { done: Boolean(session && term), label: "Create an academic session and set the current term", href: "/admin/sessions" },
    { done: subjects > 0, label: "Create subjects and offer them to classes", href: "/admin/subjects" },
    { done: Boolean(gradingCfg), label: "Configure grading and score allocation", href: "/admin/grading" },
  ];
  const setupPending = setup.filter((s) => !s.done);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={term ? termLabel(term) : "No current term"} title={`Welcome, ${u.displayName.split(" ")[0]}`} description="School-wide overview from live records." />
      {sp.denied && <Alert tone="red">You do not have permission to open that section.</Alert>}
      {setupPending.length > 0 && (
        <Card title="Finish setting up the school" description="Other portals depend on this configuration." className="border-gold/40">
          <ul className="grid gap-2 sm:grid-cols-2">
            {setup.map((s) => (
              <li key={s.label}>
                <Link href={s.href} className="flex items-center gap-3 rounded-xl bg-white/60 p-3 text-sm hover:bg-white">
                  <Settings2 className={s.done ? "h-4 w-4 text-emerald-600" : "h-4 w-4 text-amber-600"} />
                  <span className={s.done ? "text-muted line-through" : "font-medium text-navy"}>{s.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Stagger className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StaggerItem><Stat label="Active students" value={byLevel.length} hint={session?.name ?? "No current session"} icon={<GraduationCap className="h-5 w-5" />} href="/admin/students" /></StaggerItem>
        <StaggerItem><Stat label="Teachers" value={teachers} icon={<Briefcase className="h-5 w-5" />} tone="navy" href="/admin/teachers" /></StaggerItem>
        <StaggerItem><Stat label="Parents" value={parents} icon={<Users className="h-5 w-5" />} tone="gold" href="/admin/parents" /></StaggerItem>
        <StaggerItem><Stat label="Subjects" value={subjects} icon={<BookOpen className="h-5 w-5" />} tone="green" href="/admin/subjects" /></StaggerItem>
        <StaggerItem><Stat label="Pending students" value={pendingStudents} icon={<UserPlus className="h-5 w-5" />} tone={pendingStudents ? "red" : "green"} href="/admin/students/applications" /></StaggerItem>
        <StaggerItem><Stat label="Pending teachers" value={pendingTeachers} icon={<UserPlus className="h-5 w-5" />} tone={pendingTeachers ? "red" : "green"} href="/admin/teachers/applications" /></StaggerItem>
        <StaggerItem><Stat label="Link requests" value={pendingLinks} icon={<Link2 className="h-5 w-5" />} tone={pendingLinks ? "red" : "green"} href="/admin/parents" /></StaggerItem>
        <StaggerItem><Stat label="Payments to verify" value={pendingPayments} icon={<Receipt className="h-5 w-5" />} tone={pendingPayments ? "red" : "green"} href="/admin/payments" /></StaggerItem>
      </Stagger>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Students by class level" className="lg:col-span-2">
          {byLevel.length ? (
            <BarsChart data={[...levelCounts.entries()].sort((a, b) => a[1].order - b[1].order).map(([name, v]) => ({ name, Students: v.n }))} xKey="name" bars={[{ key: "Students" }]} />
          ) : (
            <EmptyState title="No enrolled students yet" description="Approved students appear here once enrolled in the current session." />
          )}
        </Card>
        <Card title="By academic sector">
          {sectorCounts.size ? <DonutChart data={[...sectorCounts.entries()].map(([name, value]) => ({ name, value }))} /> : <EmptyState title="No data yet" />}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Fees this term" description={term ? termLabel(term) : undefined}>
          <div className="space-y-3">
            <div className="flex items-center justify-between"><span className="text-sm text-muted">Verified payments</span><span className="font-semibold">{formatNaira(approvedPayments?._sum.amount ?? 0)}</span></div>
            <div className="flex items-center justify-between"><span className="text-sm text-muted">Number of payments</span><span className="font-semibold">{approvedPayments?._count ?? 0}</span></div>
            <div className="flex items-center justify-between"><span className="text-sm text-muted">Outstanding</span><span className="font-semibold text-rose-700">{formatNaira(outstanding)}</span></div>
            <Link href="/admin/finance" className="btn-secondary btn-sm w-full"><Wallet className="h-4 w-4" /> Financial reports</Link>
          </div>
        </Card>
        <Card title="Attendance this term">
          {attTotal ? (
            <div>
              <p className="font-display text-4xl font-bold text-navy">{((attPresent / attTotal) * 100).toFixed(1)}%</p>
              <p className="text-sm text-muted">present or late across {attTotal} daily records</p>
              <div className="mt-3 flex flex-wrap gap-2">{attendance.map((a) => <span key={a.status} className="text-xs"><StatusBadge status={a.status} /> {a._count}</span>)}</div>
            </div>
          ) : <EmptyState icon={<CheckSquare className="h-6 w-6" />} title="No attendance recorded" />}
        </Card>
        <Card title="Result publication">
          {sheets.length ? (
            <ul className="space-y-2">
              {sheets.map((s) => <li key={s.status} className="flex items-center justify-between text-sm"><StatusBadge status={s.status} /><span className="font-semibold">{s._count} sheet(s)</span></li>)}
              <li><Link href="/admin/results" className="btn-secondary btn-sm mt-2 w-full"><Award className="h-4 w-4" /> Results management</Link></li>
            </ul>
          ) : <EmptyState title="No score sheets yet" description="Teachers' score sheets for the current term appear here." />}
        </Card>
      </div>

      {u.permissions.has("audit.view") && (
        <Card title="Recent activity" actions={<Link href="/admin/audit" className="btn-ghost btn-sm">View audit log</Link>}>
          {recent.length ? (
            <ul className="divide-y divide-lavender text-sm">
              {recent.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span><b className="text-navy">{r.action}</b> <span className="text-muted">· {r.entityType}</span></span>
                  <span className="text-xs text-muted">{r.actor?.email ?? "system"} · {formatDateTime(r.createdAt)}</span>
                </li>
              ))}
            </ul>
          ) : <EmptyState title="No activity yet" />}
        </Card>
      )}
    </div>
  );
}
