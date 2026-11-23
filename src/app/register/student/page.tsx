import Link from "next/link";
import { AuthFrame } from "@/components/auth/AuthFrame";
import { ActionForm, SubmitButton, PasswordInput } from "@/components/ui/client";
import { registerStudent } from "@/app/actions/auth";
import { getSettings } from "@/lib/settings";
import { Alert } from "@/components/ui";

export const metadata = { title: "Student registration" };

export default async function StudentRegister() {
  const s = await getSettings();
  return (
    <AuthFrame title="Student registration" subtitle="Step 1 of 4 — create your account" footer={<Link className="font-semibold text-royal" href="/register">← Choose another account type</Link>}>
      {!s.studentRegistrationOpen ? (
        <Alert tone="amber" title="Registration closed">Student registration is currently closed. Please check back later.</Alert>
      ) : (
        <ActionForm action={registerStudent} className="space-y-4">
          <div>
            <label className="label" htmlFor="email">Student email address</label>
            <input id="email" name="email" type="email" className="input" autoComplete="email" required />
          </div>
          <div>
            <label className="label" htmlFor="guardianEmail">Parent / guardian email address</label>
            <input id="guardianEmail" name="guardianEmail" type="email" className="input" required />
            <p className="help">After approval, your parent will receive a secure invitation to link their account.</p>
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
