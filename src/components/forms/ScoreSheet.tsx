"use client";

import { useMemo, useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { saveScoreSheet } from "@/app/actions/teacher";
import { cn } from "@/lib/utils";

type Row = { id: string; name: string; number: string; ca: string; exam: string; remark: string };
type B = { grade: string; minScore: number; maxScore: number; description: string };

function grade(total: number, bs: B[]) {
  return [...bs].sort((a, b) => b.minScore - a.minScore).find((b) => total >= b.minScore);
}

export function ScoreSheet({ offeringId, termId, rows: initial, caMax, examMax, boundaries, editable }: { offeringId: string; termId: string; rows: Row[]; caMax: number; examMax: number; boundaries: B[]; editable: boolean }) {
  const [rows, setRows] = useState(initial);
  const [showBulk, setShowBulk] = useState(false);
  const set = (i: number, k: "ca" | "exam" | "remark", v: string) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const stats = useMemo(() => {
    const totals = rows.filter((r) => r.ca !== "" && r.exam !== "").map((r) => Number(r.ca) + Number(r.exam));
    return { done: totals.length, avg: totals.length ? (totals.reduce((a, b) => a + b, 0) / totals.length).toFixed(1) : "—" };
  }, [rows]);
  const err = (v: string, max: number) => v !== "" && (!Number.isFinite(Number(v)) || Number(v) < 0 || Number(v) > max);
  return (
    <ActionForm action={saveScoreSheet} className="space-y-4">
      <input type="hidden" name="offeringId" value={offeringId} /><input type="hidden" name="termId" value={termId} />
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p><b>{stats.done}</b> / {rows.length} complete · class average <b>{stats.avg}</b> · CA max <b>{caMax}</b>, Exam max <b>{examMax}</b></p>
        {editable && <button type="button" className="btn-secondary btn-sm" onClick={() => setShowBulk((s) => !s)}>{showBulk ? "Hide bulk entry" : "Bulk entry (paste)"}</button>}
      </div>
      {showBulk && editable && (
        <div className="rounded-2xl bg-white/60 p-3">
          <label className="label" htmlFor="bulk">Paste rows: Student ID, CA, Exam (comma or tab separated — e.g. from a spreadsheet)</label>
          <textarea id="bulk" name="bulk" className="input min-h-[140px] font-mono text-xs" placeholder={`${rows[0]?.number ?? "MDC/26/0001"}, 32, 51`} />
          <p className="help">Pasted rows override the table when you save.</p>
        </div>
      )}
      <div className="table-wrap"><table className="table"><thead><tr><th>Student</th><th>CA (/{caMax})</th><th>Exam (/{examMax})</th><th>Total</th><th>Grade</th><th>Remark</th></tr></thead>
        <tbody>{rows.map((r, i) => {
          const complete = r.ca !== "" && r.exam !== "" && !err(r.ca, caMax) && !err(r.exam, examMax);
          const total = complete ? Math.round((Number(r.ca) + Number(r.exam)) * 100) / 100 : null;
          const g = total !== null ? grade(total, boundaries) : undefined;
          return (
            <tr key={r.id}>
              <td><p className="font-medium text-navy">{r.name}</p><p className="text-xs text-muted">{r.number}</p></td>
              <td><input name={`ca_${r.id}`} value={r.ca} onChange={(e) => set(i, "ca", e.target.value)} inputMode="decimal" disabled={!editable} aria-invalid={err(r.ca, caMax)} aria-label={`CA for ${r.name}`} className="input w-20 min-h-[36px] py-1" /></td>
              <td><input name={`exam_${r.id}`} value={r.exam} onChange={(e) => set(i, "exam", e.target.value)} inputMode="decimal" disabled={!editable} aria-invalid={err(r.exam, examMax)} aria-label={`Exam for ${r.name}`} className="input w-20 min-h-[36px] py-1" /></td>
              <td className={cn("font-bold", total !== null && total < 40 && "text-rose-700")}>{total ?? "—"}</td>
              <td>{g ? <span title={g.description}>{g.grade}</span> : "—"}</td>
              <td><input name={`remark_${r.id}`} value={r.remark} onChange={(e) => set(i, "remark", e.target.value)} disabled={!editable} maxLength={300} aria-label={`Remark for ${r.name}`} className="input min-h-[36px] min-w-[10rem] py-1 text-xs" /></td>
            </tr>
          );
        })}</tbody></table></div>
      {editable && (
        <div className="flex flex-wrap justify-end gap-2">
          <SubmitButton className="btn-secondary" name="intent" value="SAVE" pendingText="Saving…">Save draft</SubmitButton>
          <SubmitButton name="intent" value="SUBMIT" pendingText="Submitting…">Submit for review</SubmitButton>
        </div>
      )}
    </ActionForm>
  );
}
