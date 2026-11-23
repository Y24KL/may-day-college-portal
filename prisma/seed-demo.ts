/**
 * DEMO DATA — development and automated testing ONLY.
 *
 * Refuses to run when NODE_ENV=production or against a non-local database
 * unless ALLOW_DEMO_SEED=yes is set explicitly. Never run against the school's
 * production database: demo records must not mix with real school records.
 *
 * Uses the same service functions as the application (approval, scoring,
 * publication, payment verification) so the data is realistic and consistent.
 */
import { Prisma } from "@prisma/client";
import { db } from "../src/lib/db";
import { bootstrapSystem } from "../src/lib/bootstrap";
import { hashPassword } from "../src/lib/auth/password";
import { DEFAULT_WAEC_STYLE } from "../src/lib/grading";
import { generateStudentNumber, generateStaffNumber, ensureRole } from "../src/lib/people";
import { generateObligationsForStructure, approvePaymentSubmission } from "../src/lib/finance";
import { getOrCreateSubmission, saveScores, submitScores, reviewSubmission, publishResults } from "../src/lib/results";
import { generateReportCards } from "../src/lib/pdf/reportcard";
import { makeReference } from "../src/lib/counters";

export const DEMO_PASSWORD = "DemoPass2026!";

function guard() {
  const url = process.env.DATABASE_URL ?? "";
  const local = /localhost|127\.0\.0\.1|@postgres[:/]/.test(url);
  if ((process.env.NODE_ENV === "production" || !local) && process.env.ALLOW_DEMO_SEED !== "yes") {
    console.error("Refusing to seed demo data: not a local development/test database. Set ALLOW_DEMO_SEED=yes only for a disposable database.");
    process.exit(1);
  }
}

const D = (n: number) => new Prisma.Decimal(n);
const day = (s: string) => new Date(`${s}T00:00:00Z`);

export async function seedDemo() {
  await bootstrapSystem();
  if (await db.user.findUnique({ where: { email: "admin@demo.maydaycollege.test" } })) {
    console.log("Demo data already present.");
    return;
  }
  const pw = await hashPassword(DEMO_PASSWORD);
  const role = async (key: string) => (await db.role.findUniqueOrThrow({ where: { key } })).id;

  // ── Administrators ──
  const admin = await db.user.create({ data: { email: "admin@demo.maydaycollege.test", passwordHash: pw, accountType: "ADMIN", emailVerifiedAt: new Date(), adminProfile: { create: { fullName: "Adaeze Okafor", title: "Super Administrator" } }, roles: { create: { roleId: await role("super_admin") } } } });
  await db.user.create({ data: { email: "bursar@demo.maydaycollege.test", passwordHash: pw, accountType: "ADMIN", emailVerifiedAt: new Date(), adminProfile: { create: { fullName: "Tunde Bakare", title: "Bursar" } }, roles: { create: { roleId: await role("finance_officer") } } } });

  // ── School settings ──
  await db.schoolSettings.update({ where: { id: "school" }, data: { motto: "Knowledge, Discipline, Service (demo)", phone: "+234 800 000 0000", email: "info@demo.maydaycollege.test", principalName: "Mrs. F. Adeyemi (demo)", bankName: "Demo Bank Plc", bankAccountName: "May Day College (Demo)", bankAccountNumber: "0123456789", transferInstructions: "DEMO ONLY — do not transfer real money.", paymentReferenceInstructions: "Use the student ID as the transfer narration." } });

  // ── Structure ──
  const levels = await Promise.all(["SSS1", "SSS2", "SSS3"].map((name, i) => db.classLevel.create({ data: { name, order: i + 1 } })));
  const sectors = await Promise.all([["Science", "SCI"], ["Commercial", "COM"], ["Arts", "ART"]].map(([name, code]) => db.academicSector.create({ data: { name, code } })));
  const classes: Awaited<ReturnType<typeof db.class.create>>[] = [];
  for (const l of levels) for (const s of sectors) classes.push(await db.class.create({ data: { levelId: l.id, sectorId: s.id, name: `${l.name} ${s.name}` } }));
  const sss1Sci = classes.find((c) => c.name === "SSS1 Science")!;
  const sss1Com = classes.find((c) => c.name === "SSS1 Commercial")!;

  const session = await db.academicSession.create({ data: { name: "2026/2027", startDate: day("2026-09-07"), endDate: day("2027-07-23"), status: "ACTIVE", isCurrent: true } });
  const t1 = await db.term.create({ data: { sessionId: session.id, name: "First Term", order: 1, startDate: day("2026-09-07"), endDate: day("2026-12-18"), nextResumptionDate: day("2027-01-11"), isCurrent: true } });
  await db.term.create({ data: { sessionId: session.id, name: "Second Term", order: 2, startDate: day("2027-01-11"), endDate: day("2027-04-09") } });
  await db.term.create({ data: { sessionId: session.id, name: "Third Term", order: 3, startDate: day("2027-04-26"), endDate: day("2027-07-23") } });

  const gs = await db.gradingSystem.create({ data: { name: "WAEC-style (demo)", isDefault: true, boundaries: { create: DEFAULT_WAEC_STYLE.map((b) => ({ ...b, minScore: D(b.minScore), maxScore: D(b.maxScore) })) } } });
  await db.scoreConfiguration.create({ data: { sessionId: session.id, gradingSystemId: gs.id, caMax: 40, examMax: 60 } });

  const subj = async (name: string, code: string) => db.subject.create({ data: { name, code } });
  const S = {
    mth: await subj("Mathematics", "MTH"), eng: await subj("English Language", "ENG"), phy: await subj("Physics", "PHY"), chm: await subj("Chemistry", "CHM"),
    bio: await subj("Biology", "BIO"), fmt: await subj("Further Mathematics", "FMT"), cmp: await subj("Computer Studies", "CMP"), acc: await subj("Financial Accounting", "ACC"),
    com: await subj("Commerce", "COM"), eco: await subj("Economics", "ECO"),
  };
  const offer = (subjectId: string, classId: string, isCompulsory: boolean) => db.subjectOffering.create({ data: { subjectId, classId, sessionId: session.id, isCompulsory } });
  const o = {
    mth: await offer(S.mth.id, sss1Sci.id, true), eng: await offer(S.eng.id, sss1Sci.id, true), phy: await offer(S.phy.id, sss1Sci.id, true), chm: await offer(S.chm.id, sss1Sci.id, true),
    bio: await offer(S.bio.id, sss1Sci.id, false), fmt: await offer(S.fmt.id, sss1Sci.id, false), cmp: await offer(S.cmp.id, sss1Sci.id, false),
  };
  await offer(S.mth.id, sss1Com.id, true); await offer(S.eng.id, sss1Com.id, true); await offer(S.acc.id, sss1Com.id, true); await offer(S.com.id, sss1Com.id, false); await offer(S.eco.id, sss1Com.id, false);
  await db.subjectRegistrationConfig.create({ data: { sessionId: session.id, classId: sss1Sci.id, minElectives: 1, maxElectives: 2, isOpen: true } });
  await db.subjectRegistrationConfig.create({ data: { sessionId: session.id, classId: sss1Com.id, minElectives: 1, maxElectives: 2, isOpen: true } });

  // ── Teachers (approved + assigned) ──
  const settings = await db.schoolSettings.findUniqueOrThrow({ where: { id: "school" } });
  const mkTeacher = async (email: string, fullName: string, specialization: string) => {
    const u = await db.user.create({ data: { email, passwordHash: pw, accountType: "TEACHER", emailVerifiedAt: new Date(), teacherApplication: { create: { reference: makeReference("TCH"), fullName, specialization, status: "APPROVED", submittedAt: new Date(), reviewedAt: new Date(), reviewedById: admin.id, qualifications: "B.Sc. (Ed) — demo", yearsExperience: 6 } } } });
    const t = await db.$transaction(async (tx) => {
      const staffNumber = await generateStaffNumber(tx, settings.staffIdPrefix);
      const teacher = await tx.teacher.create({ data: { userId: u.id, staffNumber, fullName, specialization, yearsExperience: 6 } });
      await ensureRole(tx, u.id, "teacher", admin.id);
      return teacher;
    });
    return { user: u, teacher: t };
  };
  const tMath = await mkTeacher("teacher.math@demo.maydaycollege.test", "Chinedu Eze", "Mathematics");
  const tSci = await mkTeacher("teacher.science@demo.maydaycollege.test", "Halima Bello", "Physical Sciences");
  const assign = (teacherId: string, offeringId: string) => db.teacherAssignment.create({ data: { teacherId, offeringId, assignedById: admin.id } });
  await assign(tMath.teacher.id, o.mth.id); await assign(tMath.teacher.id, o.fmt.id); await assign(tSci.teacher.id, o.phy.id); await assign(tSci.teacher.id, o.chm.id); await assign(tSci.teacher.id, o.bio.id); await assign(tMath.teacher.id, o.eng.id); await assign(tSci.teacher.id, o.cmp.id);
  await db.classTeacherAssignment.create({ data: { classId: sss1Sci.id, sessionId: session.id, teacherId: tMath.teacher.id } });
  // Approved but UNASSIGNED teacher (for permission tests)
  await mkTeacher("teacher.unassigned@demo.maydaycollege.test", "Ifeoma Nwosu", "Literature");

  // ── Fees ──
  const tuition = await db.feeCategory.create({ data: { name: "Tuition" } });
  const levy = await db.feeCategory.create({ data: { name: "Development levy" } });

  // ── Students (approved + enrolled + registered) ──
  const names = ["Adebayo Tolulope", "Okonkwo Chiamaka", "Ibrahim Musa", "Eze Kelechi", "Balogun Aisha", "Nnamdi Obinna"];
  const students: Awaited<ReturnType<typeof db.student.create>>[] = [];
  for (const [i, fullName] of names.entries()) {
    const email = i === 0 ? "student@demo.maydaycollege.test" : `student${i + 1}@demo.maydaycollege.test`;
    const u = await db.user.create({ data: { email, passwordHash: pw, accountType: "STUDENT", emailVerifiedAt: new Date() } });
    const st = await db.$transaction(async (tx) => {
      await tx.studentApplication.create({ data: { reference: makeReference("STU"), userId: u.id, guardianEmail: i === 0 ? "parent@demo.maydaycollege.test" : `parent${i + 1}@demo.maydaycollege.test`, status: "APPROVED", fullName, gender: i % 2 ? "FEMALE" : "MALE", dateOfBirth: day(`2011-0${(i % 9) + 1}-1${i}`), address: "Ikeja, Lagos (demo)", guardianName: "Demo Guardian", guardianPhone: "+234 800 000 0001", requestedClassId: sss1Sci.id, sessionId: session.id, submittedAt: new Date(), reviewedAt: new Date(), reviewedById: admin.id } });
      const studentNumber = await generateStudentNumber(tx, settings.studentIdPrefix);
      const s = await tx.student.create({ data: { userId: u.id, studentNumber, fullName, gender: i % 2 ? "FEMALE" : "MALE", dateOfBirth: day(`2011-0${(i % 9) + 1}-1${i}`), address: "Ikeja, Lagos (demo)", guardianName: "Demo Guardian", guardianEmail: i === 0 ? "parent@demo.maydaycollege.test" : `parent${i + 1}@demo.maydaycollege.test`, guardianPhone: "+234 800 000 0001" } });
      const enr = await tx.studentEnrollment.create({ data: { studentId: s.id, classId: sss1Sci.id, sessionId: session.id } });
      await ensureRole(tx, u.id, "student", admin.id);
      const electives = i % 2 ? [o.bio.id] : [o.fmt.id, o.cmp.id];
      await tx.subjectRegistration.create({ data: { reference: makeReference("REG"), studentId: s.id, enrollmentId: enr.id, sessionId: session.id, status: "APPROVED", reviewedAt: new Date(), items: { create: [o.mth.id, o.eng.id, o.phy.id, o.chm.id, ...electives].map((offeringId) => ({ offeringId })) } } });
      return s;
    });
    students.push(st);
  }
  for (const [catId, amount, due] of [[tuition.id, 185000, "2026-10-15"], [levy.id, 25000, "2026-10-15"]] as const) {
    const fs = await db.feeStructure.create({ data: { sessionId: session.id, termId: t1.id, classId: sss1Sci.id, categoryId: catId, amount: D(amount), dueDate: day(due) } });
    await db.$transaction((tx) => generateObligationsForStructure(fs.id, admin.id, tx));
  }

  // A pending student registration (for approval tests)
  await db.user.create({ data: { email: "applicant@demo.maydaycollege.test", passwordHash: pw, accountType: "STUDENT", emailVerifiedAt: new Date(), studentApplication: { create: { reference: makeReference("STU"), guardianEmail: "applicant.parent@demo.maydaycollege.test", status: "PENDING_APPROVAL", fullName: "Pending Applicant Demo", gender: "MALE", dateOfBirth: day("2011-05-05"), address: "Yaba, Lagos (demo)", guardianName: "Applicant Parent", guardianPhone: "+234 800 000 0002", requestedClassId: sss1Com.id, sessionId: session.id, submittedAt: new Date() } } } });
  // A pending teacher application
  await db.user.create({ data: { email: "teacher.applicant@demo.maydaycollege.test", passwordHash: pw, accountType: "TEACHER", emailVerifiedAt: new Date(), teacherApplication: { create: { reference: makeReference("TCH"), fullName: "Teacher Applicant Demo", status: "PENDING_APPROVAL", specialization: "Economics", qualifications: "B.Sc Economics (demo)", subjectsOfInterest: "Economics, Commerce", yearsExperience: 3, submittedAt: new Date() } } } });

  // ── Parent linked to first student ──
  const pu = await db.user.create({ data: { email: "parent@demo.maydaycollege.test", passwordHash: pw, accountType: "PARENT", emailVerifiedAt: new Date(), parent: { create: { fullName: "Mrs. Folake Adebayo", phone: "+234 800 000 0003" } } }, include: { parent: true } });
  await db.$transaction((tx) => ensureRole(tx, pu.id, "parent"));
  await db.parentStudentRelationship.create({ data: { parentId: pu.parent!.id, studentId: students[0].id, relationship: "Mother", status: "VERIFIED", method: "INVITATION", verifiedAt: new Date() } });
  // An unlinked parent (for permission tests)
  const pu2 = await db.user.create({ data: { email: "parent.unlinked@demo.maydaycollege.test", passwordHash: pw, accountType: "PARENT", emailVerifiedAt: new Date(), parent: { create: { fullName: "Unlinked Parent Demo", phone: "+234 800 000 0004" } } } });
  await db.$transaction((tx) => ensureRole(tx, pu2.id, "parent"));

  // ── Attendance (daily registers, first weeks of term) ──
  const dates = ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-14", "2026-09-15"];
  for (const d of dates) {
    const sess = await db.attendanceSession.create({ data: { key: `DAILY:${sss1Sci.id}:${d}`, type: "DAILY", classId: sss1Sci.id, termId: t1.id, date: day(d), takenById: tMath.teacher.id } });
    await db.attendanceRecord.createMany({ data: students.map((s, i) => ({ sessionId: sess.id, studentId: s.id, status: i === 5 && d >= "2026-09-10" ? "ABSENT" : i === 2 && d === "2026-09-08" ? "LATE" : "PRESENT" })) });
  }

  // ── Scores → submit → approve → publish (real workflow) ──
  const base = [[34, 52], [28, 41], [36, 55], [22, 30], [31, 48], [18, 25]];
  const offerings = [o.mth, o.eng, o.phy, o.chm, o.bio, o.fmt, o.cmp];
  for (const [k, off] of offerings.entries()) {
    const sub = await getOrCreateSubmission(off.id, t1.id);
    const reg = await db.subjectRegistrationItem.findMany({ where: { offeringId: off.id }, select: { registration: { select: { studentId: true } } } });
    const ids = reg.map((r) => r.registration.studentId);
    const rows = ids.map((sid) => {
      const i = students.findIndex((s) => s.id === sid);
      return { studentId: sid, ca: Math.min(40, base[i][0] + (k % 3)), exam: Math.min(60, base[i][1] + (k % 4)), remark: base[i][1] > 45 ? "Good effort" : "Needs more practice" };
    });
    await saveScores({ submissionId: sub.id, teacherUserId: admin.id, rows, allowedStudentIds: new Set(ids) });
    await submitScores(sub.id, admin.id, ids);
    await reviewSubmission(sub.id, admin.id, "APPROVE");
  }
  const resultIds = await publishResults({ termId: t1.id, classId: sss1Sci.id, actorId: admin.id });
  await generateReportCards(resultIds);

  // ── Payments: one verified, one pending ──
  const s0 = students[0];
  const sub1 = await db.paymentSubmission.create({ data: { reference: makeReference("MDC-PAY"), studentId: s0.id, submittedById: s0.userId, termId: t1.id, amount: D(150000), paymentDate: day("2026-09-20"), bankReference: "DEMO-TRF-0001", description: "Part payment (demo)" } });
  await approvePaymentSubmission(sub1.id, admin.id, { confirmedFundsReceived: true });
  await db.paymentSubmission.create({ data: { reference: makeReference("MDC-PAY"), studentId: students[1].id, submittedById: students[1].userId, termId: t1.id, amount: D(210000), paymentDate: day("2026-09-22"), bankReference: "DEMO-TRF-0002", description: "Full payment (demo)" } });

  // ── Timetable ──
  const periodDefs = [["Period 1", "08:00", "08:40"], ["Period 2", "08:40", "09:20"], ["Period 3", "09:20", "10:00"], ["Break", "10:00", "10:30"], ["Period 4", "10:30", "11:10"], ["Period 5", "11:10", "11:50"]];
  const periods: Awaited<ReturnType<typeof db.periodDefinition.create>>[] = [];
  for (const [i, [name, startTime, endTime]] of periodDefs.entries()) periods.push(await db.periodDefinition.create({ data: { name, startTime, endTime, order: i + 1, isBreak: name === "Break" } }));
  const room = await db.classroom.create({ data: { name: "Lab A (demo)", capacity: 40 } });
  const tt = await db.timetable.create({ data: { classId: sss1Sci.id, sessionId: session.id, termId: t1.id, status: "PUBLISHED", publishedAt: new Date() } });
  const lesson = [[o.mth, tMath], [o.eng, tMath], [o.phy, tSci], [o.chm, tSci], [o.bio, tSci]] as const;
  for (let d = 1; d <= 5; d++) {
    for (const [pi, p] of periods.filter((x) => !x.isBreak).entries()) {
      const [off, t] = lesson[(pi + d) % lesson.length];
      await db.timetablePeriod.create({ data: { timetableId: tt.id, dayOfWeek: d, periodId: p.id, offeringId: off.id, teacherId: t.teacher.id, classroomId: pi === 2 ? room.id : null } });
    }
  }

  // ── Announcement ──
  await db.announcement.create({ data: { title: "Welcome to the 2026/2027 session (demo)", body: "This is demonstration content for the development environment.", category: "General Announcements", status: "PUBLISHED", isPinned: true, notifiedAt: new Date(), createdById: admin.id, audiences: { create: [{ type: "EVERYONE" }] } } });
  await db.announcement.create({ data: { title: "First term examinations timetable (demo)", body: "Examinations begin in December. Details to follow.", category: "Examination Information", priority: "HIGH", status: "PUBLISHED", notifiedAt: new Date(), createdById: admin.id, audiences: { create: [{ type: "ALL_STUDENTS" }, { type: "PARENTS" }] } } });

  console.log(`✔ Demo data created. All demo accounts use the password: ${DEMO_PASSWORD}`);
}

if (require.main === module) {
  guard();
  seedDemo()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => db.$disconnect());
}
