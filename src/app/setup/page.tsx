import { AuthFrame } from "@/components/auth/AuthFrame";
import { ActionForm, SubmitButton, PasswordInput } from "@/components/ui/client";
import { setupSuperAdmin } from "@/app/actions/setup";
import { superAdminExists } from "@/lib/setup";
import { Alert } from "@/components/ui";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata = { title: "Initial setup" };

export default async function Setup() {
  const exists = await superAdminExists();
  return (
    <AuthFrame title="Initial platform setup" subtitle="Create the first Super Administrator.">
      {exists ? (
        <Alert tone="green" title="Setup complete">A Super Administrator already exists. Additional administrators are created from the administrator portal.</Alert>
      ) : !env.setupToken ? (
        <Alert tone="amber" title="Setup disabled">Set the <code>SETUP_TOKEN</code> environment variable on the server to enable this one-time setup, or run <code>npm run setup:admin</code> from a trusted shell.</Alert>
      ) : (
        <ActionForm action={setupSuperAdmin} className="space-y-4">
          <div>
            <label className="label" htmlFor="token">Setup token</label>
            <input id="token" name="token" type="password" className="input" required autoComplete="off" />
            <p className="help">The value of SETUP_TOKEN configured on the server.</p>
          </div>
          <div>
            <label className="label" htmlFor="fullName">Full name</label>
            <input id="fullName" name="fullName" className="input" required />
          </div>
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" className="input" required />
          </div>
          <div>
            <label className="label" htmlFor="password">Password (min 12 characters)</label>
            <PasswordInput id="password" name="password" showStrength minLength={12} />
          </div>
          <div>
            <label className="label" htmlFor="confirm">Confirm password</label>
            <input id="confirm" name="confirm" type="password" className="input" required />
          </div>
          <SubmitButton className="btn-primary w-full">Create Super Administrator</SubmitButton>
        </ActionForm>
      )}
    </AuthFrame>
  );
}
