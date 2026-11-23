import { describe, it, expect } from "vitest";
import { checkScores, gradeFor, rankByAverage, validateBoundaries, DEFAULT_WAEC_STYLE } from "@/lib/grading";

describe("grading", () => {
  it("maps totals to configured grades, including decimals between bands", () => {
    expect(gradeFor(75, DEFAULT_WAEC_STYLE)?.grade).toBe("A1");
    expect(gradeFor(74.99, DEFAULT_WAEC_STYLE)?.grade).toBe("B2");
    expect(gradeFor(39.99, DEFAULT_WAEC_STYLE)?.grade).toBe("F9");
    expect(gradeFor(0, DEFAULT_WAEC_STYLE)?.grade).toBe("F9");
    expect(gradeFor(100, DEFAULT_WAEC_STYLE)?.grade).toBe("A1");
  });
  it("respects custom boundaries (nothing hard-coded)", () => {
    const custom = [{ grade: "P", minScore: 50, maxScore: 100, description: "Pass" }, { grade: "F", minScore: 0, maxScore: 49.99, description: "Fail" }];
    expect(gradeFor(50, custom)?.grade).toBe("P");
    expect(gradeFor(49.5, custom)?.grade).toBe("F");
  });
  it("validates boundaries for overlaps and ranges", () => {
    expect(validateBoundaries(DEFAULT_WAEC_STYLE)).toEqual([]);
    expect(validateBoundaries([{ grade: "A", minScore: 50, maxScore: 100, description: "" }, { grade: "B", minScore: 40, maxScore: 60, description: "" }]).join()).toMatch(/overlap/);
    expect(validateBoundaries([{ grade: "A", minScore: 70, maxScore: 60, description: "" }]).join()).toMatch(/minimum is above/);
    expect(validateBoundaries([{ grade: "A", minScore: 0, maxScore: 120, description: "" }]).join()).toMatch(/within/);
  });
  it("validates score limits against the configured allocation", () => {
    expect(checkScores(30, 50, 40, 60)).toEqual({ ok: true, total: 80 });
    expect(checkScores(41, 50, 40, 60).ok).toBe(false);
    expect(checkScores(10, 61, 40, 60).ok).toBe(false);
    expect(checkScores(-1, 50, 40, 60).ok).toBe(false);
    expect(checkScores(10.123, 50, 40, 60).ok).toBe(false);
    expect(checkScores(null, null, 40, 60)).toEqual({ ok: true, total: null });
    expect(checkScores(12.5, 40.25, 40, 60)).toEqual({ ok: true, total: 52.75 });
  });
  it("ranks with standard competition ranking", () => {
    const r = rankByAverage([{ id: "a", average: 80 }, { id: "b", average: 90 }, { id: "c", average: 80 }, { id: "d", average: 70 }]);
    expect([r.get("b"), r.get("a"), r.get("c"), r.get("d")]).toEqual([1, 2, 2, 4]);
  });
});
