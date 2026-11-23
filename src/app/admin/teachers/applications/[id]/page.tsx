import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { PageHeader, Card, DL, StatusBadge } from "@/components/ui";
import { ActionForm, SubmitButton, ModalForm } from "@/components/ui/client";
import { approveTeacherApplication, decideTeacherApplication, addApplicationNote } from "@/app/actions/admin/people";
import { formatDateTime } from "@/lib/utils";
import { FileText } from "lucide-react";

export default async function ReviewTeacher({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireAdminPage("teachers.view");
  const { id } = await params;
  const app = await db.teacherApplication.findUnique({ where: { id }, include: { user: true, documents: { where: { deletedAt: null } }, notes: { orderBy: { createdAt: "desc" } } } });
  if (!app) notFound();
  const canManage = u.permissions.has("teachers.manage");
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`Application ${app.reference}`} title={app.fullName} actions={<Link className="btn-secondary" href="/admin/teachers/applications">Back</Link>} />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Professional information" className="lg:col-span-2" actions={<StatusBadge status={app.status} />}>
          <div className="flex flex-col gap-5 sm:flex-row">
            {app.photoFileId ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/files/${app.photoFileId}`} alt="" className="h-40 w-32 shrink-0 rounded-xl object-cover shadow-glass" />
            ) : <div className="grid h-40 w-32 place-items-center rounded-xl bg-lavender text-xs text-muted">No photo</div>}
            <DL items={[["Email", app.user.email], ["Phone", app.phone], ["Gender", app.gender], ["Address", app.address], ["Qualifications", <span key="q" className="whitespace-pre-line">{app.qualifications}</span>], ["Specialisation", app.specialization], ["Subjects of interest (informational)", app.subjectsOfInterest], ["Experience", `${app.yearsExperience ?? 0} years`], ["Previous experience", app.previousExperience], ["Other information", app.professionalInfo], ["Submitted", formatDateTime(app.submittedAt)]]} />
          </div>
          <div className="mt-5">
            <p className="label">Supporting documents</p>
            {app.documents.length ? (
              <ul className="flex flex-wrap gap-2">{app.documents.map((d) => <li key={d.id}><a className="btn-secondary btn-sm" href={`/api/files/${d.id}`} target="_blank" rel="noopener"><FileText className="h-4 w-4" /> {d.originalName}</a></li>)}</ul>
            ) : <p className="text-sm text-muted">None uploaded.</p>}
          </div>
        </Card>
        <div className="space-y-5">
          {canManage && app.status === "PENDING_APPROVAL" && (
            <Card title="Decision">
              <ActionForm action={approveTeacherApplication}>
                <input type="hidden" name="applicationId" value={app.id} />
                <SubmitButton className="btn-primary w-full">Approve teacher</SubmitButton>
                <p className="help">Approval activates the teacher dashboard and issues a staff number. Access to students only follows subject/class assignment.</p>
              </ActionForm>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <ModalForm trigger="Request info" triggerClassName="btn-secondary btn-sm" title="Request additional information" action={decideTeacherApplication} submitLabel="Send request">
                  <input type="hidden" name="applicationId" value={app.id} /><input type="hidden" name="decision" value="REQUEST_INFO" />
                  <textarea name="message" className="input min-h-[120px]" required />
                </ModalForm>
                <ModalForm trigger="Reject" triggerClassName="btn-danger btn-sm" submitClassName="btn-danger" title="Reject application" action={decideTeacherApplication} submitLabel="Reject">
                  <input type="hidden" name="applicationId" value={app.id} /><input type="hidden" name="decision" value="REJECT" />
                  <textarea name="message" className="input min-h-[120px]" required />
                </ModalForm>
              </div>
            </Card>
          )}
          <Card title="Internal notes">
            {canManage && (
              <ActionForm action={addApplicationNote} className="mb-3 space-y-2" resetOnSuccess>
                <input type="hidden" name="kind" value="teacher" /><input type="hidden" name="applicationId" value={app.id} />
                <textarea name="body" className="input min-h-[70px]" required placeholder="Add a note…" />
                <SubmitButton className="btn-secondary btn-sm">Add note</SubmitButton>
              </ActionForm>
            )}
            <ul className="space-y-2 text-sm">{app.notes.map((n) => <li key={n.id} className="rounded-xl bg-white/60 p-3"><p className="whitespace-pre-line">{n.body}</p><p className="mt-1 text-xs text-muted">{formatDateTime(n.createdAt)}</p></li>)}</ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
