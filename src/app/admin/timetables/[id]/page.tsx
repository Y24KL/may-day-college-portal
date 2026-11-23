import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { PageHeader, Card, StatusBadge, Alert } from "@/components/ui";
import { ModalForm, ConfirmAction, ActionForm, SubmitButton } from "@/components/ui/client";
import { setTimetableSlot, publishTimetable, archiveTimetable, createTimetable } from "@/app/actions/admin/operations";
import { conflictsFor } from "@/lib/timetable-db";
import { termLabel } from "@/lib/academic";
import { cn } from "@/lib/utils";

const DAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default async function TimetableEditor({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage("timetable.manage");
  const { id } = await params;
  const tt = await db.timetable.findUnique({ where: { id }, include: { class: true, term: { include: { session: true } }, periods: { include: { offering: { include: { subject: true } }, teacher: true, classroom: true } } } });
  if (!tt) notFound();
  const [periods, offerings, rooms, settings, conflicts] = await Promise.all([
    db.periodDefinition.findMany({ orderBy: { order: "asc" } }),
    db.subjectOffering.findMany({ where: { classId: tt.classId, sessionId: tt.sessionId, isActive: true }, include: { subject: true, teacherAssignments: { where: { isActive: true }, include: { teacher: true } } }, orderBy: { subject: { name: "asc" } } }),
    db.classroom.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    db.schoolSettings.findUniqueOrThrow({ where: { id: "school" } }),
    conflictsFor(id),
  ]);
  const days = settings.schoolDays.split(",").map(Number);
  const draft = tt.status === "DRAFT";
  const cell = (d: number, p: string) => tt.periods.find((x) => x.dayOfWeek === d && x.periodId === p);
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={termLabel(tt.term)} title={`${tt.class.name} timetable`} description={<StatusBadge status={tt.status} />}
        actions={<>
          <Link className="btn-secondary" href={`/admin/timetables?termId=${tt.termId}`}>Back</Link>
          <a className="btn-secondary" href={`/api/timetables/${tt.id}/pdf`} target="_blank">PDF</a>
          {draft ? <>
            <ConfirmAction action={archiveTimetable} fields={{ timetableId: tt.id }} label="Discard draft" danger title="Discard draft" message="Delete this draft timetable?" />
            <ConfirmAction action={publishTimetable} fields={{ timetableId: tt.id }} label="Publish" className="btn-primary" title="Publish timetable" message="Students, parents and teachers of this class will be notified. Any previously published version is archived." />
          </> : tt.status === "PUBLISHED" && <ActionForm action={createTimetable}><input type="hidden" name="classId" value={tt.classId} /><input type="hidden" name="termId" value={tt.termId} /><SubmitButton className="btn-primary">Edit as new draft</SubmitButton></ActionForm>}
        </>}
      />
      {conflicts.length > 0 && <Alert tone="red" title={`${conflicts.length} conflict(s) — publication blocked`}><ul className="list-disc pl-5">{conflicts.map((c) => <li key={c.message}>{c.message}</li>)}</ul></Alert>}
      {offerings.some((o) => !o.teacherAssignments.length) && <Alert tone="amber">Some subjects have no assigned teacher: {offerings.filter((o) => !o.teacherAssignments.length).map((o) => o.subject.name).join(", ")}.</Alert>}
      <Card className="overflow-x-auto p-3 sm:p-4">
        <table className="w-full min-w-[720px] border-separate border-spacing-1 text-xs">
          <thead><tr><th className="w-28 text-left text-muted">Period</th>{days.map((d) => <th key={d} className="text-left font-semibold text-navy">{DAYS[d]}</th>)}</tr></thead>
          <tbody>{periods.map((p) => (
            <tr key={p.id}>
              <td className="rounded-lg bg-white/50 p-2 align-top"><p className="font-semibold text-navy">{p.name}</p><p className="text-muted">{p.startTime}–{p.endTime}</p></td>
              {days.map((d) => {
                if (p.isBreak) return <td key={d} className="rounded-lg bg-gold/10 p-2 text-center text-amber-800">Break</td>;
                const c = cell(d, p.id);
                const content = c ? (<div><p className="font-semibold text-navy">{c.offering?.subject.name ?? c.note}</p><p className="text-muted">{c.teacher?.fullName ?? ""}{c.classroom ? ` · ${c.classroom.name}` : ""}</p></div>) : <span className="text-muted">—</span>;
                return (
                  <td key={d} className={cn("rounded-lg p-0 align-top", c ? "bg-royal/10" : "bg-white/40")}>
                    {draft ? (
                      <ModalForm trigger={content} triggerClassName="block h-full min-h-[52px] w-full rounded-lg p-2 text-left hover:bg-white/70" title={`${DAYS[d]} · ${p.name}`} action={setTimetableSlot}>
                        <input type="hidden" name="timetableId" value={tt.id} /><input type="hidden" name="dayOfWeek" value={d} /><input type="hidden" name="periodId" value={p.id} />
                        <label className="label">Subject</label>
                        <select name="offeringId" className="input" defaultValue={c?.offeringId ?? ""}><option value="">— Free / clear —</option>{offerings.map((o) => <option key={o.id} value={o.id}>{o.subject.name}{o.teacherAssignments[0] ? ` (${o.teacherAssignments[0].teacher.fullName})` : " (no teacher)"}</option>)}</select>
                        <label className="label">Classroom</label>
                        <select name="classroomId" className="input" defaultValue={c?.classroomId ?? ""}><option value="">—</option>{rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
                        <label className="label">Note (e.g. Assembly, Sports)</label><input name="note" className="input" defaultValue={c?.note ?? ""} />
                      </ModalForm>
                    ) : <div className="p-2">{content}</div>}
                  </td>
                );
              })}
            </tr>
          ))}</tbody>
        </table>
      </Card>
    </div>
  );
}
