import Link from "next/link";
import { AuthFrame } from "@/components/auth/AuthFrame";
import { ActionForm, SubmitButton, PasswordInput } from "@/components/ui/client";
import { registerParent } from "@/app/actions/auth";
import { getSettings } from "@/lib/settings";
import { Alert } from "@/components/ui";

export const metadata = { title: "Parent registration" };

export default async function ParentRegister({ searchParams }: { searchParams: Promise<{ invite?: string; email?: string }> }) {
  const s = await getSettings();
  const sp = await searchParams;
  return (
    <AuthFrame title="Parent / guardian registration" subtitle="Create your own secure account" footer={<>Already have an account? <Link className="font-semibold text-royal" href={sp.invite ? `/login?next=${encodeURIComponent(`/parent/invitation?token=${sp.invite}`)}` : "/login"}>Sign in</Link></>}>
      {!s.parentRegistrationOpen ? (
        <Alert tone="amber" title="Registration closed">Parent registration is currently closed.</Alert>
      ) : (
        <ActionForm action={registerParent} className="space-y-4">
          <input type="hidden" name="invite" value={sp.invite ?? ""} />
          {sp.invite && <Alert tone="blue">Register with the same email address that received the invitation.</Alert>}
          <div>
            <label className="label" htmlFor="fullName">Full name</label>
            <input id="fullName" name="fullName" className="input" autoComplete="name" required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="email">Email address</label>
              <input id="email" name="email" type="email" className="input" autoComplete="email" defaultValue={sp.email ?? ""} required />
            </div>
            <div>
              <label className="label" htmlFor="phone">Phone number</label>
              <input id="phone" name="phone" type="tel" className="input" autoComplete="tel" required />
            </div>
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
