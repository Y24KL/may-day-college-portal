import "./harness";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import { resetDatabase, signInAs, signOut, form, pngFile, pdfFile, latestOtp, jar } from "./harness";
import { db } from "@/lib/db";
import { seedDemo, DEMO_PASSWORD } from "../../prisma/seed-demo";
import { getCurrentUser, homeFor } from "@/lib/auth/current-user";
import { registerStudent, registerTeacher, registerParent, verifyEmail, login } from "@/app/actions/auth";
import { submitStudentApplication, submitTeacherApplication } from "@/app/actions/application";
import { approveStudentApplication, approveTeacherApplication, setUserStatus } from "@/app/actions/admin/people";
import { submitSubjectRegistration, submitPayment } from "@/app/actions/student";
import { approvePayment, rejectPayment } from "@/app/actions/admin/finance";
import { publishClassResults, amendScore, reviewScores } from "@/app/actions/admin/results";
import { saveScoreSheet, saveAttendance } from "@/app/actions/teacher";
import { acceptInvitation } from "@/app/actions/parent";
import { publishedResultsForStudent } from "@/lib/academic";
import { teacherCanAccessStudent } from "@/lib/access";
import { teacherStudentIds } from "@/lib/teacher";
import { parentChildren } from "@/lib/parent";
import { canAccessFile } from "@/lib/storage/files";
import { approvePaymentSubmission } from "@/lib/finance";
import { hashToken } from "@/lib/auth/crypto";
import { _resetRateLimits } from "@/lib/rate-limit";

const PW = "Strong2026Pass";
const ok = (r: { ok: boolean; error?: string } | null) => expect(r?.error ?? "ok").toBe("ok");

beforeAll(async () => {
  await resetDatabase();
  await seedDemo();
}, 120_000);
beforeEach(() => _resetRateLimits());

describe("student self-registration requires administrator approval", () => {
  const email = "new.student@example.test";
  it("registers, verifies email, submits onboarding, stays locked until approved", async () => {
    signOut();
    ok(await registerStudent(null, form({ email, guardianEmail: "new.parent@example.test", password: PW, confirm: PW })));
    let u = await getCurrentUser();
    expect(u?.emailVerified).toBe(false);
    expect(homeFor(u!)).toBe("/verify-email");
    expect((await verifyEmail(null, form({ code: "000000" })))?.ok).toBe(false);
    ok(await verifyEmail(null, form({ code: await latestOtp(email) })));
    // Duplicate registration blocked
    expect((await registerStudent(null, form({ email, guardianEmail: "x@example.test", password: PW, confirm: PW })))?.error).toMatch(/already exists/);
    await signInAs(email);
    const cls = await db.class.findFirstOrThrow({ where: { name: "SSS1 Commercial" } });
    const session = await db.academicSession.findFirstOrThrow({ where: { isCurrent: true } });
    ok(await submitStudentApplication(null, form({ fullName: "Test New Student", dateOfBirth: "2011-04-04", gender: "FEMALE", address: "Surulere, Lagos", guardianName: "New Parent", guardianEmail: "new.parent@example.test", guardianPhone: "08000000000", classId: cls.id, sessionId: session.id, photo: await pngFile() })));
    const app = await db.studentApplication.findFirstOrThrow({ where: { user: { email } } });
    expect(app.status).toBe("PENDING_APPROVAL");
    u = await getCurrentUser();
    expect(u?.studentId).toBeUndefined(); // no protected access while pending
    expect(homeFor(u!)).toBe("/application");
    const res = await submitSubjectRegistration(null, form({}));
    expect(res?.ok).toBe(false);
    expect((await submitPayment(null, form({ termId: "x", amount: "100", paymentDate: "2026-09-01", bankReference: "ABCD" })))?.ok).toBe(false);
  });

  it("is approved by an administrator, receives a student ID and portal access", async () => {
    const app = await db.studentApplication.findFirstOrThrow({ where: { user: { email } } });
    // A finance officer lacks students.manage
    await signInAs("bursar@demo.maydaycollege.test");
    expect((await approveStudentApplication(null, form({ applicationId: app.id, classId: app.requestedClassId!, sessionId: app.sessionId! })))?.ok).toBe(false);
    await signInAs("admin@demo.maydaycollege.test");
    ok(await approveStudentApplication(null, form({ applicationId: app.id, classId: app.requestedClassId!, sessionId: app.sessionId! })));
    // Cannot approve twice
    expect((await approveStudentApplication(null, form({ applicationId: app.id, classId: app.requestedClassId!, sessionId: app.sessionId! })))?.ok).toBe(false);
    const s = await db.student.findFirstOrThrow({ where: { user: { email } }, include: { enrollments: true } });
    expect(s.studentNumber).toMatch(/^MDC\/\d{2}\/\d{4}$/);
    expect(s.enrollments).toHaveLength(1);
    expect(await db.parentInvitation.count({ where: { studentId: s.id, email: "new.parent@example.test", status: "PENDING" } })).toBe(1);
    expect(await db.notificationDelivery.count({ where: { toEmail: email, template: "student-approved" } })).toBe(1);
    await signInAs(email);
    expect((await getCurrentUser())?.studentId).toBe(s.id);
  });

  it("registers subjects within limits, compulsory subjects enforced", async () => {
    await signInAs("new.student@example.test");
    const s = await db.student.findFirstOrThrow({ where: { user: { email: "new.student@example.test" } } });
    const offerings = await db.subjectOffering.findMany({ where: { class: { name: "SSS1 Commercial" } }, include: { subject: true } });
    const compulsory = offerings.filter((o) => o.isCompulsory).map((o) => o.id);
    const electives = offerings.filter((o) => !o.isCompulsory).map((o) => o.id);
    expect((await submitSubjectRegistration(null, form({ offeringIds: electives.slice(0, 1) })))?.error).toMatch(/compulsory/);
    expect((await submitSubjectRegistration(null, form({ offeringIds: [...compulsory, ...electives, ...electives] })))?.ok).toBe(false);
    ok(await submitSubjectRegistration(null, form({ offeringIds: [...compulsory, electives[0]] })));
    expect((await submitSubjectRegistration(null, form({ offeringIds: [...compulsory, electives[0]] })))?.error).toMatch(/already registered/);
    const reg = await db.subjectRegistration.findFirstOrThrow({ where: { studentId: s.id }, include: { items: true } });
    expect(reg.items).toHaveLength(compulsory.length + 1);
  });
});

describe("role escalation and role-based access", () => {
  it("choosing a role at registration grants nothing; teachers need approval", async () => {
    signOut();
    ok(await registerTeacher(null, form({ fullName: "New Teacher", email: "new.teacher@example.test", password: PW, confirm: PW })));
    ok(await verifyEmail(null, form({ code: await latestOtp("new.teacher@example.test") })));
    ok(await submitTeacherApplication(null, form({ fullName: "New Teacher", phone: "08011111111", qualifications: "B.Ed", specialization: "Biology", subjectsOfInterest: "Mathematics", yearsExperience: "2", photo: await pngFile() })));
    const u = await getCurrentUser();
    expect(u?.teacherId).toBeUndefined();
    expect(u?.isAdmin).toBe(false);
    const off = await db.subjectOffering.findFirstOrThrow({ where: { subject: { code: "MTH" }, class: { name: "SSS1 Science" } } });
    const term = await db.term.findFirstOrThrow({ where: { isCurrent: true } });
    expect((await saveScoreSheet(null, form({ offeringId: off.id, termId: term.id, intent: "SAVE" })))?.ok).toBe(false);
    // Approved but unassigned → no student records
    await signInAs("admin@demo.maydaycollege.test");
    const app = await db.teacherApplication.findFirstOrThrow({ where: { user: { email: "new.teacher@example.test" } } });
    ok(await approveTeacherApplication(null, form({ applicationId: app.id })));
    await signInAs("new.teacher@example.test");
    const t = await getCurrentUser();
    expect(t?.teacherId).toBeTruthy();
    expect((await teacherStudentIds(t!.teacherId!)).size).toBe(0);
    const anyStudent = await db.student.findFirstOrThrow();
    expect(await teacherCanAccessStudent(t!.teacherId!, anyStudent.id)).toBe(false);
    expect((await saveScoreSheet(null, form({ offeringId: off.id, termId: term.id, intent: "SAVE" })))?.error).toMatch(/not assigned/);
  });

  it("students and teachers cannot perform administrative actions", async () => {
    const sub = await db.paymentSubmission.findFirstOrThrow({ where: { status: "PENDING" } });
    for (const email of ["student@demo.maydaycollege.test", "teacher.math@demo.maydaycollege.test", "parent@demo.maydaycollege.test"]) {
      await signInAs(email);
      expect((await approvePayment(null, form({ submissionId: sub.id, confirmFunds: "on" })))?.ok).toBe(false);
      const cls = await db.class.findFirstOrThrow({ where: { name: "SSS1 Science" } });
      const term = await db.term.findFirstOrThrow({ where: { isCurrent: true } });
      expect((await publishClassResults(null, form({ termId: term.id, classId: cls.id })))?.ok).toBe(false);
      expect((await setUserStatus(null, form({ userId: sub.submittedById, status: "SUSPENDED", scope: "students" })))?.ok).toBe(false);
    }
  });

  it("suspended users are signed out and blocked", async () => {
    await signInAs("admin@demo.maydaycollege.test");
    const u = await db.user.findUniqueOrThrow({ where: { email: "student6@demo.maydaycollege.test" } });
    ok(await setUserStatus(null, form({ userId: u.id, status: "SUSPENDED", scope: "students" })));
    await signInAs("student6@demo.maydaycollege.test");
    expect(await getCurrentUser()).toBeNull();
    signOut();
    expect((await login(null, form({ email: "student6@demo.maydaycollege.test", password: DEMO_PASSWORD })))?.error).toMatch(/suspended/);
    await signInAs("admin@demo.maydaycollege.test");
    ok(await setUserStatus(null, form({ userId: u.id, status: "ACTIVE", scope: "students" })));
  });

  it("locks the account after repeated failed sign-ins", async () => {
    signOut();
    for (let i = 0; i < 5; i++) expect((await login(null, form({ email: "student5@demo.maydaycollege.test", password: "wrong-password" })))?.ok).toBe(false);
    expect((await login(null, form({ email: "student5@demo.maydaycollege.test", password: DEMO_PASSWORD })))?.error).toMatch(/locked/);
    await db.user.update({ where: { email: "student5@demo.maydaycollege.test" }, data: { lockedUntil: null } });
  });
});

describe("parents only access verified children", () => {
  it("accepts an invitation only with the invited, verified email", async () => {
    signOut();
    ok(await registerParent(null, form({ fullName: "New Parent", email: "new.parent@example.test", phone: "08022222222", password: PW, confirm: PW })));
    ok(await verifyEmail(null, form({ code: await latestOtp("new.parent@example.test") })));
    const inv = await db.parentInvitation.findFirstOrThrow({ where: { email: "new.parent@example.test" } });
    // Another parent cannot use this invitation
    await signInAs("parent.unlinked@demo.maydaycollege.test");
    expect((await acceptInvitation(null, form({ invitationId: inv.id })))?.error).toMatch(/different email/);
    await signInAs("new.parent@example.test");
    ok(await acceptInvitation(null, form({ invitationId: inv.id, relationship: "Mother" })));
    const me = await getCurrentUser();
    const { children } = await parentChildren(me!.parentId!);
    expect(children).toHaveLength(1);
    expect((await acceptInvitation(null, form({ invitationId: inv.id })))?.ok).toBe(false); // single use
    expect(inv.tokenHash).not.toBe(hashToken("guess"));
  });

  it("ignores an arbitrary child id for an unlinked parent", async () => {
    await signInAs("parent.unlinked@demo.maydaycollege.test");
    const me = await getCurrentUser();
    const someone = await db.student.findFirstOrThrow({ where: { user: { email: "student@demo.maydaycollege.test" } } });
    const r = await parentChildren(me!.parentId!, someone.id);
    expect(r.selected).toBeNull();
  });
});

describe("results workflow", () => {
  it("never exposes unpublished results; teachers cannot publish; published sheets are locked", async () => {
    const term = await db.term.findFirstOrThrow({ where: { isCurrent: true } });
    const student = await db.student.findFirstOrThrow({ where: { user: { email: "student@demo.maydaycollege.test" } } });
    const before = (await publishedResultsForStudent(student.id)).length;
    expect(before).toBeGreaterThan(0);
    // Second term: teacher enters and submits — still invisible to the student
    const term2 = await db.term.findFirstOrThrow({ where: { sessionId: term.sessionId, order: 2 } });
    const off = await db.subjectOffering.findFirstOrThrow({ where: { subject: { code: "MTH" }, class: { name: "SSS1 Science" } } });
    await signInAs("teacher.math@demo.maydaycollege.test");
    const roster = await db.subjectRegistrationItem.findMany({ where: { offeringId: off.id, registration: { status: "APPROVED" } }, select: { registration: { select: { studentId: true } } } });
    const fields: Record<string, string> = { offeringId: off.id, termId: term2.id, intent: "SUBMIT" };
    for (const r of roster) { fields[`ca_${r.registration.studentId}`] = "30"; fields[`exam_${r.registration.studentId}`] = "50"; }
    expect((await saveScoreSheet(null, form({ ...fields, [`ca_${roster[0].registration.studentId}`]: "45" })))?.error).toMatch(/exceed 40/);
    ok(await saveScoreSheet(null, form(fields)));
    expect((await publishedResultsForStudent(student.id)).length).toBe(before);
    expect((await publishClassResults(null, form({ termId: term2.id, classId: off.classId })))?.ok).toBe(false);
    // Published (first-term) sheet is locked for ordinary editing
    expect((await saveScoreSheet(null, form({ offeringId: off.id, termId: term.id, intent: "SAVE" })))?.error).toMatch(/submitted|no longer be edited/);
    // Approve + publish by admin → visible
    await signInAs("admin@demo.maydaycollege.test");
    const sub = await db.scoreSubmission.findUniqueOrThrow({ where: { offeringId_termId: { offeringId: off.id, termId: term2.id } } });
    ok(await reviewScores(null, form({ submissionId: sub.id, decision: "APPROVE" })));
    ok(await publishClassResults(null, form({ termId: term2.id, classId: off.classId })));
    expect((await publishedResultsForStudent(student.id)).length).toBe(before + 1);
    expect(await db.reportCard.count({ where: { studentId: student.id, termId: term2.id, status: "ACTIVE" } })).toBe(1);
  });

  it("amendments require permission, are audited and version the report card", async () => {
    const term = await db.term.findFirstOrThrow({ where: { isCurrent: true } });
    const student = await db.student.findFirstOrThrow({ where: { user: { email: "student@demo.maydaycollege.test" } } });
    const d = await db.resultDetail.findFirstOrThrow({ where: { studentId: student.id, termId: term.id, submission: { status: "PUBLISHED" } } });
    await signInAs("bursar@demo.maydaycollege.test");
    expect((await amendScore(null, form({ resultDetailId: d.id, ca: "39", exam: "59", reason: "Marking error found on script" })))?.ok).toBe(false);
    await signInAs("admin@demo.maydaycollege.test");
    expect((await amendScore(null, form({ resultDetailId: d.id, ca: "39", exam: "59", reason: "short" })))?.ok).toBe(false);
    ok(await amendScore(null, form({ resultDetailId: d.id, ca: "39", exam: "59", reason: "Marking error found on script" })));
    expect(await db.resultAmendment.count({ where: { resultDetailId: d.id } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "results.amend", entityId: d.id } })).toBe(1);
    const cards = await db.reportCard.findMany({ where: { studentId: student.id, termId: term.id }, orderBy: { version: "asc" } });
    expect(cards.length).toBeGreaterThanOrEqual(2);
    expect(cards.filter((c) => c.status === "ACTIVE")).toHaveLength(1);
  });
});

describe("payments", () => {
  it("a receipt does not confirm payment; approval requires confirmation and is idempotent under concurrency", async () => {
    await signInAs("student3@demo.maydaycollege.test");
    const me = await getCurrentUser();
    const term = await db.term.findFirstOrThrow({ where: { isCurrent: true } });
    const before = await db.studentFeeObligation.findMany({ where: { studentId: me!.studentId } });
    ok(await submitPayment(null, form({ termId: term.id, amount: "200000", paymentDate: "2026-09-25", bankReference: "TEST-REF-777", receipt: pdfFile() })));
    expect((await submitPayment(null, form({ termId: term.id, amount: "200000", paymentDate: "2026-09-25", bankReference: "test-ref-777", receipt: pdfFile() })))?.error).toMatch(/already submitted/);
    expect((await submitPayment(null, form({ termId: term.id, amount: "100", paymentDate: "2999-01-01", bankReference: "FUTURE-1", receipt: pdfFile() })))?.error).toMatch(/future/);
    const fake = new File([new TextEncoder().encode("<html>not a pdf</html>")], "receipt.pdf", { type: "application/pdf" });
    expect((await submitPayment(null, form({ termId: term.id, amount: "100", paymentDate: "2026-09-25", bankReference: "FAKE-1", receipt: fake })))?.error).toMatch(/Unsupported file type/);
    const sub = await db.paymentSubmission.findFirstOrThrow({ where: { bankReference: "TEST-REF-777" } });
    expect(sub.status).toBe("PENDING");
    const after = await db.studentFeeObligation.findMany({ where: { studentId: me!.studentId } });
    expect(after.map((o) => o.amountPaid.toString())).toEqual(before.map((o) => o.amountPaid.toString()));
    expect(await db.payment.count({ where: { submissionId: sub.id } })).toBe(0);

    await signInAs("bursar@demo.maydaycollege.test");
    expect((await approvePayment(null, form({ submissionId: sub.id })))?.error).toMatch(/confirm/);
    const admin = await getCurrentUser();
    const results = await Promise.allSettled([1, 2, 3].map(() => approvePaymentSubmission(sub.id, admin!.id, { confirmedFundsReceived: true })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.payment.count({ where: { submissionId: sub.id } })).toBe(1);
    expect(await db.financialLedger.count({ where: { payment: { submissionId: sub.id } } })).toBe(1);
    const obs = await db.studentFeeObligation.findMany({ where: { studentId: me!.studentId } });
    const paid = obs.reduce((s, o) => s.add(o.amountPaid), new Prisma.Decimal(0));
    expect(paid.toNumber()).toBe(200000);
    expect(obs.every((o) => o.status === "PAID" || o.status === "PARTIAL")).toBe(true);
    expect(await db.notificationDelivery.count({ where: { template: "payment-approved", toEmail: "student3@demo.maydaycollege.test" } })).toBe(1);
  });

  it("rejections notify the student and allow resubmission", async () => {
    await signInAs("student4@demo.maydaycollege.test");
    const term = await db.term.findFirstOrThrow({ where: { isCurrent: true } });
    ok(await submitPayment(null, form({ termId: term.id, amount: "5000", paymentDate: "2026-09-25", bankReference: "TEST-REJ-1", receipt: pdfFile() })));
    const sub = await db.paymentSubmission.findFirstOrThrow({ where: { bankReference: "TEST-REJ-1" } });
    await signInAs("bursar@demo.maydaycollege.test");
    ok(await rejectPayment(null, form({ submissionId: sub.id, reason: "No matching credit on bank statement" })));
    expect((await db.paymentSubmission.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe("REJECTED");
    await signInAs("student4@demo.maydaycollege.test");
    ok(await submitPayment(null, form({ termId: term.id, amount: "5000", paymentDate: "2026-09-25", bankReference: "TEST-REJ-1", receipt: pdfFile() })));
  });
});

describe("attendance", () => {
  it("only the class teacher can take the daily register; duplicates update instead of duplicating", async () => {
    const cls = await db.class.findFirstOrThrow({ where: { name: "SSS1 Science" } });
    const enr = await db.studentEnrollment.findMany({ where: { classId: cls.id, status: "ACTIVE" } });
    const fields: Record<string, string> = { type: "DAILY", classId: cls.id, date: "2026-09-16" };
    enr.forEach((e) => (fields[`status_${e.studentId}`] = "PRESENT"));
    await signInAs("teacher.science@demo.maydaycollege.test");
    expect((await saveAttendance(null, form(fields)))?.error).toMatch(/class teacher/);
    await signInAs("teacher.math@demo.maydaycollege.test");
    ok(await saveAttendance(null, form(fields)));
    ok(await saveAttendance(null, form({ ...fields, [`status_${enr[0].studentId}`]: "LATE" })));
    expect(await db.attendanceSession.count({ where: { key: `DAILY:${cls.id}:2026-09-16` } })).toBe(1);
    expect((await saveAttendance(null, form({ ...fields, date: "2026-09-19" })))?.error).toMatch(/not a school day/);
    expect((await saveAttendance(null, form({ ...fields, date: "2099-01-05" })))?.error).toMatch(/future/);
  });
});

describe("private files", () => {
  it("enforces ownership and relationships on every download", async () => {
    const s1 = await db.student.findFirstOrThrow({ where: { user: { email: "student@demo.maydaycollege.test" } } });
    const card = await db.reportCard.findFirstOrThrow({ where: { studentId: s1.id, status: "ACTIVE" }, include: { file: true } });
    const check = async (email: string | null) => {
      if (email) await signInAs(email); else signOut();
      return canAccessFile(await getCurrentUser(), card.file!);
    };
    expect(await check("student@demo.maydaycollege.test")).toBe(true);
    expect(await check("parent@demo.maydaycollege.test")).toBe(true);
    expect(await check("admin@demo.maydaycollege.test")).toBe(true);
    expect(await check("student2@demo.maydaycollege.test")).toBe(false);
    expect(await check("parent.unlinked@demo.maydaycollege.test")).toBe(false);
    expect(await check("teacher.unassigned@demo.maydaycollege.test")).toBe(false);
    expect(await check("bursar@demo.maydaycollege.test")).toBe(false);
    expect(await check(null)).toBe(false);
  });
});

describe("database integrity constraints", () => {
  it("allows only one current term and session", async () => {
    const t = await db.term.findFirstOrThrow({ where: { isCurrent: false } });
    await expect(db.term.update({ where: { id: t.id }, data: { isCurrent: true } })).rejects.toThrow();
  });
  it("rejects negative scores and non-positive payments at the database level", async () => {
    const d = await db.resultDetail.findFirstOrThrow();
    await expect(db.resultDetail.update({ where: { id: d.id }, data: { caScore: new Prisma.Decimal(-5) } })).rejects.toThrow();
    const s = await db.paymentSubmission.findFirstOrThrow();
    await expect(db.paymentSubmission.update({ where: { id: s.id }, data: { amount: new Prisma.Decimal(0) } })).rejects.toThrow();
  });
  it("prevents duplicate enrollment in the same session", async () => {
    const e = await db.studentEnrollment.findFirstOrThrow();
    await expect(db.studentEnrollment.create({ data: { studentId: e.studentId, classId: e.classId, sessionId: e.sessionId } })).rejects.toThrow();
  });
});

void jar;
