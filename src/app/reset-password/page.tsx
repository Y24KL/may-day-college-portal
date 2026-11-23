import { AuthFrame } from "@/components/auth/AuthFrame";
import { ActionForm, SubmitButton, PasswordInput } from "@/components/ui/client";
import { resetPassword } from "@/app/actions/auth";
import { Alert } from "@/components/ui";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "Choose a new password" };

export default async function ResetPassword({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const s = await getSettings();
  return (
    <AuthFrame title="Choose a new password">
      {!token ? (
        <Alert tone="red">This reset link is incomplete. Please use the link from your email.</Alert>
      ) : (
        <ActionForm action={resetPassword} className="space-y-4">
          <input type="hidden" name="token" value={token} />
          <div>
            <label className="label" htmlFor="password">New password</label>
            <PasswordInput id="password" name="password" showStrength minLength={s.passwordMinLength} />
          </div>
          <div>
            <label className="label" htmlFor="confirm">Confirm new password</label>
            <input id="confirm" name="confirm" type="password" className="input" required autoComplete="new-password" />
          </div>
          <SubmitButton className="btn-primary w-full">Update password</SubmitButton>
        </ActionForm>
      )}
    </AuthFrame>
  );
}
