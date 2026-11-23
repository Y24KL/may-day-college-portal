import Link from "next/link";
import { requireTeacherPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { getCurrentSessionTerm, termLabel } from "@/lib/academic";
import { teacherOfferings, classTeacherClasses, teacherStudentIds } from "@/lib/teacher";
import { teacherWeek, lagosNow } from "@/components/views/teacher";
import { visibleAnnouncementsWhere } from "@/lib/announcements";
import { toMinutes } from "@/lib/timetable";
import { PageHeader, Stat, Card, EmptyState, Alert, StatusBadge } from "@/components/ui";
import { Stagger, StaggerItem } from "@/components/ui/client";
import { Countdown } from "@/components/ui/Countdown";
import { formatDate, formatDateTime, todayLagos } from "@/lib/utils";
import { BookOpen, Layers, Users, Clock } from "lucide-react";

export const metadata = { title: "Teacher overview" };

export default async function TeacherHome() {
  const u = await requireTeacherPage();
  const { term } = await getCurrentSessionTerm();
  const [offerings, ctClasses, studentIds, week, notices, activity] = await Promise.all([
    teacherOfferings(u.teacherId), classTeacherClasses(u.teacherId), teacherStudentIds(u.teacherId), teacherWeek(u.teacherId),
    db.announcement.findMany({ where: await visibleAnnouncementsWhere(u), orderBy: [{ isPinned: "desc" }, { publishAt: "desc" }], take: 4 }),
    db.auditLog.findMany({ where: { actorId: u.id }, orderBy: { createdAt: "desc" }, take: 6 }),
  ]);
  const sheets = term ? await db.scoreSubmission.findMany({ where: { termId: term.id, offeringId: { in: offerings.map((o) => o.id) } } }) : [];
  const pendingScores = offerings.filter((o) => o._count.registrationItems > 0 && !["SUBMITTED", "APPROVED", "PUBLISHED"].includes(sheets.find((s) => s.offeringId === o.id)?.status ?? "NONE"));
  const today = todayLagos();
  const takenToday = await db.attendanceSession.findMany({ where: { takenById: u.teacherId, date: today } });
  const pendingDaily = ctClasses.filter((c) => !takenToday.some((t) => t.type === "DAILY" && t.classId === c.classId));
  const now = lagosNow();
  const todays = week.slots.filter((s) => s.dayOfWeek === now.dow).sort((a, b) => a.period.order - b.period.order);
  const next = todays.find((s) => toMinutes(s.period.startTime) > now.minutes);
  const classCount = new Set([...offerings.map((o) => o.classId), ...ctClasses.map((c) => c.classId)]).size;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={term ? termLabel(term) : undefined} title={`Welcome, ${u.displayName.split(" ")[0]}`} description="Your dashboard shows only subjects and classes assigned to you by the school." />
      {!offerings.length && !ctClasses.length && <Alert tone="amber" title="No assignments yet">The academic office has not assigned subjects or classes to you yet. Student records become available after assignment.</Alert>}
      <Stagger className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StaggerItem><Stat label="Assigned subjects" value={offerings.length} icon={<BookOpen className="h-5 w-5" />} href="/teacher/subjects" /></StaggerItem>
        <StaggerItem><Stat label="Classes" value={classCount} icon={<Layers className="h-5 w-5" />} tone="navy" href="/teacher/classes" /></StaggerItem>
        <StaggerItem><Stat label="Students" value={studentIds.size} icon={<Users className="h-5 w-5" />} tone="gold" href="/teacher/students" /></StaggerItem>
        <StaggerItem><Stat label="Next lesson" value={next ? <Countdown time={next.period.startTime} /> : "—"} hint={next ? `${next.offering?.subject.name} · ${next.timetable.class.name}` : "No more lessons today"} icon={<Clock className="h-5 w-5" />} tone="green" href="/teacher/timetable" /></StaggerItem>
      </Stagger>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Today's timetable" description={formatDate(new Date(), { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Lagos" })}>
          {todays.length ? <ul className="space-y-2">{todays.map((s) => <li key={s.id} className={`rounded-xl p-3 text-sm ${s === next ? "bg-royal/10 ring-1 ring-royal/30" : "bg-white/60"}`}><p className="font-semibold text-navy">{s.offering?.subject.name ?? s.note} · {s.timetable.class.name}</p><p className="text-xs text-muted">{s.period.startTime}–{s.period.endTime}{s.classroom && ` · ${s.classroom.name}`}</p></li>)}</ul> : <EmptyState title="No lessons today" />}
        </Card>
        <Card title="Pending tasks">
          <ul className="space-y-2 text-sm">
            {pendingDaily.map((c) => <li key={c.id}><Link href={`/teacher/attendance?type=DAILY&classId=${c.classId}`} className="flex justify-between rounded-xl bg-amber-50 p-3 text-amber-900 hover:bg-amber-100"><span>Daily register — {c.class.name}</span><span>Take now →</span></Link></li>)}
            {pendingScores.map((o) => <li key={o.id}><Link href={`/teacher/scores?offering=${o.id}`} className="flex justify-between rounded-xl bg-white/60 p-3 hover:bg-white"><span>Scores — {o.subject.name} · {o.class.name}</span><StatusBadge status={sheets.find((s) => s.offeringId === o.id)?.status ?? "DRAFT"} /></Link></li>)}
            {!pendingDaily.length && !pendingScores.length && <li><EmptyState title="Nothing pending" /></li>}
          </ul>
        </Card>
        <Card title="Announcements" actions={<Link className="btn-ghost btn-sm" href="/notices">All</Link>}>
          {notices.length ? <ul className="space-y-2">{notices.map((n) => <li key={n.id}><Link href={`/notices/${n.id}`} className="block rounded-xl bg-white/60 p-3 hover:bg-white"><p className="text-sm font-semibold text-navy">{n.title}</p><p className="text-xs text-muted">{formatDate(n.publishAt)}</p></Link></li>)}</ul> : <EmptyState title="No announcements" />}
        </Card>
      </div>
      <Card title="Recent activity">
        {activity.length ? <ul className="divide-y divide-lavender text-sm">{activity.map((a) => <li key={a.id} className="flex justify-between py-2"><span className="font-mono text-xs">{a.action}</span><span className="text-xs text-muted">{formatDateTime(a.createdAt)}</span></li>)}</ul> : <EmptyState title="No activity yet" />}
      </Card>
    </div>
  );
}
