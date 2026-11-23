import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { PageHeader, Card, EmptyState, StatusBadge } from "@/components/ui";
import { formatNaira } from "@/lib/utils";

export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const u = await requireAdminPage();
  const q = ((await searchParams).q ?? "").trim();
  const has = (p: Parameters<typeof u.permissions.has>[0]) => u.permissions.has(p);
  const ci = { contains: q, mode: "insensitive" as const };
  const [students, teachers, parents, subjects, classes, payments, sessions] = q.length < 2 ? [[], [], [], [], [], [], []] : await Promise.all([
    has("students.view") ? db.student.findMany({ where: { OR: [{ fullName: ci }, { studentNumber: ci }, { user: { email: ci } }] }, take: 10 }) : [],
    has("teachers.view") ? db.teacher.findMany({ where: { OR: [{ fullName: ci }, { staffNumber: ci }, { user: { email: ci } }] }, take: 10 }) : [],
    has("parents.view") ? db.parent.findMany({ where: { OR: [{ fullName: ci }, { user: { email: ci } }, { phone: ci }] }, take: 10, include: { user: true } }) : [],
    has("academics.configure") ? db.subject.findMany({ where: { OR: [{ name: ci }, { code: ci }] }, take: 10 }) : [],
    has("academics.configure") ? db.class.findMany({ where: { name: ci }, take: 10 }) : [],
    has("finance.view") || has("finance.verify") ? db.paymentSubmission.findMany({ where: { OR: [{ reference: ci }, { bankReference: ci }] }, take: 10, include: { student: true } }) : [],
    has("academics.configure") ? db.academicSession.findMany({ where: { name: ci }, take: 5 }) : [],
  ]);
  const groups: [string, { href: string; label: string; meta?: React.ReactNode }[]][] = [
    ["Students", students.map((s) => ({ href: `/admin/students/${s.id}`, label: s.fullName, meta: s.studentNumber }))],
    ["Teachers", teachers.map((t) => ({ href: `/admin/teachers/${t.id}`, label: t.fullName, meta: t.staffNumber }))],
    ["Parents", parents.map((p) => ({ href: `/admin/parents?q=${encodeURIComponent(p.user.email)}`, label: p.fullName, meta: p.user.email }))],
    ["Subjects", subjects.map((s) => ({ href: `/admin/subjects`, label: s.name, meta: s.code }))],
    ["Classes", classes.map((c) => ({ href: `/admin/classes`, label: c.name }))],
    ["Payments", payments.map((p) => ({ href: `/admin/payments/${p.id}`, label: `${p.reference} · ${p.student.fullName}`, meta: <>{formatNaira(p.amount)} <StatusBadge status={p.status} /></> }))],
    ["Academic sessions", sessions.map((s) => ({ href: `/admin/sessions`, label: s.name }))],
  ];
  const any = groups.some(([, g]) => g.length);
  return (
    <div className="space-y-5">
      <PageHeader title="Search" description={q ? `Results for “${q}” (limited to sections you can access)` : "Search students, teachers, parents, subjects, classes, payment references and sessions."} />
      <form className="flex gap-2"><input name="q" defaultValue={q} className="input max-w-lg" placeholder="Type at least 2 characters" autoFocus aria-label="Search" /><button className="btn-primary">Search</button></form>
      {q.length >= 2 && (any ? (
        <div className="grid gap-4 md:grid-cols-2">{groups.filter(([, g]) => g.length).map(([title, items]) => (
          <Card key={title} title={title}><ul className="divide-y divide-lavender">{items.map((i) => <li key={i.href + i.label}><Link href={i.href} className="flex items-center justify-between gap-2 py-2 text-sm hover:text-royal"><span className="font-medium">{i.label}</span><span className="text-xs text-muted">{i.meta}</span></Link></li>)}</ul></Card>
        ))}</div>
      ) : <Card><EmptyState title="No matches" /></Card>)}
    </div>
  );
}
