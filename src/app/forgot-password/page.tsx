import Link from "next/link";
import { AuthFrame } from "@/components/auth/AuthFrame";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { requestPasswordReset } from "@/app/actions/auth";

export const metadata = { title: "Forgot password" };

export default function ForgotPassword() {
  return (
    <AuthFrame title="Reset your password" subtitle="Enter your account email and we'll send a secure reset link." footer={<Link href="/login" className="font-semibold text-royal">Back to sign in</Link>}>
      <ActionForm action={requestPasswordReset} className="space-y-4" resetOnSuccess>
        <div>
          <label className="label" htmlFor="email">Email address</label>
          <input id="email" name="email" type="email" className="input" required autoComplete="email" />
        </div>
        <SubmitButton className="btn-primary w-full">Send reset link</SubmitButton>
      </ActionForm>
    </AuthFrame>
  );
}
