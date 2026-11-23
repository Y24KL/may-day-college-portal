import { requireAdminPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { PageHeader, Card, EmptyState, Badge, FilterBar } from "@/components/ui";
import { ModalForm, ConfirmAction, ActionForm, SubmitButton } from "@/components/ui/client";
import { saveSubject, toggleSubjectArchive, saveOfferings, updateOffering, copyOfferings } from "@/app/actions/admin/academics";
import { getCurrentSessionTerm } from "@/lib/academic";
import { classOptions, sessionOptions } from "@/lib/options";

export const metadata = { title: "Subject management" };

export default async function SubjectsPage({ searchParams }: { searchParams: Promise<{ sessionId?: string; classId?: string }> }) {
  await requireAdminPage("academics.configure");
  const sp = await searchParams;
  const { session } = await getCurrentSessionTerm();
  const [sessions, classes, subjects] = await Promise.all([sessionOptions(), classOptions(), db.subject.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { offerings: true } } } })]);
  const sessionId = sp.sessionId ?? session?.id ?? sessions[0]?.id;
  const offerings = sessionId
    ? await db.subjectOffering.findMany({ where: { sessionId, ...(sp.classId ? { classId: sp.classId } : {}) }, include: { subject: true, class: true, teacherAssignments: { where: { isActive: true }, include: { teacher: true } }, _count: { select: { registrationItems: true } } }, orderBy: [{ class: { name: "asc" } }, { isCompulsory: "desc" }, { subject: { name: "asc" } }] })
    : [];
  const byClass = new Map<string, typeof offerings>();
  for (const o of offerings) byClass.set(o.class.name, [...(byClass.get(o.class.name) ?? []), o]);
  const active = subjects.filter((s) => !s.isArchived);
  return (
    <div className="space-y-5">
      <PageHeader title="Subject management" description="Define the curriculum: subjects, and which classes take them each session (compulsory or elective)." actions={
        <ModalForm trigger="New subject" title="Create subject" action={saveSubject}>
          <label className="label">Name</label><input name="name" className="input" required />
          <label className="label">Code</label><input name="code" className="input" placeholder="MTH" required />
          <label className="label">Description</label><textarea name="description" className="input" />
        </ModalForm>
      } />
      <Card title="Subjects">
        {subjects.length ? (
          <div className="flex flex-wrap gap-2">{subjects.map((s) => (
            <div key={s.id} className={`flex items-center gap-1 rounded-xl border px-2 py-1 ${s.isArchived ? "border-dashed border-muted/40 opacity-60" : "border-lavender bg-white/70"}`}>
              <ModalForm trigger={<><b>{s.code}</b> {s.name}</>} triggerClassName="px-1 text-sm text-navy" title={`Edit ${s.name}`} action={saveSubject}>
                <input type="hidden" name="subjectId" value={s.id} />
                <label className="label">Name</label><input name="name" className="input" defaultValue={s.name} required />
                <label className="label">Code</label><input name="code" className="input" defaultValue={s.code} required />
                <label className="label">Description</label><textarea name="description" className="input" defaultValue={s.description ?? ""} />
              </ModalForm>
              <ConfirmAction action={toggleSubjectArchive} fields={{ subjectId: s.id }} label={s.isArchived ? "Restore" : "Archive"} className="btn-ghost btn-sm text-xs" title={s.isArchived ? "Restore subject" : "Archive subject"} message={s.isArchived ? "Make this subject available again?" : "Archived subjects cannot be offered in new sessions. Historical results are untouched."} />
            </div>
          ))}</div>
        ) : <EmptyState title="No subjects yet" description="Create the school's subjects, then offer them to classes." />}
      </Card>

      <Card title="Subject offerings" description="A subject may be offered to many classes and sectors." actions={sessionId && active.length > 0 && classes.length > 0 && (
        <>
          <ModalForm trigger="Offer subject to classes" triggerClassName="btn-primary btn-sm" title="Offer a subject" action={saveOfferings} wide>
            <input type="hidden" name="sessionId" value={sessionId} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="label">Subject</label><select name="subjectId" className="input" required>{active.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              <div><label className="label">Type</label><select name="type" className="input"><option value="COMPULSORY">Compulsory</option><option value="ELECTIVE">Elective</option></select></div>
            </div>
            <p className="label mt-2">Classes</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{classes.map((c) => <label key={c.id} className="flex items-center gap-2 rounded-lg bg-white/60 p-2 text-sm"><input type="checkbox" name="classIds" value={c.id} className="h-4 w-4 accent-royal" /> {c.name}</label>)}</div>
          </ModalForm>
          {sessions.length > 1 && (
            <ModalForm trigger="Copy from session" triggerClassName="btn-secondary btn-sm" title="Copy offerings from another session" action={copyOfferings}>
              <input type="hidden" name="toSessionId" value={sessionId} />
              <label className="label">Copy from</label><select name="fromSessionId" className="input">{sessions.filter((s) => s.id !== sessionId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            </ModalForm>
          )}
        </>
      )}>
        <FilterBar>
          <select name="sessionId" defaultValue={sessionId} className="input max-w-[12rem]" aria-label="Session">{sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <select name="classId" defaultValue={sp.classId ?? ""} className="input max-w-[14rem]" aria-label="Class"><option value="">All classes</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </FilterBar>
        {byClass.size ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[...byClass.entries()].map(([cls, list]) => (
              <div key={cls} className="rounded-2xl border border-lavender bg-white/50 p-4">
                <p className="mb-2 font-semibold text-navy">{cls}</p>
                <ul className="space-y-1.5">{list.map((o) => (
                  <li key={o.id} className={`flex flex-wrap items-center justify-between gap-2 text-sm ${o.isActive ? "" : "opacity-50"}`}>
                    <span>{o.subject.name} <Badge tone={o.isCompulsory ? "navy" : "blue"}>{o.isCompulsory ? "Compulsory" : "Elective"}</Badge></span>
                    <span className="flex items-center gap-1 text-xs text-muted">
                      {o.teacherAssignments.map((a) => a.teacher.fullName).join(", ") || <span className="text-amber-700">No teacher</span>} · {o._count.registrationItems} reg.
                      <ActionForm action={updateOffering}><input type="hidden" name="offeringId" value={o.id} /><input type="hidden" name="op" value="TOGGLE_TYPE" /><SubmitButton className="btn-ghost btn-sm text-xs">⇄</SubmitButton></ActionForm>
                      <ActionForm action={updateOffering}><input type="hidden" name="offeringId" value={o.id} /><input type="hidden" name="op" value="TOGGLE_ACTIVE" /><SubmitButton className="btn-ghost btn-sm text-xs">{o.isActive ? "Withdraw" : "Restore"}</SubmitButton></ActionForm>
                    </span>
                  </li>
                ))}</ul>
              </div>
            ))}
          </div>
        ) : <EmptyState title="No offerings for this session" description={!sessionId ? "Create an academic session first." : "Offer subjects to classes to open subject registration."} />}
      </Card>
    </div>
  );
}
