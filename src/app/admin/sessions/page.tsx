import { requireAdminPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { PageHeader, Card, EmptyState, StatusBadge, Badge } from "@/components/ui";
import { ModalForm, ConfirmAction } from "@/components/ui/client";
import { saveSession, saveTerm, setCurrentTerm, archiveSession } from "@/app/actions/admin/academics";
import { formatDate, toDateInput, toLagosInput } from "@/lib/utils";

export const metadata = { title: "Academic sessions" };

function TermFields({ t, sessionId, nextOrder }: { t?: { id: string; name: string; order: number; startDate: Date; endDate: Date; examStartDate: Date | null; examEndDate: Date | null; resultPublicationDate: Date | null; nextResumptionDate: Date | null }; sessionId: string; nextOrder: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {t && <input type="hidden" name="termId" value={t.id} />}
      <input type="hidden" name="sessionId" value={sessionId} />
      <div><label className="label">Name</label><input name="name" className="input" defaultValue={t?.name ?? ["First Term", "Second Term", "Third Term"][nextOrder - 1] ?? ""} required /></div>
      <div><label className="label">Order</label><input name="order" type="number" min={1} className="input" defaultValue={t?.order ?? nextOrder} required /></div>
      <div><label className="label">Start date</label><input name="startDate" type="date" className="input" defaultValue={toDateInput(t?.startDate)} required /></div>
      <div><label className="label">End date</label><input name="endDate" type="date" className="input" defaultValue={toDateInput(t?.endDate)} required /></div>
      <div><label className="label">Exams start</label><input name="examStartDate" type="date" className="input" defaultValue={toDateInput(t?.examStartDate)} /></div>
      <div><label className="label">Exams end</label><input name="examEndDate" type="date" className="input" defaultValue={toDateInput(t?.examEndDate)} /></div>
      <div><label className="label">Result publication date</label><input name="resultPublicationDate" type="date" className="input" defaultValue={toDateInput(t?.resultPublicationDate)} /></div>
      <div><label className="label">Next term resumes</label><input name="nextResumptionDate" type="date" className="input" defaultValue={toDateInput(t?.nextResumptionDate)} /></div>
    </div>
  );
}

export default async function SessionsPage() {
  await requireAdminPage("academics.configure");
  const sessions = await db.academicSession.findMany({ orderBy: { startDate: "desc" }, include: { terms: { orderBy: { order: "asc" } }, _count: { select: { enrollments: true } } } });
  return (
    <div className="space-y-5">
      <PageHeader title="Academic sessions & terms" description="Only one session and term can be current school-wide. Every portal reads the current term from here."
        actions={<ModalForm trigger="New session" title="Create academic session" action={saveSession}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><label className="label">Name</label><input name="name" className="input" placeholder="2026/2027" required /></div>
            <div><label className="label">Start date</label><input name="startDate" type="date" className="input" required /></div>
            <div><label className="label">End date</label><input name="endDate" type="date" className="input" required /></div>
            <div><label className="label">Registration opens</label><input name="registrationOpensAt" type="datetime-local" className="input" /></div>
            <div><label className="label">Registration closes</label><input name="registrationClosesAt" type="datetime-local" className="input" /></div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="createTerms" defaultChecked className="h-4 w-4 accent-royal" /> Create First, Second and Third Term (adjust dates afterwards)</label>
          </div>
        </ModalForm>}
      />
      {sessions.length ? sessions.map((s) => (
        <Card key={s.id} title={<span className="flex items-center gap-2">{s.name} {s.isCurrent && <Badge tone="gold">Current</Badge>} <StatusBadge status={s.status} /></span>} description={`${formatDate(s.startDate)} – ${formatDate(s.endDate)} · ${s._count.enrollments} enrollment(s)`}
          actions={<>
            <ModalForm trigger="Edit" triggerClassName="btn-secondary btn-sm" title={`Edit ${s.name}`} action={saveSession}>
              <input type="hidden" name="sessionId" value={s.id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2"><label className="label">Name</label><input name="name" className="input" defaultValue={s.name} required /></div>
                <div><label className="label">Start</label><input name="startDate" type="date" className="input" defaultValue={toDateInput(s.startDate)} required /></div>
                <div><label className="label">End</label><input name="endDate" type="date" className="input" defaultValue={toDateInput(s.endDate)} required /></div>
                <div><label className="label">Registration opens</label><input name="registrationOpensAt" type="datetime-local" className="input" defaultValue={toLagosInput(s.registrationOpensAt)} /></div>
                <div><label className="label">Registration closes</label><input name="registrationClosesAt" type="datetime-local" className="input" defaultValue={toLagosInput(s.registrationClosesAt)} /></div>
              </div>
            </ModalForm>
            <ModalForm trigger="Add term" triggerClassName="btn-secondary btn-sm" title={`Add term to ${s.name}`} action={saveTerm} wide><TermFields sessionId={s.id} nextOrder={s.terms.length + 1} /></ModalForm>
            {!s.isCurrent && s.status !== "ARCHIVED" && <ConfirmAction action={archiveSession} fields={{ sessionId: s.id }} label="Archive" title="Archive session" message="Archived sessions remain viewable in history but are hidden from registration." />}
          </>}
        >
          {s.terms.length ? (
            <div className="grid gap-3 md:grid-cols-3">
              {s.terms.map((t) => (
                <div key={t.id} className={`rounded-2xl border p-4 ${t.isCurrent ? "border-gold bg-gold/10" : "border-lavender bg-white/60"}`}>
                  <div className="flex items-center justify-between"><p className="font-semibold text-navy">{t.name}</p>{t.isCurrent && <Badge tone="gold">Current</Badge>}</div>
                  <p className="mt-1 text-xs text-muted">{formatDate(t.startDate)} – {formatDate(t.endDate)}</p>
                  {t.examStartDate && <p className="text-xs text-muted">Exams: {formatDate(t.examStartDate)} – {formatDate(t.examEndDate)}</p>}
                  {t.nextResumptionDate && <p className="text-xs text-muted">Next term resumes: {formatDate(t.nextResumptionDate)}</p>}
                  <div className="mt-3 flex gap-2">
                    <ModalForm trigger="Edit" triggerClassName="btn-secondary btn-sm" title={`Edit ${t.name}`} action={saveTerm} wide><TermFields t={t} sessionId={s.id} nextOrder={t.order} /></ModalForm>
                    {!t.isCurrent && <ConfirmAction action={setCurrentTerm} fields={{ termId: t.id }} label="Set current" title="Change current term" message={`Make ${s.name} ${t.name} the current term for the whole school? Attendance, fees, results and dashboards will switch to it.`} />}
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyState title="No terms" description="Add the terms for this session." />}
        </Card>
      )) : <Card><EmptyState title="No academic sessions yet" description="Create the first session (e.g. 2026/2027) to begin." /></Card>}
    </div>
  );
}
