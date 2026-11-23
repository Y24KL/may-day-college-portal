import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { Card, Alert } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { submitTeacherApplication } from "@/app/actions/application";

export const metadata = { title: "Professional information" };

export default async function TeacherApplicationPage() {
  const u = await requireUser();
  if (u.accountType !== "TEACHER") redirect("/application");
  if (!u.emailVerified) redirect("/verify-email");
  const app = await db.teacherApplication.findUnique({ where: { userId: u.id }, include: { documents: { where: { deletedAt: null } } } });
  if (!app || !["DRAFT", "INFORMATION_REQUIRED"].includes(app.status)) redirect("/application");
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-royal">Step 3 of 4</p>
        <h1 className="mt-1 text-3xl font-bold">Professional information</h1>
      </div>
      {app.status === "INFORMATION_REQUIRED" && <Alert tone="amber" title="Additional information requested">{app.correctionRequest}</Alert>}
      <Card>
        <ActionForm action={submitTeacherApplication} className="grid gap-4 sm:grid-cols-2" encType="multipart/form-data">
          <div className="sm:col-span-2"><label className="label" htmlFor="fullName">Full name</label><input id="fullName" name="fullName" className="input" required defaultValue={app.fullName} /></div>
          <div><label className="label" htmlFor="phone">Phone number</label><input id="phone" name="phone" type="tel" className="input" required defaultValue={app.phone ?? ""} /></div>
          <div><label className="label">Email</label><input className="input" value={u.email} disabled readOnly /></div>
          <div>
            <label className="label" htmlFor="gender">Gender (optional)</label>
            <select id="gender" name="gender" className="input" defaultValue={app.gender ?? ""}><option value="">Prefer not to say</option><option value="MALE">Male</option><option value="FEMALE">Female</option></select>
          </div>
          <div><label className="label" htmlFor="yearsExperience">Years of teaching experience</label><input id="yearsExperience" name="yearsExperience" type="number" min={0} max={60} className="input" required defaultValue={app.yearsExperience ?? 0} /></div>
          <div className="sm:col-span-2"><label className="label" htmlFor="address">Residential address (optional)</label><input id="address" name="address" className="input" defaultValue={app.address ?? ""} /></div>
          <div className="sm:col-span-2"><label className="label" htmlFor="qualifications">Qualifications</label><textarea id="qualifications" name="qualifications" className="input min-h-[80px]" required defaultValue={app.qualifications ?? ""} placeholder="e.g. B.Sc. (Ed) Mathematics, University of Lagos, 2015; TRCN certified" /></div>
          <div><label className="label" htmlFor="specialization">Area of specialisation</label><input id="specialization" name="specialization" className="input" required defaultValue={app.specialization ?? ""} /></div>
          <div><label className="label" htmlFor="subjectsOfInterest">Subjects you can teach</label><input id="subjectsOfInterest" name="subjectsOfInterest" className="input" required defaultValue={app.subjectsOfInterest ?? ""} /><p className="help">For information only — the school assigns subjects.</p></div>
          <div className="sm:col-span-2"><label className="label" htmlFor="previousExperience">Previous teaching experience</label><textarea id="previousExperience" name="previousExperience" className="input min-h-[80px]" defaultValue={app.previousExperience ?? ""} /></div>
          <div className="sm:col-span-2"><label className="label" htmlFor="professionalInfo">Other professional information</label><textarea id="professionalInfo" name="professionalInfo" className="input min-h-[60px]" defaultValue={app.professionalInfo ?? ""} /></div>
          <div><label className="label" htmlFor="photo">Passport photograph</label><input id="photo" name="photo" type="file" accept="image/jpeg,image/png" className="input" required={!app.photoFileId} /></div>
          <div><label className="label" htmlFor="documents">Supporting documents (PDF/JPG/PNG, up to 5)</label><input id="documents" name="documents" type="file" multiple accept="application/pdf,image/jpeg,image/png" className="input" />{app.documents.length > 0 && <p className="help">{app.documents.length} document(s) already uploaded.</p>}</div>
          <div className="flex justify-end sm:col-span-2"><SubmitButton pendingText="Submitting…">Submit application</SubmitButton></div>
        </ActionForm>
      </Card>
    </div>
  );
}
