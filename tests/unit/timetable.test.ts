import { describe, it, expect } from "vitest";
import { detectConflicts, validatePeriods, overlaps, type Slot } from "@/lib/timetable";

const slot = (o: Partial<Slot>): Slot => ({ timetableId: "tt1", classLabel: "SSS1 Science", dayOfWeek: 1, periodId: "p1", startTime: "08:00", endTime: "08:40", ...o });

describe("timetable conflicts", () => {
  it("detects a teacher booked in two classes at once", () => {
    const c = detectConflicts([slot({ id: "a", teacherId: "t1", teacherName: "Mr A" })], [slot({ id: "b", timetableId: "tt2", classLabel: "SSS2 Arts", teacherId: "t1" })]);
    expect(c.map((x) => x.type)).toEqual(["TEACHER"]);
  });
  it("detects classroom double-booking", () => {
    const c = detectConflicts([slot({ id: "a", classroomId: "r1" })], [slot({ id: "b", timetableId: "tt2", classroomId: "r1", startTime: "08:20", endTime: "09:00", periodId: "p2" })]);
    expect(c.map((x) => x.type)).toEqual(["CLASSROOM"]);
  });
  it("detects overlapping lessons for one class", () => {
    const c = detectConflicts([slot({ id: "a" }), slot({ id: "b", periodId: "p2", startTime: "08:30", endTime: "09:10" })], []);
    expect(c.some((x) => x.type === "CLASS")).toBe(true);
  });
  it("allows back-to-back and different-day lessons", () => {
    expect(detectConflicts([slot({ id: "a", teacherId: "t1" })], [slot({ id: "b", timetableId: "tt2", teacherId: "t1", startTime: "08:40", endTime: "09:20", periodId: "p2" }), slot({ id: "c", timetableId: "tt2", teacherId: "t1", dayOfWeek: 2 })])).toEqual([]);
    expect(overlaps({ startTime: "08:00", endTime: "08:40" }, { startTime: "08:40", endTime: "09:20" })).toBe(false);
  });
  it("validates period definitions", () => {
    expect(validatePeriods([{ name: "P1", startTime: "08:00", endTime: "08:40" }, { name: "P2", startTime: "08:40", endTime: "09:20" }])).toEqual([]);
    expect(validatePeriods([{ name: "P1", startTime: "09:00", endTime: "08:40" }]).join()).toMatch(/start must be before end/);
    expect(validatePeriods([{ name: "P1", startTime: "8am", endTime: "08:40" }]).join()).toMatch(/HH:MM/);
    expect(validatePeriods([{ name: "P1", startTime: "08:00", endTime: "09:00" }, { name: "P2", startTime: "08:30", endTime: "09:30" }]).join()).toMatch(/overlaps/);
  });
});
