import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { PageHeader, Card, DL, StatusBadge, EmptyState, FilterBar } from "@/components/ui";
import { ActionForm, SubmitButton, ConfirmAction } from "@/components/ui/client";
import { assignTeacherToOffering, unassignTeacher, assignClassTeacher, setUserStatus } from "@/app/actions/admin/people";
import { getCurrentSessionTerm } from "@/lib/academic";
import { sessionOptions, classOptions } from "@/lib/options";
import { formatDateTime } from "@/lib/utils";

export default async function TeacherDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sessionId?: string }> }) {
  const u = await requireAdminPage("teachers.view");
  const { id } = await params;
  const sp = await searchParams;
  const { session: current } = await getCurrentSessionTerm();
  const sessions = await sessionOptions();
  const sessionId = sp.sessionId ?? current?.id ?? sessions[0]?.id;
  const t = await db.teacher.findUnique({
    where: { id },
    include: {
      user: true,
      assignments: { where: { offering: { sessionId } }, include: { offering: { include: { subject: true, class: true } } }, orderBy: { createdAt: "desc" } },
      classTeacherAssignments: { where: { sessionId }, include: { class: true } },
    },
  });
  if (!t) notFound();
  const [offerings, classes, recentSheets, recentAttendance] = await Promise.all([
    db.subjectOffering.findMany({ where: { sessionId, isActive: true }, include: { subject: true, class: true, teacherAssignments: { where: { isActive: true }, include: { teacher: true } } }, orderBy: [{ class: { name: "asc" } }, { subject: { name: "asc" } }] }),
    classOptions(),
    db.scoreSubmission.findMany({ where: { offering: { teacherAssignments: { some: { teacherId: t.id } } } }, include: { offering: { include: { subject: true, class: true } }, term: true }, orderBy: { updatedAt: "desc" }, take: 8 }),
    db.attendanceSession.findMany({ where: { takenById: t.id }, orderBy: { date: "desc" }, take: 8, include: { class: true, offering: { include: { subject: true } } } }),
  ]);
  const canAssign = u.permissions.has("teachers.assign");
  const active = t.assignments.filter((a) => a.isActive);
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={t.staffNumber} title={t.fullName} description={t.specialization ?? undefined}
        actions={<>
          <Link className="btn-secondary" href="/admin/teachers">Back</Link>
          {u.permissions.has("teachers.manage") && (t.user.status === "ACTIVE"
            ? <ConfirmAction action={setUserStatus} fields={{ userId: t.userId, status: "SUSPENDED", scope: "teachers" }} label="Suspend" danger title="Suspend teacher" message="The teacher will be signed out and lose access immediately." confirmLabel="Suspend"><textarea name="reason" className="input" placeholder="Reason" /></ConfirmAction>
            : <ConfirmAction action={setUserStatus} fields={{ userId: t.userId, status: "ACTIVE", scope: "teachers" }} label="Reactivate" title="Reactivate teacher" message="Restore access?" />)}
        </>}
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Profile">
          <DL items={[["Email", t.user.email], ["Phone", t.phone], ["Status", <StatusBadge key="s" status={t.user.status} />], ["Qualifications", t.qualifications], ["Experience", `${t.yearsExperience ?? 0} years`], ["Last sign-in", formatDateTime(t.user.lastLoginAt)]]} />
        </Card>
        <Card title="Subject assignments" className="lg:col-span-2" description="Teachers only see students registered for these offerings.">
          <FilterBar><select name="sessionId" defaultValue={sessionId} className="input max-w-[12rem]" aria-label="Session">{sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></FilterBar>
          {active.length ? (
            <ul className="mb-4 grid gap-2 sm:grid-cols-2">
              {active.map((a) => (
                <li key={a.id} className="flex items-center justify-between rounded-xl bg-white/60 p-3 text-sm">
                  <span><b className="text-navy">{a.offering.subject.name}</b> · {a.offering.class.name}</span>
                  {canAssign && <ConfirmAction action={unassignTeacher} fields={{ assignmentId: a.id }} label="Remove" title="Remove assignment" message="The teacher will lose access to this subject's students. Entered scores and attendance are kept." danger />}
                </li>
              ))}
            </ul>
          ) : <div className="mb-4"><EmptyState title="No subject assignments" description="Until assigned, this teacher cannot see any student records." /></div>}
          {canAssign && (
            <ActionForm action={assignTeacherToOffering} className="flex flex-wrap items-end gap-2" resetOnSuccess>
              <input type="hidden" name="teacherId" value={t.id} />
              <div className="min-w-[16rem] flex-1">
                <label className="label" htmlFor="offeringId">Assign a subject offering</label>
                <select id="offeringId" name="offeringId" className="input" required>
                  <option value="">Select…</option>
                  {offerings.map((o) => <option key={o.id} value={o.id}>{o.class.name} — {o.subject.name}{o.teacherAssignments.length ? ` (currently: ${o.teacherAssignments.map((x) => x.teacher.fullName).join(", ")})` : ""}</option>)}
                </select>
              </div>
              <SubmitButton>Assign</SubmitButton>
            </ActionForm>
          )}
        </Card>
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Class teacher">
          <p className="mb-3 text-sm">{t.classTeacherAssignments.map((c) => c.class.name).join(", ") || "Not a class teacher this session."}</p>
          {canAssign && sessionId && (
            <ActionForm action={assignClassTeacher} className="space-y-2">
              <input type="hidden" name="teacherId" value={t.id} /><input type="hidden" name="sessionId" value={sessionId} />
              <select name="classId" className="input" required>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              <SubmitButton className="btn-secondary btn-sm">Make class teacher</SubmitButton>
            </ActionForm>
          )}
        </Card>
        <Card title="Score submissions">
          {recentSheets.length ? <ul className="space-y-1 text-sm">{recentSheets.map((s) => <li key={s.id} className="flex justify-between gap-2"><span>{s.offering.subject.name} · {s.offering.class.name} · {s.term.name}</span><StatusBadge status={s.status} /></li>)}</ul> : <EmptyState title="None yet" />}
        </Card>
        <Card title="Attendance activity">
          {recentAttendance.length ? <ul className="space-y-1 text-sm">{recentAttendance.map((a) => <li key={a.id}>{a.date.toISOString().slice(0, 10)} · {a.class.name} · {a.type === "DAILY" ? "Daily register" : a.offering?.subject.name}</li>)}</ul> : <EmptyState title="None yet" />}
        </Card>
      </div>
    </div>
  );
}
