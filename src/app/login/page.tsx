import Link from "next/link";
import { AuthFrame } from "@/components/auth/AuthFrame";
import { ActionForm, SubmitButton, PasswordInput } from "@/components/ui/client";
import { login } from "@/app/actions/auth";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <AuthFrame title="Welcome back" subtitle="Sign in to your May Day College portal." footer={<>New here? <Link className="font-semibold text-royal" href="/register">Create an account</Link></>}>
      <ActionForm action={login} className="space-y-4">
        <input type="hidden" name="next" value={next ?? ""} />
        <div>
          <label className="label" htmlFor="email">Email address</label>
          <input id="email" name="email" type="email" className="input" autoComplete="email" required />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="label" htmlFor="password">Password</label>
            <Link href="/forgot-password" className="mb-1.5 text-xs font-semibold text-royal">Forgot password?</Link>
          </div>
          <PasswordInput id="password" name="password" autoComplete="current-password" />
        </div>
        <SubmitButton className="btn-primary w-full" pendingText="Signing in…">Sign in</SubmitButton>
        <p className="text-center text-xs text-muted">The portal may take up to a minute to wake up if it has been idle.</p>
      </ActionForm>
    </AuthFrame>
  );
}
