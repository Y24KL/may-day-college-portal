import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { validateSelection, windowState } from "@/lib/registration";
import { planAllocation, statusFor, obligationOutstanding } from "@/lib/finance";

const offerings = [
  { id: "m", isCompulsory: true, isActive: true, subjectName: "Mathematics" },
  { id: "e", isCompulsory: true, isActive: true, subjectName: "English" },
  { id: "b", isCompulsory: false, isActive: true, subjectName: "Biology" },
  { id: "f", isCompulsory: false, isActive: true, subjectName: "Further Maths" },
  { id: "x", isCompulsory: false, isActive: false, subjectName: "Withdrawn" },
];

describe("subject registration validation", () => {
  const cfg = { minElectives: 1, maxElectives: 1 };
  it("accepts a valid selection", () => expect(validateSelection(offerings, ["m", "e", "b"], cfg)).toEqual([]));
  it("requires compulsory subjects", () => expect(validateSelection(offerings, ["m", "b"], cfg).join()).toMatch(/English is compulsory/));
  it("enforces elective limits", () => {
    expect(validateSelection(offerings, ["m", "e"], cfg).join()).toMatch(/at least 1/);
    expect(validateSelection(offerings, ["m", "e", "b", "f"], cfg).join()).toMatch(/at most 1/);
  });
  it("rejects unavailable and duplicate subjects", () => {
    expect(validateSelection(offerings, ["m", "e", "x"], { minElectives: 0, maxElectives: 2 }).join()).toMatch(/not available/);
    expect(validateSelection(offerings, ["m", "e", "b", "b"], cfg).join()).toMatch(/more than once/);
    expect(validateSelection(offerings, ["m", "e", "zzz"], { minElectives: 0, maxElectives: 2 }).join()).toMatch(/not available/);
  });
  it("evaluates registration windows", () => {
    const now = new Date("2026-09-10T10:00:00Z");
    expect(windowState(null, now).open).toBe(false);
    expect(windowState({ isOpen: false, opensAt: null, closesAt: null }, now).open).toBe(false);
    expect(windowState({ isOpen: true, opensAt: new Date("2026-09-11"), closesAt: null }, now).open).toBe(false);
    expect(windowState({ isOpen: true, opensAt: null, closesAt: new Date("2026-09-09") }, now).open).toBe(false);
    expect(windowState({ isOpen: true, opensAt: new Date("2026-09-01"), closesAt: new Date("2026-09-30") }, now).open).toBe(true);
  });
});

describe("payment allocation", () => {
  const D = (n: number | string) => new Prisma.Decimal(n);
  const obs = [
    { id: "late", outstanding: D(50000), dueDate: new Date("2026-11-01"), createdAt: new Date("2026-09-01") },
    { id: "early", outstanding: D(100000), dueDate: new Date("2026-10-01"), createdAt: new Date("2026-09-02") },
  ];
  it("allocates oldest-due first and supports partial payment", () => {
    const p = planAllocation(D(120000), obs);
    expect(p.allocations.map((a) => [a.obligationId, a.amount.toNumber()])).toEqual([["early", 100000], ["late", 20000]]);
    expect(p.remainder.toNumber()).toBe(0);
  });
  it("keeps overpayments as a remainder (credit)", () => {
    const p = planAllocation(D(200000), obs);
    expect(p.remainder.toNumber()).toBe(50000);
  });
  it("is exact with kobo amounts (no floating point drift)", () => {
    const p = planAllocation(D("0.30"), [{ id: "a", outstanding: D("0.10"), dueDate: null, createdAt: new Date() }, { id: "b", outstanding: D("0.20"), dueDate: null, createdAt: new Date() }]);
    expect(p.remainder.toString()).toBe("0");
  });
  it("derives obligation status", () => {
    expect(statusFor({ amount: D(100), amountPaid: D(0), amountAdjusted: D(0) })).toBe("UNPAID");
    expect(statusFor({ amount: D(100), amountPaid: D(40), amountAdjusted: D(0) })).toBe("PARTIAL");
    expect(statusFor({ amount: D(100), amountPaid: D(60), amountAdjusted: D(40) })).toBe("PAID");
    expect(statusFor({ amount: D(100), amountPaid: D(0), amountAdjusted: D(100) })).toBe("WAIVED");
    expect(obligationOutstanding({ amount: D(100), amountPaid: D(150), amountAdjusted: D(0) }).toNumber()).toBe(0);
  });
});
