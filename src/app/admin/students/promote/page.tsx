import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { PageHeader, Card, EmptyState, FilterBar, Alert } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { promoteStudents } from "@/app/actions/admin/people";
import { classOptions, sessionOptions } from "@/lib/options";

export const metadata = { title: "Student promotion" };

export default async function Promote({ searchParams }: { searchParams: Promise<{ fromSessionId?: string; fromClassId?: string }> }) {
  await requireAdminPage("students.promote");
  const sp = await searchParams;
  const [classes, sessions] = await Promise.all([classOptions(), sessionOptions()]);
  const students = sp.fromSessionId && sp.fromClassId
    ? await db.studentEnrollment.findMany({ where: { sessionId: sp.fromSessionId, classId: sp.fromClassId, status: "ACTIVE" }, include: { student: true }, orderBy: { student: { fullName: "asc" } } })
    : [];
  const results = students.length ? await db.result.findMany({ where: { studentId: { in: students.map((s) => s.studentId) }, term: { sessionId: sp.fromSessionId } }, include: { term: true } }) : [];
  const fromClass = classes.find((c) => c.id === sp.fromClassId);
  const nextLevel = fromClass ? classes.find((c) => c.level.order === fromClass.level.order + 1 && c.sectorId === fromClass.sectorId) : undefined;
  return (
    <div className="space-y-5">
      <PageHeader title="Student promotion" description="Promotion creates a new enrollment in the target session. All previous results, attendance, payments and registrations are preserved." actions={<Link className="btn-secondary" href="/admin/students">Back</Link>} />
      <Card title="1. Choose the class to process">
        <FilterBar>
          <select name="fromSessionId" defaultValue={sp.fromSessionId} className="input max-w-[12rem]" aria-label="From session">{sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <select name="fromClassId" defaultValue={sp.fromClassId} className="input max-w-[14rem]" aria-label="From class">{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </FilterBar>
      </Card>
      {sp.fromClassId && (
        <Card title="2. Select students and the action">
          {students.length ? (
            <ActionForm action={promoteStudents} className="space-y-4">
              <input type="hidden" name="fromSessionId" value={sp.fromSessionId} /><input type="hidden" name="fromClassId" value={sp.fromClassId} />
              <div className="grid gap-3 sm:grid-cols-3">
                <div><label className="label">Action</label><select name="action" className="input"><option value="PROMOTE">Promote</option><option value="REPEAT">Repeat class</option><option value="GRADUATE">Graduate</option></select></div>
                <div><label className="label">Target session</label><select name="toSessionId" className="input">{sessions.filter((s) => s.id !== sp.fromSessionId && s.status !== "ARCHIVED").map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}<option value={sp.fromSessionId}>— (graduation only)</option></select></div>
                <div><label className="label">Destination class</label><select name="toClassId" className="input" defaultValue={nextLevel?.id ?? ""}><option value="">—</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
              </div>
              <div className="table-wrap"><table className="table"><thead><tr><th><span className="sr-only">Select</span></th><th>Student</th><th>Published averages this session</th></tr></thead>
                <tbody>{students.map((e) => (
                  <tr key={e.id}><td><input type="checkbox" name="studentIds" value={e.studentId} defaultChecked className="h-4 w-4 accent-royal" aria-label={`Select ${e.student.fullName}`} /></td><td>{e.student.fullName} <span className="text-xs text-muted">{e.student.studentNumber}</span></td>
                    <td className="text-xs">{results.filter((r) => r.studentId === e.studentId).sort((a, b) => a.term.order - b.term.order).map((r) => `${r.term.name}: ${r.average}%`).join(" · ") || "—"}</td></tr>
                ))}</tbody></table></div>
              <Alert tone="amber">Fee bills for the destination class are generated automatically from configured fee structures.</Alert>
              <SubmitButton>Process selected students</SubmitButton>
            </ActionForm>
          ) : <EmptyState title="No active students in this class for the session" />}
        </Card>
      )}
    </div>
  );
}
