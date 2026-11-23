import { describe, it, expect } from "vitest";
import { generateInsights, termAverages, pointChange, percentChange, gradeDistribution, type TermScore } from "@/lib/analytics";

const mk = (termId: string, order: number, subject: string, total: number, grade?: string): TermScore => ({ termId, termLabel: `T${order}`, order, subject, total, grade });

describe("analytics", () => {
  it("distinguishes percentage points from percent change", () => {
    expect(pointChange(60, 72)).toBe(12);
    expect(percentChange(60, 72)).toBe(20);
    expect(percentChange(0, 50)).toBeNull();
  });
  it("computes term averages chronologically", () => {
    const t = termAverages([mk("b", 2, "Maths", 80), mk("a", 1, "Maths", 60), mk("a", 1, "English", 70)]);
    expect(t.map((x) => [x.termId, x.average])).toEqual([["a", 65], ["b", 80]]);
  });
  it("generates accurate insights in percentage points", () => {
    const scores = [mk("t1", 1, "Mathematics", 60), mk("t1", 1, "Physics", 70), mk("t1", 1, "Chemistry", 65), mk("t2", 2, "Mathematics", 72), mk("t2", 2, "Physics", 85), mk("t2", 2, "Chemistry", 55)];
    const texts = generateInsights(scores).map((i) => i.text);
    expect(texts).toContain("Your Mathematics performance improved by 12 percentage points this term.");
    expect(texts).toContain("Physics is currently your strongest subject (85%).");
    expect(texts.some((t) => t.startsWith("Your Chemistry performance declined by 10 percentage points"))).toBe(true);
  });
  it("does not fabricate trends from a single term", () => {
    const ins = generateInsights([mk("t1", 1, "Maths", 70), mk("t1", 1, "English", 60)]);
    expect(ins.some((i) => i.kind === "improved" || i.kind === "declined")).toBe(false);
    expect(ins.some((i) => i.kind === "info")).toBe(true);
  });
  it("returns nothing when there are no results", () => {
    expect(generateInsights([])).toEqual([]);
  });
  it("detects consistent improvement over three terms", () => {
    const ins = generateInsights([mk("1", 1, "English", 50), mk("2", 2, "English", 55), mk("3", 3, "English", 61), mk("1", 1, "Maths", 70), mk("2", 2, "Maths", 70), mk("3", 3, "Maths", 70)]);
    expect(ins.map((i) => i.text)).toContain("You have shown consistent improvement in English over your last three terms.");
  });
  it("counts grade distribution", () => {
    expect(gradeDistribution([{ grade: "A1" }, { grade: "B2" }, { grade: "A1" }, { grade: null }])).toEqual([{ grade: "A1", count: 2 }, { grade: "B2", count: 1 }]);
  });
});
