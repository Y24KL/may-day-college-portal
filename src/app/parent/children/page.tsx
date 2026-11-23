import { requireParentPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { parentChildren } from "@/lib/parent";
import { PageHeader, Card, DL, EmptyState, StatusBadge } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { requestChildLink } from "@/app/actions/parent";
import { formatDate, formatDateTime } from "@/lib/utils";

export const metadata = { title: "My children" };

export default async function MyChildren() {
  const u = await requireParentPage();
  const [{ children }, requests, rels] = await Promise.all([
    parentChildren(u.parentId),
    db.parentLinkRequest.findMany({ where: { parentId: u.parentId }, orderBy: { createdAt: "desc" } }),
    db.parentStudentRelationship.findMany({ where: { parentId: u.parentId, status: { not: "VERIFIED" } }, include: { student: { select: { fullName: true } } } }),
  ]);
  return (
    <div className="space-y-5">
      <PageHeader title="My children" description="Student profiles you are verified to access." />
      {children.length ? (
        <div className="grid gap-4 md:grid-cols-2">{children.map((c) => (
          <Card key={c.id} title={c.fullName} description={`${c.relationship} · ${c.studentNumber}`}>
            <div className="flex gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {c.photoFileId && <img src={`/api/files/${c.photoFileId}`} alt="" className="h-28 w-24 rounded-xl object-cover" />}
              <DL items={[["Class", c.currentClass?.name], ["Academic sector", c.currentClass?.sector.name], ["Date of birth", formatDate(c.dateOfBirth)], ["Gender", c.gender]]} />
            </div>
          </Card>
        ))}</div>
      ) : <Card><EmptyState title="No verified children yet" /></Card>}
      {rels.length > 0 && <Card title="Inactive links"><ul className="text-sm">{rels.map((r) => <li key={r.id}>{r.student.fullName} <StatusBadge status={r.status} /></li>)}</ul></Card>}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Request a link" description="If you did not receive an invitation (or it went to another email), the school will verify your relationship — usually with an ID check — before granting access.">
          <ActionForm action={requestChildLink} className="space-y-3" resetOnSuccess>
            <div><label className="label" htmlFor="childFullName">Child&apos;s full name</label><input id="childFullName" name="childFullName" className="input" required /></div>
            <div><label className="label" htmlFor="childStudentNumber">Student ID (if known)</label><input id="childStudentNumber" name="childStudentNumber" className="input" /></div>
            <div><label className="label" htmlFor="relationship">Your relationship</label><select id="relationship" name="relationship" className="input"><option>Mother</option><option>Father</option><option>Guardian</option></select></div>
            <div><label className="label" htmlFor="details">Additional information</label><textarea id="details" name="details" className="input" placeholder="e.g. I will bring my ID to the school office on Monday." /></div>
            <SubmitButton>Submit request</SubmitButton>
          </ActionForm>
        </Card>
        <Card title="My link requests">{requests.length ? <ul className="space-y-2 text-sm">{requests.map((r) => <li key={r.id} className="rounded-xl bg-white/60 p-3"><div className="flex justify-between"><span className="font-medium text-navy">{r.childFullName}</span><StatusBadge status={r.status} /></div><p className="text-xs text-muted">{formatDateTime(r.createdAt)}{r.reviewNote && ` · ${r.reviewNote}`}</p></li>)}</ul> : <EmptyState title="No requests" />}</Card>
      </div>
    </div>
  );
}
