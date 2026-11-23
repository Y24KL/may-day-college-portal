import { requireTeacherPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { teacherOfferings } from "@/lib/teacher";
import { studentsForOffering } from "@/lib/access";
import { boundariesForSession } from "@/lib/results";
import { termLabel } from "@/lib/academic";
import { PageHeader, Card, EmptyState, Alert, StatusBadge } from "@/components/ui";
import { ScoreSheet } from "@/components/forms/ScoreSheet";

export const metadata = { title: "Score management" };

export default async function Scores({ searchParams }: { searchParams: Promise<{ offering?: string; term?: string }> }) {
  const u = await requireTeacherPage();
  const sp = await searchParams;
  const offerings = await teacherOfferings(u.teacherId);
  const offering = offerings.find((o) => o.id === sp.offering) ?? offerings[0];
  const terms = offering ? await db.term.findMany({ where: { sessionId: offering.sessionId }, include: { session: true }, orderBy: { order: "asc" } }) : [];
  const term = terms.find((t) => t.id === sp.term) ?? terms.find((t) => t.isCurrent) ?? terms[0];
  if (!offering) return <><PageHeader title="Score management" /><Card><EmptyState title="No subjects assigned" /></Card></>;
  const [roster, cfg, sub] = await Promise.all([
    studentsForOffering(offering.id),
    boundariesForSession(offering.sessionId),
    term ? db.scoreSubmission.findUnique({ where: { offeringId_termId: { offeringId: offering.id, termId: term.id } }, include: { details: true } }) : null,
  ]);
  const editable = !sub || sub.status === "DRAFT" || sub.status === "RETURNED";
  return (
    <div className="space-y-5">
      <PageHeader title="Score management" description="Enter continuous assessment and examination scores. Teachers cannot publish results — submitted sheets go to the academic office." />
      <Card>
        <form className="flex flex-wrap items-end gap-3">
          <div><label className="label">Subject & class</label><select name="offering" defaultValue={offering.id} className="input">{offerings.map((o) => <option key={o.id} value={o.id}>{o.subject.name} · {o.class.name}</option>)}</select></div>
          <div><label className="label">Term</label><select name="term" defaultValue={term?.id} className="input">{terms.map((t) => <option key={t.id} value={t.id}>{termLabel(t)}</option>)}</select></div>
          <button className="btn-secondary">Open sheet</button>
        </form>
      </Card>
      {!cfg ? <Alert tone="amber">Score allocation and grading have not been configured for this session. Please contact the academic office.</Alert>
        : !term ? <Alert tone="amber">No terms configured.</Alert>
        : !roster.length ? <Card><EmptyState title="No registered students" description="Students appear once their subject registration is approved." /></Card>
        : (
          <Card title={`${offering.subject.name} — ${offering.class.name}`} description={termLabel(term)} actions={<StatusBadge status={sub?.status ?? "DRAFT"} />}>
            {sub?.status === "RETURNED" && <div className="mb-3"><Alert tone="amber" title="Returned for correction">{sub.returnReason}</Alert></div>}
            {sub && !editable && <div className="mb-3"><Alert tone="blue">This sheet is {sub.status.toLowerCase()} and locked.{sub.status === "PUBLISHED" && " Changes now require the official amendment procedure."}</Alert></div>}
            <ScoreSheet offeringId={offering.id} termId={term.id} caMax={sub?.caMax ?? cfg.caMax} examMax={sub?.examMax ?? cfg.examMax} boundaries={cfg.boundaries} editable={editable}
              rows={roster.map((s) => { const d = sub?.details.find((x) => x.studentId === s.id); return { id: s.id, name: s.fullName, number: s.studentNumber, ca: d?.caScore?.toString() ?? "", exam: d?.examScore?.toString() ?? "", remark: d?.teacherRemark ?? "" }; })} />
          </Card>
        )}
    </div>
  );
}
