import Link from "next/link";
import { requireTeacherPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { teacherOfferings, classTeacherClasses } from "@/lib/teacher";
import { PageHeader, Card, EmptyState, Badge } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { saveClassTeacherRemark } from "@/app/actions/teacher";
import { termLabel } from "@/lib/academic";

export const metadata = { title: "My classes" };

export default async function TeacherClasses() {
  const u = await requireTeacherPage();
  const [offerings, cts, template] = await Promise.all([teacherOfferings(u.teacherId), classTeacherClasses(u.teacherId), db.reportCardTemplate.findFirst({ where: { isDefault: true } })]);
  const classes = new Map<string, { name: string; subjects: string[]; isClassTeacher: boolean }>();
  for (const o of offerings) { const c = classes.get(o.classId) ?? { name: o.class.name, subjects: [], isClassTeacher: false }; c.subjects.push(o.subject.name); classes.set(o.classId, c); }
  for (const c of cts) { const e = classes.get(c.classId) ?? { name: c.class.name, subjects: [], isClassTeacher: false }; e.isClassTeacher = true; classes.set(c.classId, e); }
  const term = await db.term.findFirst({ where: { isCurrent: true }, include: { session: true } });
  const results = term && cts.length ? await db.result.findMany({ where: { termId: term.id, classId: { in: cts.map((c) => c.classId) }, status: "PUBLISHED" }, include: { student: true, class: true }, orderBy: { position: "asc" } }) : [];
  const options = (template?.commentOptions ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return (
    <div className="space-y-5">
      <PageHeader title="My classes" />
      {classes.size ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[...classes.entries()].map(([id, c]) => (
          <Card key={id} title={c.name} actions={c.isClassTeacher && <Badge tone="gold">Class teacher</Badge>}>
            <p className="text-sm text-muted">{c.subjects.join(", ") || "No subjects in this class"}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {c.isClassTeacher && <Link className="btn-primary btn-sm" href={`/teacher/attendance?type=DAILY&classId=${id}`}>Daily register</Link>}
              <Link className="btn-secondary btn-sm" href={`/teacher/students?classId=${id}`}>Students</Link>
            </div>
          </Card>
        ))}</div>
      ) : <Card><EmptyState title="No classes assigned" /></Card>}
      {results.length > 0 && term && (
        <Card title={`Class teacher's remarks — ${termLabel(term)}`} description="Saving a remark regenerates the student's report card.">
          <datalist id="ct-remarks">{options.map((o) => <option key={o} value={o} />)}</datalist>
          <div className="table-wrap"><table className="table"><thead><tr><th>Pos.</th><th>Student</th><th>Average</th><th>Remark</th></tr></thead>
            <tbody>{results.map((r) => (
              <tr key={r.id}><td>{r.position}</td><td>{r.student.fullName}<p className="text-xs text-muted">{r.class.name}</p></td><td>{r.average.toString()}%</td>
                <td><ActionForm action={saveClassTeacherRemark} className="flex gap-2"><input type="hidden" name="resultId" value={r.id} /><input name="remark" list="ct-remarks" className="input min-h-[34px] py-1 text-sm" defaultValue={r.classTeacherRemark ?? ""} aria-label={`Remark for ${r.student.fullName}`} /><SubmitButton className="btn-secondary btn-sm">Save</SubmitButton></ActionForm></td></tr>
            ))}</tbody></table></div>
        </Card>
      )}
    </div>
  );
}
