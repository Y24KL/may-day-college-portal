import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth/AuthFrame";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { verifyEmail, resendVerification, logout } from "@/app/actions/auth";
import { getCurrentUser, homeFor } from "@/lib/auth/current-user";

export const metadata = { title: "Verify your email" };
export const dynamic = "force-dynamic";

export default async function VerifyEmail({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (u.emailVerified) redirect(homeFor(u));
  const { next } = await searchParams;
  return (
    <AuthFrame title="Verify your email" subtitle={<>We sent a 6-digit code to <b className="text-navy">{u.email}</b>.</>}>
      <ActionForm action={verifyEmail} className="space-y-4">
        <input type="hidden" name="next" value={next ?? ""} />
        <div>
          <label className="label" htmlFor="code">Verification code</label>
          <input id="code" name="code" inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" className="input text-center font-display text-2xl tracking-[0.6em]" required />
        </div>
        <SubmitButton className="btn-primary w-full">Verify email</SubmitButton>
      </ActionForm>
      <div className="mt-4 flex items-center justify-between text-sm">
        <ActionForm action={resendVerification}><SubmitButton className="btn-ghost btn-sm">Resend code</SubmitButton></ActionForm>
        <form action={logout}><button className="btn-ghost btn-sm">Sign out</button></form>
      </div>
    </AuthFrame>
  );
}
