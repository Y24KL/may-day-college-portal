import { requireAdminPage } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { PageHeader, Card, EmptyState, Badge } from "@/components/ui";
import { ActionForm, SubmitButton, ModalForm } from "@/components/ui/client";
import { saveLevel, saveSector, saveClass, loadSuggestedStructure, saveClassroom } from "@/app/actions/admin/academics";
import { assignClassTeacher } from "@/app/actions/admin/people";
import { getCurrentSessionTerm } from "@/lib/academic";

export const metadata = { title: "Class management" };

export default async function ClassesPage() {
  const u = await requireAdminPage("academics.configure");
  const { session } = await getCurrentSessionTerm();
  const [levels, sectors, classes, classrooms, teachers] = await Promise.all([
    db.classLevel.findMany({ orderBy: { order: "asc" } }),
    db.academicSector.findMany({ orderBy: { name: "asc" } }),
    db.class.findMany({
      orderBy: [{ level: { order: "asc" } }, { name: "asc" }],
      include: { level: true, sector: true, _count: { select: { enrollments: session ? { where: { sessionId: session.id, status: "ACTIVE" } } : true } }, classTeacherAssignments: { where: { sessionId: session?.id }, include: { teacher: true } } },
    }),
    db.classroom.findMany({ orderBy: { name: "asc" } }),
    db.teacher.findMany({ where: { isActive: true }, orderBy: { fullName: "asc" } }),
  ]);
  return (
    <div className="space-y-5">
      <PageHeader title="Class management" description="Configure the class levels, academic sectors and class groups the school actually uses." actions={!classes.length && <ActionForm action={loadSuggestedStructure}><SubmitButton className="btn-gold">Load SSS1–3 × Science/Commercial/Arts</SubmitButton></ActionForm>} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Class levels" actions={<ModalForm trigger="Add level" triggerClassName="btn-secondary btn-sm" title="Add class level" action={saveLevel}><label className="label">Name</label><input name="name" className="input" placeholder="SSS1" required /><label className="label">Order</label><input name="order" type="number" min={1} className="input" defaultValue={levels.length + 1} required /></ModalForm>}>
          {levels.length ? <div className="flex flex-wrap gap-2">{levels.map((l) => (
            <ModalForm key={l.id} trigger={<>{l.order}. {l.name}</>} triggerClassName="btn-secondary btn-sm" title={`Edit ${l.name}`} action={saveLevel}><input type="hidden" name="levelId" value={l.id} /><label className="label">Name</label><input name="name" className="input" defaultValue={l.name} required /><label className="label">Order</label><input name="order" type="number" className="input" defaultValue={l.order} required /></ModalForm>
          ))}</div> : <EmptyState title="No class levels" />}
        </Card>
        <Card title="Academic sectors" actions={<ModalForm trigger="Add sector" triggerClassName="btn-secondary btn-sm" title="Add academic sector" action={saveSector}><label className="label">Name</label><input name="name" className="input" placeholder="Science" required /><label className="label">Code</label><input name="code" className="input" placeholder="SCI" required /></ModalForm>}>
          {sectors.length ? <div className="flex flex-wrap gap-2">{sectors.map((s) => (
            <ModalForm key={s.id} trigger={<>{s.name} <span className="opacity-60">{s.code}</span></>} triggerClassName="btn-secondary btn-sm" title={`Edit ${s.name}`} action={saveSector}><input type="hidden" name="sectorId" value={s.id} /><label className="label">Name</label><input name="name" className="input" defaultValue={s.name} /><label className="label">Code</label><input name="code" className="input" defaultValue={s.code} /></ModalForm>
          ))}</div> : <EmptyState title="No sectors" />}
        </Card>
      </div>
      <Card title="Class groups" description={session ? `Enrollment counts and class teachers for ${session.name}.` : "Set a current session to see enrollments."} actions={levels.length > 0 && sectors.length > 0 && (
        <ModalForm trigger="Add class" triggerClassName="btn-primary btn-sm" title="Add class group" action={saveClass}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label">Level</label><select name="levelId" className="input">{levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
            <div><label className="label">Sector</label><select name="sectorId" className="input">{sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div><label className="label">Arm (optional)</label><input name="arm" className="input" placeholder="A" /></div>
            <div><label className="label">Custom name (optional)</label><input name="name" className="input" placeholder="Auto: SSS1 Science A" /></div>
          </div>
        </ModalForm>
      )}>
        {classes.length ? (
          <div className="table-wrap"><table className="table"><thead><tr><th>Class</th><th>Level</th><th>Sector</th><th>Students</th><th>Class teacher</th><th>Status</th><th /></tr></thead>
            <tbody>{classes.map((c) => (
              <tr key={c.id}>
                <td className="font-semibold text-navy">{c.name}</td><td>{c.level.name}</td><td>{c.sector.name}</td><td>{c._count.enrollments}</td>
                <td>
                  {session && u.permissions.has("teachers.assign") ? (
                    <ActionForm action={assignClassTeacher} className="flex gap-2">
                      <input type="hidden" name="classId" value={c.id} /><input type="hidden" name="sessionId" value={session.id} />
                      <select name="teacherId" defaultValue={c.classTeacherAssignments[0]?.teacherId ?? ""} className="input min-h-[34px] py-1 text-xs" aria-label={`Class teacher for ${c.name}`}><option value="">— None —</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}</select>
                      <SubmitButton className="btn-secondary btn-sm">Save</SubmitButton>
                    </ActionForm>
                  ) : c.classTeacherAssignments[0]?.teacher.fullName ?? "—"}
                </td>
                <td>{c.isActive ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</td>
                <td className="text-right">
                  <ModalForm trigger="Edit" triggerClassName="btn-ghost btn-sm" title={`Edit ${c.name}`} action={saveClass}>
                    <input type="hidden" name="classId" value={c.id} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div><label className="label">Level</label><select name="levelId" className="input" defaultValue={c.levelId}>{levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
                      <div><label className="label">Sector</label><select name="sectorId" className="input" defaultValue={c.sectorId}>{sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                      <div><label className="label">Arm</label><input name="arm" className="input" defaultValue={c.arm} /></div>
                      <div><label className="label">Name</label><input name="name" className="input" defaultValue={c.name} /></div>
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={c.isActive} className="h-4 w-4 accent-royal" /> Active</label>
                      <input type="hidden" name="isActive" value="false" />
                    </div>
                  </ModalForm>
                </td>
              </tr>
            ))}</tbody></table></div>
        ) : <EmptyState title="No classes yet" description="Add levels and sectors, then create class groups — or load the suggested structure." />}
      </Card>
      {u.permissions.has("timetable.manage") && (
        <Card title="Classrooms" description="Used by the timetable for room conflict detection." actions={<ModalForm trigger="Add classroom" triggerClassName="btn-secondary btn-sm" title="Add classroom" action={saveClassroom}><label className="label">Name</label><input name="name" className="input" required /><label className="label">Capacity</label><input name="capacity" type="number" min={0} className="input" /></ModalForm>}>
          {classrooms.length ? <div className="flex flex-wrap gap-2">{classrooms.map((r) => <Badge key={r.id} tone="blue">{r.name}{r.capacity ? ` · ${r.capacity}` : ""}</Badge>)}</div> : <EmptyState title="No classrooms" />}
        </Card>
      )}
    </div>
  );
}
