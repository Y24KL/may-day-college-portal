import { requireAdminPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { PageHeader, Card, EmptyState, Badge, Alert } from "@/components/ui";
import { ModalForm, ActionForm, SubmitButton } from "@/components/ui/client";
import { saveGradingSystem, loadStarterGrading, saveScoreConfig } from "@/app/actions/admin/academics";

export const metadata = { title: "Grading configuration" };

export default async function GradingPage() {
  await requireAdminPage("grading.configure");
  const [systems, sessions] = await Promise.all([
    db.gradingSystem.findMany({ include: { boundaries: { orderBy: { minScore: "desc" } } }, orderBy: { createdAt: "asc" } }),
    db.academicSession.findMany({ orderBy: { startDate: "desc" }, include: { scoreConfiguration: { include: { gradingSystem: true } } } }),
  ]);
  const help = "One grade per line: Grade, Min, Max, Description, Remark — e.g. A1, 75, 100, Excellent, Excellent performance";
  return (
    <div className="space-y-5">
      <PageHeader title="Grading & score allocation" description="Grade boundaries and CA/exam maximums are fully configurable. Score sheets snapshot the allocation, so changes never rewrite history."
        actions={<>
          {!systems.length && <ActionForm action={loadStarterGrading}><SubmitButton className="btn-gold">Load A1–F9 starter</SubmitButton></ActionForm>}
          <ModalForm trigger="New grading system" title="Create grading system" action={saveGradingSystem} wide>
            <label className="label">Name</label><input name="name" className="input" required />
            <label className="label">Description</label><input name="description" className="input" />
            <label className="label">Boundaries</label><textarea name="boundaries" className="input min-h-[220px] font-mono text-xs" required placeholder={help} /><p className="help">{help}</p>
          </ModalForm>
        </>}
      />
      <div className="grid gap-5 lg:grid-cols-2">
        {systems.length ? systems.map((g) => (
          <Card key={g.id} title={<span className="flex items-center gap-2">{g.name} {g.isDefault && <Badge tone="gold">Default</Badge>}</span>} description={g.description ?? undefined} actions={
            <ModalForm trigger="Edit" triggerClassName="btn-secondary btn-sm" title={`Edit ${g.name}`} action={saveGradingSystem} wide>
              <input type="hidden" name="gradingSystemId" value={g.id} />
              <label className="label">Name</label><input name="name" className="input" defaultValue={g.name} required />
              <label className="label">Description</label><input name="description" className="input" defaultValue={g.description ?? ""} />
              <label className="label">Boundaries</label><textarea name="boundaries" className="input min-h-[220px] font-mono text-xs" defaultValue={g.boundaries.map((b) => [b.grade, b.minScore, b.maxScore, b.description, b.remark ?? ""].join(", ")).join("\n")} required />
              <p className="help">{help}</p>
            </ModalForm>
          }>
            <div className="table-wrap"><table className="table"><thead><tr><th>Grade</th><th>Range</th><th>Description</th><th>Remark</th></tr></thead>
              <tbody>{g.boundaries.map((b) => <tr key={b.id}><td className="font-bold text-navy">{b.grade}</td><td>{b.minScore.toString()} – {b.maxScore.toString()}</td><td>{b.description}</td><td className="text-muted">{b.remark}</td></tr>)}</tbody></table></div>
          </Card>
        )) : <Card className="lg:col-span-2"><EmptyState title="No grading system" description="Create the school's grading system or load the editable A1–F9 starter." /></Card>}
      </div>
      <Card title="Score allocation per session" description="CA + Exam must total 100.">
        {!systems.length ? <Alert tone="amber">Create a grading system first.</Alert> : sessions.length ? (
          <div className="space-y-3">{sessions.map((s) => (
            <ActionForm key={s.id} action={saveScoreConfig} className="flex flex-wrap items-end gap-3 rounded-xl bg-white/60 p-3">
              <input type="hidden" name="sessionId" value={s.id} />
              <p className="w-28 font-semibold text-navy">{s.name}</p>
              <div><label className="label">Grading system</label><select name="gradingSystemId" className="input" defaultValue={s.scoreConfiguration?.gradingSystemId ?? systems.find((g) => g.isDefault)?.id}>{systems.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
              <div><label className="label">CA max</label><input name="caMax" type="number" min={0} max={100} className="input w-24" defaultValue={s.scoreConfiguration?.caMax ?? 40} /></div>
              <div><label className="label">Exam max</label><input name="examMax" type="number" min={0} max={100} className="input w-24" defaultValue={s.scoreConfiguration?.examMax ?? 60} /></div>
              <SubmitButton className="btn-secondary">{s.scoreConfiguration ? "Update" : "Save"}</SubmitButton>
              {!s.scoreConfiguration && <Badge tone="amber">Not configured — teachers cannot enter scores</Badge>}
            </ActionForm>
          ))}</div>
        ) : <EmptyState title="No sessions" />}
      </Card>
    </div>
  );
}
