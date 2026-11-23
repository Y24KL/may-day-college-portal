import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { PageHeader, Card, StatusBadge, Alert, EmptyState } from "@/components/ui";
import { ConfirmAction, ModalForm } from "@/components/ui/client";
import { reviewScores, amendScore } from "@/app/actions/admin/results";
import { studentsForOffering } from "@/lib/access";
import { termLabel } from "@/lib/academic";
import { formatDateTime } from "@/lib/utils";
import { BarsChart } from "@/components/charts";

export default async function ReviewSheet({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireAdminPage();
  const { id } = await params;
  const sub = await db.scoreSubmission.findUnique({
    where: { id },
    include: { offering: { include: { subject: true, class: true, teacherAssignments: { include: { teacher: true } } } }, term: { include: { session: true } }, details: { include: { student: true, amendments: { orderBy: { createdAt: "desc" } } } }, approvals: { orderBy: { createdAt: "desc" } } },
  });
  if (!sub) notFound();
  const registered = await studentsForOffering(sub.offeringId);
  const missing = registered.filter((s) => !sub.details.some((d) => d.studentId === s.id));
  const details = [...sub.details].sort((a, b) => a.student.fullName.localeCompare(b.student.fullName));
  const totals = details.filter((d) => d.total !== null).map((d) => Number(d.total));
  const avg = totals.length ? (totals.reduce((a, b) => a + b, 0) / totals.length).toFixed(1) : "—";
  const dist = new Map<string, number>();
  details.forEach((d) => d.grade && dist.set(d.grade, (dist.get(d.grade) ?? 0) + 1));
  const actors = await db.user.findMany({ where: { id: { in: sub.approvals.map((a) => a.actorId) } }, select: { id: true, email: true } });
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={termLabel(sub.term)} title={`${sub.offering.subject.name} — ${sub.offering.class.name}`} description={`Teacher: ${sub.offering.teacherAssignments.filter((a) => a.isActive).map((a) => a.teacher.fullName).join(", ") || "—"} · CA /${sub.caMax}, Exam /${sub.examMax}`}
        actions={<>
          <Link href={`/admin/results?termId=${sub.termId}`} className="btn-secondary">Back</Link>
          {sub.status === "SUBMITTED" && u.permissions.has("results.review") && <>
            <ConfirmAction action={reviewScores} fields={{ submissionId: sub.id, decision: "APPROVE" }} label="Approve scores" className="btn-primary" title="Approve score sheet" message="Approved sheets can be published by a results officer." />
            <ModalForm trigger="Return for correction" triggerClassName="btn-secondary" title="Return to teacher" action={reviewScores} submitLabel="Return"><input type="hidden" name="submissionId" value={sub.id} /><input type="hidden" name="decision" value="RETURN" /><textarea name="comment" className="input min-h-[100px]" placeholder="What must be corrected?" required /></ModalForm>
          </>}
        </>}
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Summary">
          <div className="space-y-2 text-sm">
            <p className="flex justify-between"><span className="text-muted">Status</span><StatusBadge status={sub.status} /></p>
            <p className="flex justify-between"><span className="text-muted">Students scored</span><b>{details.length} / {registered.length}</b></p>
            <p className="flex justify-between"><span className="text-muted">Subject average</span><b>{avg}</b></p>
            <p className="flex justify-between"><span className="text-muted">Submitted</span><span>{formatDateTime(sub.submittedAt)}</span></p>
          </div>
          {missing.length > 0 && <div className="mt-3"><Alert tone="amber">{missing.length} registered student(s) have no score row.</Alert></div>}
          {sub.returnReason && <div className="mt-3"><Alert tone="blue" title="Last return reason">{sub.returnReason}</Alert></div>}
        </Card>
        <Card title="Grade distribution" className="lg:col-span-2">
          {dist.size ? <BarsChart data={[...dist.entries()].sort().map(([grade, count]) => ({ grade, Students: count }))} xKey="grade" bars={[{ key: "Students" }]} height={200} /> : <EmptyState title="No grades yet" />}
        </Card>
      </div>
      <Card title="Scores">
        {details.length ? (
          <div className="table-wrap"><table className="table"><thead><tr><th>Student</th><th>CA</th><th>Exam</th><th>Total</th><th>Grade</th><th>Remark</th><th /></tr></thead>
            <tbody>{details.map((d) => (
              <tr key={d.id}><td><p className="font-medium text-navy">{d.student.fullName}</p><p className="text-xs text-muted">{d.student.studentNumber}</p></td><td>{d.caScore?.toString() ?? "—"}</td><td>{d.examScore?.toString() ?? "—"}</td><td className="font-semibold">{d.total?.toString() ?? "—"}</td><td>{d.grade}</td><td className="max-w-[16rem] text-xs text-muted">{d.teacherRemark}{d.amendments.length > 0 && <p className="text-amber-700">Amended {d.amendments.length}×</p>}</td>
                <td className="text-right">{sub.status === "PUBLISHED" && u.permissions.has("results.amend") && (
                  <ModalForm trigger="Amend" triggerClassName="btn-ghost btn-sm" title={`Amend ${d.student.fullName}`} action={amendScore} submitLabel="Record amendment">
                    <input type="hidden" name="resultDetailId" value={d.id} />
                    <Alert tone="amber">Amendments to published results are permanently recorded with your name and reason. The report card is regenerated as a new version.</Alert>
                    <div className="grid grid-cols-2 gap-3"><div><label className="label">CA (/{sub.caMax})</label><input name="ca" type="number" step="0.01" className="input" defaultValue={d.caScore?.toString()} required /></div><div><label className="label">Exam (/{sub.examMax})</label><input name="exam" type="number" step="0.01" className="input" defaultValue={d.examScore?.toString()} required /></div></div>
                    <textarea name="reason" className="input" placeholder="Reason for amendment (min 10 characters)" required />
                  </ModalForm>
                )}</td></tr>
            ))}</tbody></table></div>
        ) : <EmptyState title="No scores entered" />}
      </Card>
      <Card title="Workflow history">
        <ul className="space-y-1 text-sm">{sub.approvals.map((a) => <li key={a.id}><StatusBadge status={a.action === "RETURNED" ? "RETURNED" : a.action === "AMENDED" ? "PENDING" : a.action} /> <span className="text-muted">{actors.find((x) => x.id === a.actorId)?.email} · {formatDateTime(a.createdAt)}</span> {a.comment && <span>— {a.comment}</span>}</li>)}{!sub.approvals.length && <li className="text-muted">No workflow events yet.</li>}</ul>
      </Card>
    </div>
  );
}
