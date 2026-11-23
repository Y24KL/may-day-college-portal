import Link from "next/link";
import { requireParentPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/auth/crypto";
import { PageHeader, Card, Alert } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { acceptInvitation } from "@/app/actions/parent";

export const metadata = { title: "Accept invitation" };

export default async function InvitationPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const u = await requireParentPage();
  const { token } = await searchParams;
  const inv = token ? await db.parentInvitation.findUnique({ where: { tokenHash: hashToken(token) }, include: { student: { select: { fullName: true } } } }) : null;
  const valid = inv && inv.status === "PENDING" && inv.expiresAt > new Date();
  // Show only the student's first name until accepted (minimal disclosure).
  const first = inv?.student.fullName.split(" ").slice(-1)[0];
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Parent invitation" />
      <Card>
        {!valid ? <Alert tone="red">This invitation link is invalid, expired or already used. <Link className="underline" href="/parent/children">Request a link instead</Link>.</Alert>
          : inv!.email !== u.email ? <Alert tone="amber">This invitation was sent to a different email address than the one you are signed in with ({u.email}). Sign in with the invited email, or request a link for administrator verification.</Alert>
          : (
            <ActionForm action={acceptInvitation} className="space-y-4">
              <input type="hidden" name="token" value={token} />
              <p className="text-sm">You have been invited to link your account to <b>{first}</b>&apos;s student profile.</p>
              <div><label className="label" htmlFor="relationship">Your relationship</label><select id="relationship" name="relationship" className="input"><option>Mother</option><option>Father</option><option>Guardian</option></select></div>
              <SubmitButton>Accept and link</SubmitButton>
            </ActionForm>
          )}
      </Card>
    </div>
  );
}
