import { requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { PageHeader, Card, DL } from "@/components/ui";
import { ActionForm, SubmitButton, PasswordInput } from "@/components/ui/client";
import { changePassword, signOutOtherSessions } from "@/app/actions/auth";
import { getSettings } from "@/lib/settings";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const u = await requireUser();
  const [s, sessions] = await Promise.all([getSettings(), db.session.findMany({ where: { userId: u.id, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: "desc" } })]);
  return (
    <div className="space-y-5">
      <PageHeader title="Settings" description="Account security." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Change password">
          <ActionForm action={changePassword} className="space-y-3" resetOnSuccess>
            <div><label className="label" htmlFor="current">Current password</label><PasswordInput id="current" name="current" autoComplete="current-password" /></div>
            <div><label className="label" htmlFor="password">New password</label><PasswordInput id="password" name="password" showStrength minLength={s.passwordMinLength} /></div>
            <div><label className="label" htmlFor="confirm">Confirm new password</label><input id="confirm" name="confirm" type="password" className="input" required autoComplete="new-password" /></div>
            <SubmitButton>Update password</SubmitButton>
          </ActionForm>
        </Card>
        <Card title="Account">
          <DL items={[["Email", u.email], ["Account type", u.accountType.toLowerCase()]]} />
          <p className="label mt-5">Active sessions</p>
          <ul className="space-y-2 text-sm">
            {sessions.map((x) => <li key={x.id} className="rounded-xl bg-white/60 p-3"><p className="truncate font-medium text-navy">{x.userAgent || "Unknown device"}</p><p className="text-xs text-muted">{x.ip} · last active {formatDateTime(x.lastSeenAt)} {x.id === u.sessionId && "· this device"}</p></li>)}
          </ul>
          {sessions.length > 1 && <ActionForm action={signOutOtherSessions} className="mt-3"><SubmitButton className="btn-secondary">Sign out of all other devices</SubmitButton></ActionForm>}
        </Card>
      </div>
    </div>
  );
}
