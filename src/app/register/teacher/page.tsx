import Link from "next/link";
import { AuthFrame } from "@/components/auth/AuthFrame";
import { ActionForm, SubmitButton, PasswordInput } from "@/components/ui/client";
import { registerTeacher } from "@/app/actions/auth";
import { getSettings } from "@/lib/settings";
import { Alert } from "@/components/ui";

export const metadata = { title: "Teacher registration" };

export default async function TeacherRegister() {
  const s = await getSettings();
  return (
    <AuthFrame title="Teacher registration" subtitle="Step 1 of 4 — create your account" footer={<Link className="font-semibold text-royal" href="/register">← Choose another account type</Link>}>
      {!s.teacherRegistrationOpen ? (
        <Alert tone="amber" title="Registration closed">Teacher registration is currently closed.</Alert>
      ) : (
        <ActionForm action={registerTeacher} className="space-y-4">
          <Alert tone="blue">All teacher accounts are reviewed by the school administration. You will not have access to student records until you are approved and assigned to subjects/classes.</Alert>
          <div>
            <label className="label" htmlFor="fullName">Full name</label>
            <input id="fullName" name="fullName" className="input" autoComplete="name" required />
          </div>
          <div>
            <label className="label" htmlFor="email">Email address</label>
            <input id="email" name="email" type="email" className="input" autoComplete="email" required />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <PasswordInput id="password" name="password" showStrength minLength={s.passwordMinLength} />
          </div>
          <div>
            <label className="label" htmlFor="confirm">Confirm password</label>
            <input id="confirm" name="confirm" type="password" className="input" autoComplete="new-password" required />
          </div>
          <SubmitButton className="btn-primary w-full" pendingText="Creating account…">Create account & verify email</SubmitButton>
        </ActionForm>
      )}
    </AuthFrame>
  );
}
