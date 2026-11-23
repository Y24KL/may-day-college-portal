import Link from "next/link";
import { requireStudentPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { getCurrentSessionTerm, currentEnrollment, attendanceSummary, publishedResultsForStudent, termLabel } from "@/lib/academic";
import { termAverages, generateInsights } from "@/lib/analytics";
import { studentBalance } from "@/lib/finance";
import { visibleAnnouncementsWhere } from "@/lib/announcements";
import { registrationContext } from "@/lib/registration";
import { PageHeader, Stat, Card, EmptyState, Alert, Badge, Progress } from "@/components/ui";
import { Stagger, StaggerItem } from "@/components/ui/client";
import { TrendChart } from "@/components/charts";
import { formatNaira, formatDate } from "@/lib/utils";
import { Award, CheckSquare, Wallet, BookOpen, Megaphone, ClipboardList } from "lucide-react";

export const metadata = { title: "Student overview" };

export default async function StudentHome() {
  const u = await requireStudentPage();
  const { term } = await getCurrentSessionTerm();
  const [enr, att, results, bal, reg, notices] = await Promise.all([
    currentEnrollment(u.studentId),
    attendanceSummary(u.studentId, term?.id),
    publishedResultsForStudent(u.studentId),
    studentBalance(u.studentId, term?.id),
    registrationContext(u.studentId),
    db.announcement.findMany({ where: await visibleAnnouncementsWhere(u), orderBy: [{ isPinned: "desc" }, { publishAt: "desc" }], take: 4 }),
  ]);
  const terms = termAverages(results);
  const latest = terms[terms.length - 1];
  const insights = generateInsights(results).slice(0, 3);
  const regCount = reg && "enrollment" in reg && reg.enrollment?.subjectRegistration?.items.length;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={term ? termLabel(term) : undefined} title={`Hello, ${u.displayName.split(" ").slice(-1)[0]}`} description={enr ? `${enr.class.name} · ${enr.class.sector.name}` : "You are not enrolled in the current session yet."} />
      {reg && "window" in reg && reg.window?.open && !reg.enrollment?.subjectRegistration && (
        <Alert tone="blue" title="Subject registration is open"><Link className="btn-primary btn-sm mt-2" href="/student/registration"><ClipboardList className="h-4 w-4" /> Register your subjects</Link></Alert>
      )}
      <Stagger className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StaggerItem><Stat label="Latest average" value={latest ? `${latest.average}%` : "—"} hint={latest?.label ?? "No published results"} icon={<Award className="h-5 w-5" />} href="/student/results" /></StaggerItem>
        <StaggerItem><Stat label="Attendance" value={att.percentage === null ? "—" : `${att.percentage}%`} hint={att.total ? `${att.present + att.late} of ${att.total} days` : "No records this term"} icon={<CheckSquare className="h-5 w-5" />} tone="green" href="/student/attendance" /></StaggerItem>
        <StaggerItem><Stat label="Outstanding fees" value={formatNaira(bal.outstanding)} hint={term?.name} icon={<Wallet className="h-5 w-5" />} tone={bal.outstanding.greaterThan(0) ? "red" : "green"} href="/student/fees" /></StaggerItem>
        <StaggerItem><Stat label="Registered subjects" value={regCount || "—"} icon={<BookOpen className="h-5 w-5" />} tone="gold" href="/student/subjects" /></StaggerItem>
      </Stagger>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Academic progress" className="lg:col-span-2" actions={<Link href="/student/performance" className="btn-ghost btn-sm">Details</Link>}>
          {terms.length > 1 ? <TrendChart data={terms.map((t) => ({ term: t.label.replace(/^\d{4}\/\d{4} /, ""), Average: t.average }))} xKey="term" lines={[{ key: "Average" }]} height={220} /> : terms.length === 1 ? <div><p className="font-display text-4xl font-bold text-navy">{latest.average}%</p><Progress value={latest.average} /><p className="mt-2 text-sm text-muted">Your trend appears after another term is published.</p></div> : <EmptyState title="No published results yet" />}
          {insights.length > 0 && <ul className="mt-4 space-y-1.5 text-sm">{insights.map((i, k) => <li key={k} className="rounded-xl bg-white/60 px-3 py-2">{i.text}</li>)}</ul>}
        </Card>
        <Card title="Notice board" actions={<Link href="/notices" className="btn-ghost btn-sm">All</Link>}>
          {notices.length ? <ul className="space-y-2">{notices.map((n) => <li key={n.id}><Link href={`/notices/${n.id}`} className="block rounded-xl bg-white/60 p-3 hover:bg-white"><p className="text-sm font-semibold text-navy">{n.isPinned && "📌 "}{n.title}</p><p className="text-xs text-muted">{n.category} · {formatDate(n.publishAt)}</p></Link></li>)}</ul> : <EmptyState icon={<Megaphone className="h-6 w-6" />} title="No announcements" />}
        </Card>
      </div>
      {bal.obligations.some((o) => o.status !== "PAID" && o.status !== "WAIVED") && (
        <Card title="Upcoming payments">
          <ul className="flex flex-wrap gap-2">{bal.obligations.filter((o) => o.status !== "PAID" && o.status !== "WAIVED").map((o) => <li key={o.id}><Badge tone={o.dueDate && o.dueDate < new Date() ? "red" : "amber"}>{o.feeStructure.category.name} · due {formatDate(o.dueDate)}</Badge></li>)}</ul>
        </Card>
      )}
    </div>
  );
}
