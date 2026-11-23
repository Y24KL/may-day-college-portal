import { requireTeacherPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { teacherOfferings, classTeacherClasses } from "@/lib/teacher";
import { studentsForOffering } from "@/lib/access";
import { PageHeader, Card, EmptyState, Alert, StatusBadge, Stat } from "@/components/ui";
import { ActionForm, SubmitButton, ModalForm } from "@/components/ui/client";
import { saveAttendance, requestAttendanceCorrection } from "@/app/actions/teacher";
import { todayLagos, toDateInput, formatDate, cn } from "@/lib/utils";

export const metadata = { title: "Attendance management" };

export default async function TeacherAttendance({ searchParams }: { searchParams: Promise<{ type?: string; classId?: string; offeringId?: string; date?: string; periodId?: string }> }) {
  const u = await requireTeacherPage();
  const sp = await searchParams;
  const [offerings, cts, settings, term, periods] = await Promise.all([teacherOfferings(u.teacherId), classTeacherClasses(u.teacherId), db.schoolSettings.findUniqueOrThrow({ where: { id: "school" } }), db.term.findFirst({ where: { isCurrent: true } }), db.periodDefinition.findMany({ where: { isBreak: false }, orderBy: { order: "asc" } })]);
  const type = sp.type === "LESSON" ? "LESSON" : cts.length && settings.enableDailyAttendance ? "DAILY" : "LESSON";
  const date = sp.date ?? toDateInput(todayLagos());
  const classId = sp.classId ?? cts[0]?.classId;
  const offeringId = sp.offeringId ?? offerings[0]?.id;
  const offering = offerings.find((o) => o.id === offeringId);
  let roster: { id: string; fullName: string; studentNumber: string }[] = [];
  if (type === "DAILY" && classId && cts.some((c) => c.classId === classId)) {
    roster = (await db.studentEnrollment.findMany({ where: { classId, sessionId: term?.sessionId, status: "ACTIVE" }, include: { student: true }, orderBy: { student: { fullName: "asc" } } })).map((e) => e.student);
  } else if (type === "LESSON" && offering) roster = await studentsForOffering(offering.id);
  const key = type === "DAILY" ? `DAILY:${classId}:${date}` : `LESSON:${offeringId}:${date}:${sp.periodId || "-"}`;
  const existing = await db.attendanceSession.findUnique({ where: { key }, include: { records: { include: { corrections: { where: { status: "PENDING" } } } } } });
  const locked = existing && (Date.now() - existing.submittedAt.getTime()) / 3600_000 > settings.attendanceEditWindowHours;
  const history = await db.attendanceSession.findMany({ where: { takenById: u.teacherId, termId: term?.id }, include: { class: true, offering: { include: { subject: true } }, records: { select: { status: true } } }, orderBy: { date: "desc" }, take: 20 });
  const statuses = ["PRESENT", "ABSENT", "LATE", ...(settings.allowExcusedAttendance ? ["EXCUSED"] : [])];
  const agg = history.flatMap((h) => h.records);
  const pct = agg.length ? ((agg.filter((r) => r.status === "PRESENT" || r.status === "LATE").length / agg.length) * 100).toFixed(1) : null;
  // Students with repeated absences in registers taken by this teacher.
  const absentees = await db.attendanceRecord.groupBy({ by: ["studentId"], where: { status: "ABSENT", session: { takenById: u.teacherId, termId: term?.id } }, _count: true, having: { studentId: { _count: { gte: 2 } } }, orderBy: { _count: { studentId: "desc" } }, take: 8 });
  const absentNames = absentees.length ? await db.student.findMany({ where: { id: { in: absentees.map((a) => a.studentId) } }, select: { id: true, fullName: true } }) : [];
  if (!term) return <><PageHeader title="Attendance management" /><Alert tone="amber">No current term is set.</Alert></>;
  return (
    <div className="space-y-5">
      <PageHeader title="Attendance management" description={`Daily registers and lesson attendance are kept separately. You can edit a register for ${settings.attendanceEditWindowHours} hours; afterwards request a correction.`} />
      <Card>
        <form className="flex flex-wrap items-end gap-3">
          <div><label className="label">Register</label><select name="type" defaultValue={type} className="input">{cts.length > 0 && settings.enableDailyAttendance && <option value="DAILY">Daily class register</option>}{offerings.length > 0 && settings.enableLessonAttendance && <option value="LESSON">Lesson attendance</option>}</select></div>
          {type === "DAILY" ? <div><label className="label">Class</label><select name="classId" defaultValue={classId} className="input">{cts.map((c) => <option key={c.classId} value={c.classId}>{c.class.name}</option>)}</select></div>
            : <><div><label className="label">Subject</label><select name="offeringId" defaultValue={offeringId} className="input">{offerings.map((o) => <option key={o.id} value={o.id}>{o.subject.name} · {o.class.name}</option>)}</select></div>
              <div><label className="label">Lesson period</label><select name="periodId" defaultValue={sp.periodId ?? ""} className="input"><option value="">—</option>{periods.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.startTime})</option>)}</select></div></>}
          <div><label className="label">Date</label><input type="date" name="date" defaultValue={date} max={toDateInput(todayLagos())} min={toDateInput(term.startDate)} className="input" /></div>
          <button className="btn-secondary">Load register</button>
        </form>
      </Card>
      {!roster.length ? <Card><EmptyState title="No students to mark" description={!cts.length && !offerings.length ? "You have no assigned classes or subjects." : "No students are registered for this selection."} /></Card> : (
        <Card title={`${type === "DAILY" ? cts.find((c) => c.classId === classId)?.class.name : `${offering?.subject.name} · ${offering?.class.name}`} — ${formatDate(date)}`} actions={existing && <StatusBadge status={locked ? "SUBMITTED" : "DRAFT"} />}>
          {locked && <div className="mb-3"><Alert tone="amber">This register is locked. Use “Request correction” on individual records.</Alert></div>}
          <ActionForm action={saveAttendance}>
            <input type="hidden" name="type" value={type} /><input type="hidden" name="classId" value={classId ?? offering?.classId ?? ""} /><input type="hidden" name="offeringId" value={type === "LESSON" ? offeringId ?? "" : ""} /><input type="hidden" name="periodId" value={sp.periodId ?? ""} /><input type="hidden" name="date" value={date} />
            <div className="table-wrap"><table className="table"><thead><tr><th>Student</th><th>Status</th><th>Remark</th></tr></thead>
              <tbody>{roster.map((s) => {
                const rec = existing?.records.find((r) => r.studentId === s.id);
                return (
                  <tr key={s.id}>
                    <td><p className="font-medium text-navy">{s.fullName}</p><p className="text-xs text-muted">{s.studentNumber}</p></td>
                    <td>
                      <fieldset className="flex flex-wrap gap-1" disabled={!!locked}><legend className="sr-only">Status for {s.fullName}</legend>
                        {statuses.map((st) => (
                          <label key={st} className={cn("cursor-pointer rounded-lg border px-2 py-1 text-xs font-semibold has-[:checked]:text-white", st === "PRESENT" ? "has-[:checked]:bg-emerald-600" : st === "ABSENT" ? "has-[:checked]:bg-rose-600" : st === "LATE" ? "has-[:checked]:bg-amber-500" : "has-[:checked]:bg-royal", "border-lavender bg-white/70")}>
                            <input type="radio" name={`status_${s.id}`} value={st} defaultChecked={(rec?.status ?? "PRESENT") === st} className="sr-only" /> {st.charAt(0) + st.slice(1).toLowerCase()}
                          </label>
                        ))}
                      </fieldset>
                    </td>
                    <td className="min-w-[10rem]">
                      {locked && rec ? (
                        rec.corrections.length ? <span className="text-xs text-amber-700">Correction pending</span> :
                        <ModalForm trigger="Request correction" triggerClassName="btn-ghost btn-sm" title={`Correct ${s.fullName}`} action={requestAttendanceCorrection} submitLabel="Send request">
                          <input type="hidden" name="recordId" value={rec.id} />
                          <label className="label">New status</label><select name="newStatus" className="input">{statuses.map((st) => <option key={st}>{st}</option>)}</select>
                          <label className="label">Reason</label><textarea name="reason" className="input" required />
                        </ModalForm>
                      ) : <input name={`remark_${s.id}`} defaultValue={rec?.remark ?? ""} className="input min-h-[34px] py-1 text-xs" placeholder="Optional" aria-label={`Remark for ${s.fullName}`} />}
                    </td>
                  </tr>
                );
              })}</tbody></table></div>
            {!locked && <div className="mt-4"><SubmitButton>{existing ? "Update register" : "Submit register"}</SubmitButton></div>}
          </ActionForm>
        </Card>
      )}
      <div className="grid gap-5 lg:grid-cols-3">
        <Stat label="My registers this term" value={history.length} hint={pct ? `${pct}% attendance across them` : undefined} />
        <Card title="Repeated absences" className="lg:col-span-2">{absentees.length ? <ul className="flex flex-wrap gap-2 text-sm">{absentees.map((a) => <li key={a.studentId} className="rounded-xl bg-rose-50 px-3 py-1.5 text-rose-800">{absentNames.find((n) => n.id === a.studentId)?.fullName} · {a._count} absences</li>)}</ul> : <EmptyState title="No repeated absences" />}</Card>
      </div>
      <Card title="Previous registers">
        {history.length ? <div className="table-wrap"><table className="table"><thead><tr><th>Date</th><th>Register</th><th>Present</th><th>Absent</th><th>Late</th><th>Excused</th><th /></tr></thead>
          <tbody>{history.map((h) => { const c = (s: string) => h.records.filter((r) => r.status === s).length; return <tr key={h.id}><td>{formatDate(h.date)}</td><td>{h.type === "DAILY" ? `Daily · ${h.class.name}` : `${h.offering?.subject.name} · ${h.class.name}`}</td><td>{c("PRESENT")}</td><td>{c("ABSENT")}</td><td>{c("LATE")}</td><td>{c("EXCUSED")}</td><td><a className="btn-ghost btn-sm" href={`?type=${h.type}&${h.type === "DAILY" ? `classId=${h.classId}` : `offeringId=${h.offeringId}`}&date=${toDateInput(h.date)}${h.periodId ? `&periodId=${h.periodId}` : ""}`}>Open</a></td></tr>; })}</tbody></table></div> : <EmptyState title="No registers yet" />}
      </Card>
    </div>
  );
}
