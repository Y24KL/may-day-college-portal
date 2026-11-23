/** Pure grading helpers (no DB) — fully unit tested. */
export type Boundary = { grade: string; minScore: number; maxScore: number; description: string; remark?: string | null };

export function validateBoundaries(bs: Boundary[], total = 100): string[] {
  const errs: string[] = [];
  if (!bs.length) return ["Add at least one grade boundary."];
  const sorted = [...bs].sort((a, b) => a.minScore - b.minScore);
  for (const b of sorted) {
    if (b.minScore > b.maxScore) errs.push(`Grade ${b.grade}: minimum is above maximum.`);
    if (b.minScore < 0 || b.maxScore > total) errs.push(`Grade ${b.grade}: must be within 0–${total}.`);
  }
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].minScore <= sorted[i - 1].maxScore) errs.push(`Grades ${sorted[i - 1].grade} and ${sorted[i].grade} overlap.`);
  }
  const grades = new Set(bs.map((b) => b.grade.toUpperCase()));
  if (grades.size !== bs.length) errs.push("Grade labels must be unique.");
  return errs;
}

/** Find the grade for a total. Boundaries are inclusive; decimals between bands
 * (e.g. 69.5 when bands are 60–69, 70–100) go to the lower band. */
export function gradeFor(total: number, bs: Boundary[]): Boundary | null {
  const sorted = [...bs].sort((a, b) => b.minScore - a.minScore);
  for (const b of sorted) if (total >= b.minScore) return b;
  return null;
}

export type ScoreCheck = { ok: true; total: number | null } | { ok: false; error: string };

export function checkScores(ca: number | null, exam: number | null, caMax: number, examMax: number): ScoreCheck {
  for (const [label, v, max] of [["CA", ca, caMax], ["Exam", exam, examMax]] as const) {
    if (v === null) continue;
    if (!Number.isFinite(v)) return { ok: false, error: `${label} score must be a number.` };
    if (v < 0) return { ok: false, error: `${label} score cannot be negative.` };
    if (v > max) return { ok: false, error: `${label} score cannot exceed ${max}.` };
    if (Math.round(v * 100) !== v * 100) return { ok: false, error: `${label} score allows at most 2 decimal places.` };
  }
  if (ca === null && exam === null) return { ok: true, total: null };
  return { ok: true, total: Math.round(((ca ?? 0) + (exam ?? 0)) * 100) / 100 };
}

/** Standard competition ranking (1,2,2,4). Returns map id → position. */
export function rankByAverage(rows: { id: string; average: number }[]): Map<string, number> {
  const sorted = [...rows].sort((a, b) => b.average - a.average);
  const out = new Map<string, number>();
  let prev: number | null = null;
  let pos = 0;
  sorted.forEach((r, i) => {
    if (prev === null || r.average !== prev) pos = i + 1;
    out.set(r.id, pos);
    prev = r.average;
  });
  return out;
}

export const DEFAULT_WAEC_STYLE: Boundary[] = [
  { grade: "A1", minScore: 75, maxScore: 100, description: "Excellent", remark: "Excellent performance" },
  { grade: "B2", minScore: 70, maxScore: 74.99, description: "Very Good", remark: "Very good" },
  { grade: "B3", minScore: 65, maxScore: 69.99, description: "Good", remark: "Good" },
  { grade: "C4", minScore: 60, maxScore: 64.99, description: "Credit", remark: "Credit" },
  { grade: "C5", minScore: 55, maxScore: 59.99, description: "Credit", remark: "Credit" },
  { grade: "C6", minScore: 50, maxScore: 54.99, description: "Credit", remark: "Credit" },
  { grade: "D7", minScore: 45, maxScore: 49.99, description: "Pass", remark: "Pass" },
  { grade: "E8", minScore: 40, maxScore: 44.99, description: "Pass", remark: "Weak pass" },
  { grade: "F9", minScore: 0, maxScore: 39.99, description: "Fail", remark: "Needs improvement" },
];
