import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/guards";
import { PageHeader, Card, Alert } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { createStudentManually } from "@/app/actions/admin/people";
import { classOptions, sessionOptions } from "@/lib/options";

export const metadata = { title: "Register student" };

export default async function NewStudent() {
  await requireAdminPage("students.manage");
  const [classes, sessions] = await Promise.all([classOptions(), sessionOptions()]);
  return (
    <div className="space-y-5">
      <PageHeader title="Register a student manually" description="For students registered at the school office. The account is approved immediately." actions={<Link className="btn-secondary" href="/admin/students">Back</Link>} />
      {!classes.length || !sessions.length ? <Alert tone="amber">Configure classes and an academic session first.</Alert> : (
        <Card>
          <ActionForm action={createStudentManually} className="grid gap-4 sm:grid-cols-2" encType="multipart/form-data">
            <div className="sm:col-span-2"><label className="label">Full name</label><input name="fullName" className="input" required /></div>
            <div><label className="label">Student email (sign-in)</label><input name="email" type="email" className="input" required /></div>
            <div><label className="label">Temporary password</label><input name="tempPassword" className="input" required autoComplete="off" /><p className="help">Min 10 chars, upper/lower case and a number. Ask the student to change it.</p></div>
            <div><label className="label">Date of birth</label><input name="dateOfBirth" type="date" className="input" required /></div>
            <div><label className="label">Gender</label><select name="gender" className="input" required><option value="MALE">Male</option><option value="FEMALE">Female</option></select></div>
            <div className="sm:col-span-2"><label className="label">Address</label><input name="address" className="input" required /></div>
            <div><label className="label">Guardian name</label><input name="guardianName" className="input" required /></div>
            <div><label className="label">Guardian phone</label><input name="guardianPhone" className="input" required /></div>
            <div className="sm:col-span-2"><label className="label">Guardian email</label><input name="guardianEmail" type="email" className="input" required /></div>
            <div><label className="label">Class & sector</label><select name="classId" className="input" required>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div><label className="label">Session</label><select name="sessionId" className="input" required>{sessions.filter((s) => s.status !== "ARCHIVED").map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div className="sm:col-span-2"><label className="label">Passport photograph (optional)</label><input name="photo" type="file" accept="image/jpeg,image/png" className="input" /></div>
            <div className="flex justify-end sm:col-span-2"><SubmitButton>Create student</SubmitButton></div>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
