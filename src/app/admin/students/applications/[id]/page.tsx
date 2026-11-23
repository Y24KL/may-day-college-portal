import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { PageHeader, Card, DL, StatusBadge, Alert } from "@/components/ui";
import { ActionForm, SubmitButton, ModalForm } from "@/components/ui/client";
import { approveStudentApplication, decideStudentApplication, addApplicationNote } from "@/app/actions/admin/people";
import { classOptions, sessionOptions } from "@/lib/options";
import { formatDate, formatDateTime } from "@/lib/utils";

export default async function ReviewStudentApplication({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireAdminPage("students.view");
  const { id } = await params;
  const app = await db.studentApplication.findUnique({ where: { id }, include: { user: true, requestedClass: true, session: true, notes: { orderBy: { createdAt: "desc" } } } });
  if (!app) notFound();
  const [classes, sessions, dup, authors] = await Promise.all([
    classOptions(),
    sessionOptions(),
    app.fullName ? db.student.findFirst({ where: { fullName: { equals: app.fullName, mode: "insensitive" }, dateOfBirth: app.dateOfBirth ?? undefined } }) : null,
    db.user.findMany({ where: { id: { in: app.notes.map((n) => n.authorId) } }, select: { id: true, email: true } }),
  ]);
  const canManage = u.permissions.has("students.manage");
  const pending = app.status === "PENDING_APPROVAL";
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`Application ${app.reference}`} title={app.fullName ?? "Incomplete application"} actions={<Link href="/admin/students/applications" className="btn-secondary">Back</Link>} />
      {dup && <Alert tone="amber" title="Possible duplicate">A student named {dup.fullName} with the same date of birth already exists ({dup.studentNumber}). <Link className="underline" href={`/admin/students/${dup.id}`}>Open</Link></Alert>}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Submitted information" className="lg:col-span-2" actions={<StatusBadge status={app.status} />}>
          <div className="flex flex-col gap-5 sm:flex-row">
            {app.photoFileId ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/files/${app.photoFileId}`} alt="Passport" className="h-40 w-32 shrink-0 rounded-xl object-cover shadow-glass" />
            ) : <div className="grid h-40 w-32 place-items-center rounded-xl bg-lavender text-xs text-muted">No photo</div>}
            <DL items={[
              ["Email", <>{app.user.email} {app.user.emailVerifiedAt ? <StatusBadge status="VERIFIED" /> : <StatusBadge status="PENDING" />}</>],
              ["Date of birth", formatDate(app.dateOfBirth)],
              ["Gender", app.gender ?? "—"],
              ["Address", app.address],
              ["Parent/guardian", app.guardianName],
              ["Guardian email", app.guardianEmail],
              ["Guardian phone", app.guardianPhone],
              ["Class requested", app.requestedClass?.name],
              ["Session", app.session?.name],
              ["Submitted", formatDateTime(app.submittedAt)],
            ]} />
          </div>
          {app.correctionRequest && <div className="mt-4"><Alert tone="blue" title="Last correction request">{app.correctionRequest}</Alert></div>}
          {app.decisionReason && <div className="mt-4"><Alert tone="red" title="Decision reason">{app.decisionReason}</Alert></div>}
        </Card>
        <div className="space-y-5">
          {canManage && pending && (
            <Card title="Decision">
              <ActionForm action={approveStudentApplication} className="space-y-3">
                <input type="hidden" name="applicationId" value={app.id} />
                <div><label className="label" htmlFor="classId">Confirm class & sector</label><select id="classId" name="classId" className="input" defaultValue={app.requestedClassId ?? ""} required>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                <div><label className="label" htmlFor="sessionId">Session</label><select id="sessionId" name="sessionId" className="input" defaultValue={app.sessionId ?? ""} required>{sessions.filter((s) => s.status !== "ARCHIVED").map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                <SubmitButton className="btn-primary w-full" pendingText="Approving…">Approve & issue student ID</SubmitButton>
                <p className="help">Approval activates the account, enrolls the student, generates fee bills and invites the parent email.</p>
              </ActionForm>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <ModalForm trigger="Request corrections" triggerClassName="btn-secondary btn-sm" title="Request corrections" action={decideStudentApplication} submitLabel="Send request">
                  <input type="hidden" name="applicationId" value={app.id} /><input type="hidden" name="decision" value="REQUEST_INFO" />
                  <textarea name="message" className="input min-h-[120px]" placeholder="Explain exactly what needs to be corrected…" required />
                </ModalForm>
                <ModalForm trigger="Reject" triggerClassName="btn-danger btn-sm" submitClassName="btn-danger" title="Reject application" action={decideStudentApplication} submitLabel="Reject application">
                  <input type="hidden" name="applicationId" value={app.id} /><input type="hidden" name="decision" value="REJECT" />
                  <textarea name="message" className="input min-h-[120px]" placeholder="Reason shown to the applicant" required />
                </ModalForm>
              </div>
            </Card>
          )}
          <Card title="Internal notes" description="Visible to administrators only.">
            {canManage && (
              <ActionForm action={addApplicationNote} className="mb-3 space-y-2" resetOnSuccess>
                <input type="hidden" name="kind" value="student" /><input type="hidden" name="applicationId" value={app.id} />
                <textarea name="body" className="input min-h-[70px]" placeholder="Add a note…" required />
                <SubmitButton className="btn-secondary btn-sm">Add note</SubmitButton>
              </ActionForm>
            )}
            <ul className="space-y-2 text-sm">
              {app.notes.map((n) => <li key={n.id} className="rounded-xl bg-white/60 p-3"><p className="whitespace-pre-line">{n.body}</p><p className="mt-1 text-xs text-muted">{authors.find((a) => a.id === n.authorId)?.email} · {formatDateTime(n.createdAt)}</p></li>)}
              {!app.notes.length && <li className="text-muted">No notes yet.</li>}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
