import Link from "next/link";
import { requireParentPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { parentChildren } from "@/lib/parent";
import { attendanceSummary, publishedResultsForStudent } from "@/lib/academic";
import { termAverages } from "@/lib/analytics";
import { studentBalance } from "@/lib/finance";
import { visibleAnnouncementsWhere } from "@/lib/announcements";
import { PageHeader, Card, EmptyState, Alert, Badge } from "@/components/ui";
import { Stagger, StaggerItem, ActionForm, SubmitButton } from "@/components/ui/client";
import { acceptInvitation } from "@/app/actions/parent";
import { formatNaira, formatDate } from "@/lib/utils";

export const metadata = { title: "Parent overview" };

export default async function ParentHome() {
  const u = await requireParentPage();
  const [{ children }, invitations, notices, payments] = await Promise.all([
    parentChildren(u.parentId),
    db.parentInvitation.findMany({ where: { email: u.email, status: "PENDING", expiresAt: { gt: new Date() } }, include: { student: { select: { fullName: true } } } }),
    db.announcement.findMany({ where: await visibleAnnouncementsWhere(u), orderBy: [{ isPinned: "desc" }, { publishAt: "desc" }], take: 4 }),
    db.payment.findMany({ where: { student: { parents: { some: { parentId: u.parentId, status: "VERIFIED" } } } }, orderBy: { verifiedAt: "desc" }, take: 5, include: { student: true } }),
  ]);
  const term = await db.term.findFirst({ where: { isCurrent: true } });
  const cards = await Promise.all(children.map(async (c) => {
    const [att, res, bal] = await Promise.all([attendanceSummary(c.id, term?.id), publishedResultsForStudent(c.id), studentBalance(c.id)]);
    const t = termAverages(res);
    return { c, att, latest: t[t.length - 1], prev: t[t.length - 2], bal };
  }));
  return (
    <div className="space-y-6">
      <PageHeader title={`Welcome, ${u.displayName.split(" ")[0]}`} description="Records of your verified children." />
      {invitations.map((i) => (
        <Alert key={i.id} tone="blue" title={`Invitation to link ${i.student.fullName}`}>
          <ActionForm action={acceptInvitation} className="mt-2 flex flex-wrap items-end gap-2">
            <input type="hidden" name="invitationId" value={i.id} />
            <select name="relationship" className="input max-w-[10rem]" aria-label="Relationship"><option>Mother</option><option>Father</option><option>Guardian</option></select>
            <SubmitButton className="btn-primary btn-sm">Accept invitation</SubmitButton>
          </ActionForm>
        </Alert>
      ))}
      {!children.length ? (
        <Card><EmptyState title="No linked children yet" description="When your child is approved by the school, an invitation is sent to the parent email they provided. You can also request a link for the school to verify." action={<Link className="btn-primary" href="/parent/children">Link a child</Link>} /></Card>
      ) : (
        <Stagger className="grid gap-4 md:grid-cols-2">
          {cards.map(({ c, att, latest, prev, bal }) => (
            <StaggerItem key={c.id}>
              <Card className="h-full">
                <div className="flex items-start gap-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {c.photoFileId ? <img src={`/api/files/${c.photoFileId}`} alt="" className="h-16 w-14 rounded-xl object-cover" /> : <div className="grid h-16 w-14 place-items-center rounded-xl bg-lavender font-display text-xl text-royal">{c.fullName[0]}</div>}
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-lg font-bold text-navy">{c.fullName}</p>
                    <p className="text-xs text-muted">{c.studentNumber} · {c.currentClass?.name ?? "Not enrolled"} {c.currentClass && `· ${c.currentClass.sector.name}`}</p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-white/60 p-2"><p className="text-[10px] font-semibold uppercase text-muted">Average</p><p className="font-display text-lg font-bold text-navy">{latest ? `${latest.average}%` : "—"}</p>{latest && prev && <p className={`text-[10px] ${latest.average >= prev.average ? "text-emerald-700" : "text-rose-700"}`}>{latest.average >= prev.average ? "▲" : "▼"} {Math.abs(Math.round((latest.average - prev.average) * 10) / 10)} pts</p>}</div>
                  <div className="rounded-xl bg-white/60 p-2"><p className="text-[10px] font-semibold uppercase text-muted">Attendance</p><p className="font-display text-lg font-bold text-navy">{att.percentage === null ? "—" : `${att.percentage}%`}</p></div>
                  <div className="rounded-xl bg-white/60 p-2"><p className="text-[10px] font-semibold uppercase text-muted">Outstanding</p><p className={`font-display text-sm font-bold ${bal.outstanding.greaterThan(0) ? "text-rose-700" : "text-emerald-700"}`}>{formatNaira(bal.outstanding)}</p></div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link className="btn-secondary btn-sm" href={`/parent/results?child=${c.id}`}>Results</Link>
                  <Link className="btn-secondary btn-sm" href={`/parent/attendance?child=${c.id}`}>Attendance</Link>
                  <Link className="btn-secondary btn-sm" href={`/parent/fees?child=${c.id}`}>Fees</Link>
                  <Link className="btn-secondary btn-sm" href={`/parent/report-cards?child=${c.id}`}>Report cards</Link>
                </div>
              </Card>
            </StaggerItem>
          ))}
        </Stagger>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Announcements" actions={<Link className="btn-ghost btn-sm" href="/notices">All</Link>}>{notices.length ? <ul className="space-y-2">{notices.map((n) => <li key={n.id}><Link href={`/notices/${n.id}`} className="block rounded-xl bg-white/60 p-3 hover:bg-white"><p className="text-sm font-semibold text-navy">{n.title}</p><p className="text-xs text-muted">{n.category} · {formatDate(n.publishAt)}</p></Link></li>)}</ul> : <EmptyState title="No announcements" />}</Card>
        <Card title="Recent verified payments">{payments.length ? <ul className="space-y-2 text-sm">{payments.map((p) => <li key={p.id} className="flex justify-between rounded-xl bg-white/60 p-3"><span>{p.student.fullName.split(" ").slice(-1)[0]} · {formatDate(p.paymentDate)}</span><Badge tone="green">{formatNaira(p.amount)}</Badge></li>)}</ul> : <EmptyState title="No verified payments yet" />}</Card>
      </div>
    </div>
  );
}
