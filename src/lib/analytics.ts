/**
 * Academic analytics computed ONLY from published results passed in by the
 * caller. Nothing is fabricated: missing terms are simply absent.
 * Differences between averages/scores (both out of 100) are expressed in
 * PERCENTAGE POINTS; relative change is expressed as a PERCENT.
 */
export type TermScore = {
  termId: string;
  termLabel: string; // e.g. "2026/2027 First Term"
  order: number; // chronological sort key
  subject: string;
  total: number; // out of 100
  grade?: string | null;
};

export type Insight = { kind: "improved" | "declined" | "strongest" | "weakest" | "consistent" | "info"; text: string };

export function round1(n: number) {
  return Math.round(n * 10) / 10;
}

export function termAverages(scores: TermScore[]) {
  const by = new Map<string, { termId: string; label: string; order: number; sum: number; n: number }>();
  for (const s of scores) {
    const t = by.get(s.termId) ?? { termId: s.termId, label: s.termLabel, order: s.order, sum: 0, n: 0 };
    t.sum += s.total;
    t.n += 1;
    by.set(s.termId, t);
  }
  return [...by.values()].sort((a, b) => a.order - b.order).map((t) => ({ termId: t.termId, label: t.label, order: t.order, average: round1(t.sum / t.n), subjects: t.n }));
}

export function subjectSeries(scores: TermScore[]) {
  const by = new Map<string, TermScore[]>();
  for (const s of scores) by.set(s.subject, [...(by.get(s.subject) ?? []), s]);
  for (const arr of by.values()) arr.sort((a, b) => a.order - b.order);
  return by;
}

export function gradeDistribution(scores: { grade?: string | null }[]) {
  const m = new Map<string, number>();
  for (const s of scores) if (s.grade) m.set(s.grade, (m.get(s.grade) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([grade, count]) => ({ grade, count }));
}

export function pointChange(prev: number, curr: number) {
  return round1(curr - prev);
}

export function percentChange(prev: number, curr: number): number | null {
  if (prev === 0) return null;
  return round1(((curr - prev) / prev) * 100);
}

function pts(n: number) {
  const a = Math.abs(n);
  return `${a} percentage point${a === 1 ? "" : "s"}`;
}

/** Generate personalised statements from real records. */
export function generateInsights(scores: TermScore[], opts: { minChange?: number } = {}): Insight[] {
  const minChange = opts.minChange ?? 5;
  const insights: Insight[] = [];
  const terms = termAverages(scores);
  if (!terms.length) return [];
  const latest = terms[terms.length - 1];
  const latestScores = scores.filter((s) => s.termId === latest.termId);

  if (latestScores.length >= 2) {
    const best = [...latestScores].sort((a, b) => b.total - a.total)[0];
    const worst = [...latestScores].sort((a, b) => a.total - b.total)[0];
    insights.push({ kind: "strongest", text: `${best.subject} is currently your strongest subject (${round1(best.total)}%).` });
    if (worst.subject !== best.subject && worst.total < 50) {
      insights.push({ kind: "weakest", text: `${worst.subject} needs attention — you scored ${round1(worst.total)}% in ${latest.label}.` });
    }
  }

  if (terms.length >= 2) {
    const prev = terms[terms.length - 2];
    const d = pointChange(prev.average, latest.average);
    if (Math.abs(d) >= 1) {
      insights.push({
        kind: d > 0 ? "improved" : "declined",
        text: `Your overall average ${d > 0 ? "rose" : "fell"} by ${pts(d)} from ${prev.label} (${prev.average}%) to ${latest.label} (${latest.average}%).`,
      });
    } else {
      insights.push({ kind: "consistent", text: `Your overall average held steady at about ${latest.average}% compared with ${prev.label}.` });
    }
    const series = subjectSeries(scores);
    for (const [subject, arr] of series) {
      const curr = arr.find((s) => s.termId === latest.termId);
      const before = arr.find((s) => s.termId === prev.termId);
      if (!curr || !before) continue;
      const change = pointChange(before.total, curr.total);
      if (change >= minChange) insights.push({ kind: "improved", text: `Your ${subject} performance improved by ${pts(change)} this term.` });
      else if (change <= -minChange) insights.push({ kind: "declined", text: `Your ${subject} performance declined by ${pts(change)} compared with the previous term.` });
    }
    for (const [subject, arr] of series) {
      if (arr.length >= 3) {
        const last3 = arr.slice(-3);
        if (last3[1].total > last3[0].total && last3[2].total > last3[1].total) {
          insights.push({ kind: "consistent", text: `You have shown consistent improvement in ${subject} over your last three terms.` });
        }
      }
    }
  } else {
    insights.push({ kind: "info", text: "Trends will appear once results for more than one term have been published." });
  }
  return insights;
}
