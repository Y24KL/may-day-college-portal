import { requireTeacherPage } from "@/lib/auth/guards";
import { teacherWeek, lagosNow } from "@/components/views/teacher";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { Countdown } from "@/components/ui/Countdown";
import { toMinutes } from "@/lib/timetable";
import { cn } from "@/lib/utils";
import { Download } from "lucide-react";

export const metadata = { title: "My timetable" };
const DAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default async function TeacherTimetable() {
  const u = await requireTeacherPage();
  const { slots, periods, days } = await teacherWeek(u.teacherId);
  const now = lagosNow();
  const todays = slots.filter((s) => s.dayOfWeek === now.dow).sort((a, b) => a.period.order - b.period.order);
  const upcoming = todays.filter((s) => toMinutes(s.period.startTime) > now.minutes);
  return (
    <div className="space-y-5">
      <PageHeader title="My timetable" actions={slots.length > 0 && <a className="btn-secondary" href="/api/me/teacher-timetable" target="_blank"><Download className="h-4 w-4" /> PDF</a>} />
      {!slots.length ? <Card><EmptyState title="No published lessons" description="Lessons appear once timetables including your subjects are published." /></Card> : (<>
        <div className="grid gap-5 lg:grid-cols-3">
          <Card title="Today">{todays.length ? <ul className="space-y-2">{todays.map((s) => <li key={s.id} className="rounded-xl bg-white/60 p-3 text-sm"><b className="text-navy">{s.period.startTime}</b> {s.offering?.subject.name} · {s.timetable.class.name}{s.classroom && ` · ${s.classroom.name}`}</li>)}</ul> : <EmptyState title="No lessons today" />}</Card>
          <Card title="Upcoming lessons" className="lg:col-span-2">
            {upcoming.length ? <ul className="space-y-2">{upcoming.map((s, i) => <li key={s.id} className={cn("flex items-center justify-between rounded-xl p-3 text-sm", i === 0 ? "bg-royal text-white" : "bg-white/60")}><span>{s.offering?.subject.name} · {s.timetable.class.name} ({s.period.startTime})</span>{i === 0 && <span className="text-xs">starts in <Countdown time={s.period.startTime} /></span>}</li>)}</ul> : <EmptyState title="No more lessons today" />}
          </Card>
        </div>
        <Card title="Weekly timetable" className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-separate border-spacing-1 text-xs">
            <thead><tr><th className="w-28 text-left text-muted">Period</th>{days.map((d) => <th key={d} className={cn("rounded-lg p-1 text-left font-semibold", d === now.dow ? "bg-royal text-white" : "text-navy")}>{DAYS[d]}</th>)}</tr></thead>
            <tbody>{periods.map((p) => (
              <tr key={p.id}><td className="rounded-lg bg-white/50 p-2"><p className="font-semibold text-navy">{p.name}</p><p className="text-muted">{p.startTime}–{p.endTime}</p></td>
                {days.map((d) => { if (p.isBreak) return <td key={d} className="rounded-lg bg-gold/10 p-2 text-center text-amber-800">Break</td>; const c = slots.filter((s) => s.dayOfWeek === d && s.periodId === p.id); return <td key={d} className={cn("rounded-lg p-2 align-top", c.length ? "bg-royal/10" : "bg-white/40")}>{c.map((s) => <div key={s.id}><p className="font-semibold text-navy">{s.offering?.subject.name}</p><p className="text-muted">{s.timetable.class.name}{s.classroom && ` · ${s.classroom.name}`}</p></div>)}</td>; })}</tr>
            ))}</tbody>
          </table>
        </Card>
      </>)}
    </div>
  );
}
