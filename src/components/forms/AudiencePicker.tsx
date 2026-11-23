import { db } from "@/lib/db";

/** Server-rendered audience checkboxes (values "TYPE" or "TYPE:targetId"). */
export async function AudiencePicker({ selected = [] }: { selected?: string[] }) {
  const [levels, sectors, classes] = await Promise.all([
    db.classLevel.findMany({ where: { isActive: true }, orderBy: { order: "asc" } }),
    db.academicSector.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    db.class.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);
  const box = (value: string, label: string) => (
    <label key={value} className="flex items-center gap-2 rounded-lg bg-white/60 px-2 py-1.5 text-sm">
      <input type="checkbox" name="audience" value={value} defaultChecked={selected.includes(value)} className="h-4 w-4 accent-royal" /> {label}
    </label>
  );
  return (
    <fieldset className="space-y-3">
      <legend className="label">Target audience</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[box("EVERYONE", "Everyone"), box("ALL_STUDENTS", "All students"), box("TEACHERS", "Teachers"), box("PARENTS", "Parents")]}</div>
      {levels.length > 0 && <div><p className="mb-1 text-xs text-muted">Class levels (students + their parents)</p><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{levels.map((l) => box(`CLASS_LEVEL:${l.id}`, l.name))}</div></div>}
      {sectors.length > 0 && <div><p className="mb-1 text-xs text-muted">Academic sectors</p><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{sectors.map((s) => box(`SECTOR:${s.id}`, s.name))}</div></div>}
      {classes.length > 0 && (
        <details className="rounded-lg bg-white/40 p-2"><summary className="cursor-pointer text-xs font-semibold text-muted">Specific classes</summary><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">{classes.map((c) => box(`CLASS:${c.id}`, c.name))}</div></details>
      )}
      <div><label className="label" htmlFor="userEmails">Selected individual users (emails)</label><textarea id="userEmails" name="userEmails" className="input" placeholder="one@example.com, two@example.com" /></div>
    </fieldset>
  );
}
