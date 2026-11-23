"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { run, type ActionState } from "@/lib/action";
import { authorizeAdmin } from "@/lib/auth/guards";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { kickEmailWorker } from "@/lib/email/worker";
import { generateStudentNumber, generateStaffNumber, inviteParent, ensureRole } from "@/lib/people";
import { generateObligationsForEnrollment } from "@/lib/finance";
import { revokeAllSessions } from "@/lib/auth/session";
import { hashPassword, passwordProblems } from "@/lib/auth/password";
import { makeReference } from "@/lib/counters";
import { saveUpload } from "@/lib/storage/files";
import { parseDateOnly } from "@/lib/utils";
import { revalidatePath } from "next/cache";

const id = z.string().min(1);

/* ───────────────────────── Student applications ───────────────────────── */

export async function approveStudentApplication(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("students.manage");
    const d = z.object({ applicationId: id, classId: id, sessionId: id }).parse(Object.fromEntries(fd));
    const student = await db.$transaction(async (tx) => {
      const claimed = await tx.studentApplication.updateMany({
        where: { id: d.applicationId, status: "PENDING_APPROVAL" },
        data: { status: "APPROVED", reviewedById: admin.id, reviewedAt: new Date(), requestedClassId: d.classId, sessionId: d.sessionId },
      });
      if (!claimed.count) throw new Error("This application is not pending approval (it may already have been processed).");
      const app = await tx.studentApplication.findUniqueOrThrow({ where: { id: d.applicationId }, include: { user: true } });
      if (!app.user.emailVerifiedAt) throw new Error("The applicant has not verified their email.");
      const [cls, session, settings] = await Promise.all([
        tx.class.findUniqueOrThrow({ where: { id: d.classId } }),
        tx.academicSession.findUniqueOrThrow({ where: { id: d.sessionId } }),
        tx.schoolSettings.findUniqueOrThrow({ where: { id: "school" } }),
      ]);
      const studentNumber = await generateStudentNumber(tx, settings.studentIdPrefix);
      const s = await tx.student.create({
        data: {
          userId: app.userId, studentNumber, fullName: app.fullName!, dateOfBirth: app.dateOfBirth, gender: app.gender, address: app.address,
          photoFileId: app.photoFileId, guardianName: app.guardianName, guardianEmail: app.guardianEmail, guardianPhone: app.guardianPhone,
        },
      });
      if (app.photoFileId) await tx.uploadedDocument.update({ where: { id: app.photoFileId }, data: { studentId: s.id } });
      const enr = await tx.studentEnrollment.create({ data: { studentId: s.id, classId: cls.id, sessionId: session.id } });
      await generateObligationsForEnrollment(enr.id, admin.id, tx);
      await ensureRole(tx, app.userId, "student", admin.id);
      await inviteParent(tx, { studentId: s.id, email: app.guardianEmail, studentName: s.fullName, schoolName: settings.schoolName });
      await audit({ actorId: admin.id, action: "student.approve", entityType: "StudentApplication", entityId: app.id, sensitive: true, details: { studentId: s.id, studentNumber, classId: cls.id } }, tx);
      await notify(
        {
          userIds: [app.userId],
          category: "REGISTRATION",
          title: "Your registration has been approved",
          body: `Welcome to ${settings.schoolName}! Your student ID is ${studentNumber} (${cls.name}, ${session.name}).`,
          link: "/student",
          email: { template: "student-approved", priority: "HIGH", content: { rows: [["Student ID", studentNumber], ["Class", cls.name], ["Session", session.name]] } },
        },
        tx,
      );
      return s;
    });
    await kickEmailWorker();
    revalidatePath("/admin/students");
    return { ok: true, message: `Approved. Student ID ${student.studentNumber} issued.`, redirect: `/admin/students/${student.id}` };
  });
}

export async function decideStudentApplication(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("students.manage");
    const d = z.object({ applicationId: id, decision: z.enum(["REJECT", "REQUEST_INFO"]), message: z.string().trim().min(5, "Please explain your decision to the applicant.").max(2000) }).parse(Object.fromEntries(fd));
    await db.$transaction(async (tx) => {
      const claimed = await tx.studentApplication.updateMany({
        where: { id: d.applicationId, status: "PENDING_APPROVAL" },
        data:
          d.decision === "REJECT"
            ? { status: "REJECTED", decisionReason: d.message, reviewedById: admin.id, reviewedAt: new Date() }
            : { status: "INFORMATION_REQUIRED", correctionRequest: d.message, reviewedById: admin.id, reviewedAt: new Date() },
      });
      if (!claimed.count) throw new Error("This application is not pending approval.");
      const app = await tx.studentApplication.findUniqueOrThrow({ where: { id: d.applicationId } });
      await audit({ actorId: admin.id, action: d.decision === "REJECT" ? "student.reject" : "student.request_info", entityType: "StudentApplication", entityId: app.id, sensitive: true, details: { message: d.message } }, tx);
      await notify(
        {
          userIds: [app.userId],
          category: "REGISTRATION",
          title: d.decision === "REJECT" ? "Registration not approved" : "Corrections needed on your registration",
          body: d.message,
          link: "/application",
          email: { template: d.decision === "REJECT" ? "student-rejected" : "student-info-required", priority: "HIGH" },
        },
        tx,
      );
    });
    await kickEmailWorker();
    return { ok: true, message: d.decision === "REJECT" ? "Application rejected." : "Correction request sent.", redirect: "/admin/students/applications" };
  });
}

export async function addApplicationNote(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const d = z.object({ kind: z.enum(["student", "teacher"]), applicationId: id, body: z.string().trim().min(2).max(2000) }).parse(Object.fromEntries(fd));
    const admin = await authorizeAdmin(d.kind === "student" ? "students.manage" : "teachers.manage");
    await db.adminNote.create({ data: { authorId: admin.id, body: d.body, ...(d.kind === "student" ? { studentApplicationId: d.applicationId } : { teacherApplicationId: d.applicationId }) } });
    return { ok: true, message: "Note added." };
  });
}

/* ───────────────────────── Students ───────────────────────── */

export async function createStudentManually(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("students.manage");
    const d = z
      .object({
        email: z.string().trim().toLowerCase().email(),
        fullName: z.string().trim().min(3),
        dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        gender: z.enum(["MALE", "FEMALE"]),
        address: z.string().trim().min(3),
        guardianName: z.string().trim().min(3),
        guardianEmail: z.string().trim().toLowerCase().email(),
        guardianPhone: z.string().trim().min(7),
        classId: id,
        sessionId: id,
        tempPassword: z.string(),
      })
      .parse(Object.fromEntries(fd));
    const problems = passwordProblems(d.tempPassword, 10, d.email);
    if (problems.length) throw new Error(`Temporary password: ${problems.join(" ")}`);
    if (await db.user.findUnique({ where: { email: d.email } })) throw new Error("An account with this email already exists.");
    const passwordHash = await hashPassword(d.tempPassword);
    const photo = fd.get("photo");
    const s = await db.$transaction(async (tx) => {
      const settings = await tx.schoolSettings.findUniqueOrThrow({ where: { id: "school" } });
      const user = await tx.user.create({ data: { email: d.email, passwordHash, accountType: "STUDENT", emailVerifiedAt: new Date() } });
      await tx.studentApplication.create({
        data: {
          reference: makeReference("STU"), userId: user.id, guardianEmail: d.guardianEmail, status: "APPROVED", fullName: d.fullName, dateOfBirth: parseDateOnly(d.dateOfBirth),
          gender: d.gender, address: d.address, guardianName: d.guardianName, guardianPhone: d.guardianPhone, requestedClassId: d.classId, sessionId: d.sessionId,
          submittedAt: new Date(), reviewedAt: new Date(), reviewedById: admin.id, decisionReason: "Registered manually by administrator",
        },
      });
      const studentNumber = await generateStudentNumber(tx, settings.studentIdPrefix);
      const st = await tx.student.create({
        data: { userId: user.id, studentNumber, fullName: d.fullName, dateOfBirth: parseDateOnly(d.dateOfBirth), gender: d.gender, address: d.address, guardianName: d.guardianName, guardianEmail: d.guardianEmail, guardianPhone: d.guardianPhone },
      });
      const enr = await tx.studentEnrollment.create({ data: { studentId: st.id, classId: d.classId, sessionId: d.sessionId } });
      await generateObligationsForEnrollment(enr.id, admin.id, tx);
      await ensureRole(tx, user.id, "student", admin.id);
      await inviteParent(tx, { studentId: st.id, email: d.guardianEmail, studentName: st.fullName, schoolName: settings.schoolName });
      await audit({ actorId: admin.id, action: "student.create_manual", entityType: "Student", entityId: st.id, sensitive: true }, tx);
      return st;
    });
    if (photo instanceof File && photo.size > 0) {
      const doc = await saveUpload({ file: photo, purpose: "STUDENT_PHOTO", uploadedById: admin.id, studentId: s.id });
      await db.student.update({ where: { id: s.id }, data: { photoFileId: doc.id } });
    }
    await kickEmailWorker();
    return { ok: true, message: `Student created with ID ${s.studentNumber}. Share the temporary password securely and ask them to change it.`, redirect: `/admin/students/${s.id}` };
  });
}

export async function updateStudentRecord(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("students.manage");
    const d = z
      .object({
        studentId: id, fullName: z.string().trim().min(3), dateOfBirth: z.string().optional(), gender: z.enum(["MALE", "FEMALE", ""]).optional(),
        address: z.string().trim().optional(), phone: z.string().trim().optional(), guardianName: z.string().trim().optional(), guardianPhone: z.string().trim().optional(),
      })
      .parse(Object.fromEntries(fd));
    const before = await db.student.findUniqueOrThrow({ where: { id: d.studentId } });
    await db.student.update({
      where: { id: d.studentId },
      data: { fullName: d.fullName, dateOfBirth: d.dateOfBirth ? parseDateOnly(d.dateOfBirth) : before.dateOfBirth, gender: d.gender || null, address: d.address || null, phone: d.phone || null, guardianName: d.guardianName || null, guardianPhone: d.guardianPhone || null },
    });
    await audit({ actorId: admin.id, action: "student.update", entityType: "Student", entityId: d.studentId, sensitive: true, details: { before: { fullName: before.fullName } } });
    return { ok: true, message: "Student record updated." };
  });
}

/** Change class/sector within the CURRENT enrollment (authorised correction). */
export async function changeStudentClass(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("students.manage");
    const d = z.object({ enrollmentId: id, classId: id, reason: z.string().trim().min(5, "Give a reason for the change.") }).parse(Object.fromEntries(fd));
    await db.$transaction(async (tx) => {
      const e = await tx.studentEnrollment.findUniqueOrThrow({ where: { id: d.enrollmentId }, include: { subjectRegistration: true } });
      if (e.status !== "ACTIVE") throw new Error("Only an active enrollment can be changed.");
      if (e.subjectRegistration) throw new Error("This student has registered subjects for the session. Reject/clear the subject registration first, then change the class.");
      const hasScores = await tx.resultDetail.count({ where: { studentId: e.studentId, submission: { offering: { classId: e.classId, sessionId: e.sessionId } } } });
      if (hasScores) throw new Error("Scores already exist for this student in the current class. Class changes after scoring must be handled by the academic office.");
      await tx.studentEnrollment.update({ where: { id: e.id }, data: { classId: d.classId } });
      // Re-price fees: remove unpaid obligations of the old class and generate new ones.
      const obs = await tx.studentFeeObligation.findMany({ where: { enrollmentId: e.id }, include: { allocations: true, feeStructure: { include: { category: true } } } });
      for (const o of obs) {
        if (o.allocations.length || o.amountPaid.greaterThan(0)) continue;
        await tx.financialLedger.create({ data: { studentId: e.studentId, entryType: "ADJUSTMENT", credit: o.amount, obligationId: o.id, description: `Class change: ${o.feeStructure.category.name} reversed`, createdById: admin.id } });
        await tx.studentFeeObligation.update({ where: { id: o.id }, data: { status: "WAIVED", amountAdjusted: o.amount } });
      }
      await generateObligationsForEnrollment(e.id, admin.id, tx);
      await audit({ actorId: admin.id, action: "student.change_class", entityType: "StudentEnrollment", entityId: e.id, sensitive: true, details: { from: e.classId, to: d.classId, reason: d.reason } }, tx);
    });
    return { ok: true, message: "Class updated." };
  });
}

export async function setUserStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const d = z.object({ userId: id, status: z.enum(["ACTIVE", "SUSPENDED"]), scope: z.enum(["students", "teachers", "parents", "admins"]), reason: z.string().trim().max(500).optional() }).parse(Object.fromEntries(fd));
    const perm = d.scope === "students" ? "students.manage" : d.scope === "teachers" ? "teachers.manage" : d.scope === "parents" ? "parents.manage" : "users.permissions";
    const admin = await authorizeAdmin(perm);
    if (d.userId === admin.id) throw new Error("You cannot change the status of your own account.");
    const target = await db.user.findUniqueOrThrow({ where: { id: d.userId }, include: { roles: { include: { role: true } } } });
    const expected = { students: "STUDENT", teachers: "TEACHER", parents: "PARENT", admins: "ADMIN" }[d.scope];
    if (target.accountType !== expected && !(d.scope === "admins" && target.roles.some((r) => r.role.kind === "ADMIN"))) throw new Error("Account type mismatch.");
    if (target.roles.some((r) => r.role.key === "super_admin") && !admin.roleKeys.includes("super_admin")) throw new Error("Only a Super Administrator can change another Super Administrator.");
    await db.user.update({ where: { id: d.userId }, data: { status: d.status } });
    if (d.status === "SUSPENDED") await revokeAllSessions(d.userId);
    await audit({ actorId: admin.id, action: d.status === "SUSPENDED" ? "user.suspend" : "user.activate", entityType: "User", entityId: d.userId, sensitive: true, details: { reason: d.reason ?? null } });
    return { ok: true, message: d.status === "SUSPENDED" ? "Account suspended and signed out everywhere." : "Account activated." };
  });
}

export async function resendParentInvitation(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("parents.manage");
    const d = z.object({ studentId: id, email: z.string().trim().toLowerCase().email() }).parse(Object.fromEntries(fd));
    await db.$transaction(async (tx) => {
      const s = await tx.student.findUniqueOrThrow({ where: { id: d.studentId } });
      const settings = await tx.schoolSettings.findUniqueOrThrow({ where: { id: "school" } });
      await inviteParent(tx, { studentId: s.id, email: d.email, studentName: s.fullName, schoolName: settings.schoolName });
      if (!s.guardianEmail) await tx.student.update({ where: { id: s.id }, data: { guardianEmail: d.email } });
      await audit({ actorId: admin.id, action: "parent.invite", entityType: "Student", entityId: s.id, details: { email: d.email } }, tx);
    });
    await kickEmailWorker();
    return { ok: true, message: `Invitation sent to ${d.email}.` };
  });
}

/* ───────────────────────── Promotion ───────────────────────── */

export async function promoteStudents(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("students.promote");
    const d = z.object({ fromSessionId: id, toSessionId: id, fromClassId: id, toClassId: z.string(), action: z.enum(["PROMOTE", "REPEAT", "GRADUATE"]) }).parse(Object.fromEntries(fd));
    const studentIds = fd.getAll("studentIds").map(String).filter(Boolean);
    if (!studentIds.length) throw new Error("Select at least one student.");
    if (d.fromSessionId === d.toSessionId && d.action !== "GRADUATE") throw new Error("Choose a different target session.");
    const n = await db.$transaction(async (tx) => {
      let count = 0;
      for (const sid of studentIds) {
        const e = await tx.studentEnrollment.findUnique({ where: { studentId_sessionId: { studentId: sid, sessionId: d.fromSessionId } } });
        if (!e || e.classId !== d.fromClassId || e.status !== "ACTIVE") continue;
        if (d.action === "GRADUATE") {
          await tx.studentEnrollment.update({ where: { id: e.id }, data: { status: "GRADUATED", closedAt: new Date() } });
          await tx.student.update({ where: { id: sid }, data: { status: "GRADUATED" } });
        } else {
          const toClass = d.action === "REPEAT" ? d.fromClassId : d.toClassId;
          if (!toClass) throw new Error("Choose the destination class.");
          const exists = await tx.studentEnrollment.findUnique({ where: { studentId_sessionId: { studentId: sid, sessionId: d.toSessionId } } });
          if (exists) continue;
          await tx.studentEnrollment.update({ where: { id: e.id }, data: { status: d.action === "REPEAT" ? "REPEATED" : "PROMOTED", closedAt: new Date() } });
          const ne = await tx.studentEnrollment.create({ data: { studentId: sid, classId: toClass, sessionId: d.toSessionId } });
          await generateObligationsForEnrollment(ne.id, admin.id, tx);
        }
        count++;
      }
      await audit({ actorId: admin.id, action: `student.${d.action.toLowerCase()}`, entityType: "Class", entityId: d.fromClassId, sensitive: true, details: { count, toSessionId: d.toSessionId, toClassId: d.toClassId } }, tx);
      return count;
    }, { timeout: 60_000 });
    return { ok: true, message: `${n} student(s) processed. Previous records are preserved.` };
  });
}

/* ───────────────────────── Teachers ───────────────────────── */

export async function approveTeacherApplication(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("teachers.manage");
    const d = z.object({ applicationId: id }).parse(Object.fromEntries(fd));
    const t = await db.$transaction(async (tx) => {
      const claimed = await tx.teacherApplication.updateMany({ where: { id: d.applicationId, status: "PENDING_APPROVAL" }, data: { status: "APPROVED", reviewedById: admin.id, reviewedAt: new Date() } });
      if (!claimed.count) throw new Error("This application is not pending approval.");
      const app = await tx.teacherApplication.findUniqueOrThrow({ where: { id: d.applicationId }, include: { user: true } });
      if (!app.user.emailVerifiedAt) throw new Error("The applicant has not verified their email.");
      const settings = await tx.schoolSettings.findUniqueOrThrow({ where: { id: "school" } });
      const staffNumber = await generateStaffNumber(tx, settings.staffIdPrefix);
      const teacher = await tx.teacher.create({
        data: { userId: app.userId, staffNumber, fullName: app.fullName, phone: app.phone, gender: app.gender, address: app.address, qualifications: app.qualifications, specialization: app.specialization, yearsExperience: app.yearsExperience, photoFileId: app.photoFileId },
      });
      await ensureRole(tx, app.userId, "teacher", admin.id);
      await audit({ actorId: admin.id, action: "teacher.approve", entityType: "TeacherApplication", entityId: app.id, sensitive: true, details: { teacherId: teacher.id, staffNumber } }, tx);
      await notify(
        { userIds: [app.userId], category: "REGISTRATION", title: "Your teacher account has been approved", body: `Your staff number is ${staffNumber}. The academic office will assign your subjects and classes.`, link: "/teacher", email: { template: "teacher-approved", priority: "HIGH", content: { rows: [["Staff number", staffNumber]] } } },
        tx,
      );
      return teacher;
    });
    await kickEmailWorker();
    return { ok: true, message: `Teacher approved (${t.staffNumber}). Now assign subjects and classes.`, redirect: `/admin/teachers/${t.id}` };
  });
}

export async function decideTeacherApplication(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("teachers.manage");
    const d = z.object({ applicationId: id, decision: z.enum(["REJECT", "REQUEST_INFO"]), message: z.string().trim().min(5, "Please explain your decision.").max(2000) }).parse(Object.fromEntries(fd));
    await db.$transaction(async (tx) => {
      const claimed = await tx.teacherApplication.updateMany({
        where: { id: d.applicationId, status: "PENDING_APPROVAL" },
        data: d.decision === "REJECT" ? { status: "REJECTED", decisionReason: d.message, reviewedById: admin.id, reviewedAt: new Date() } : { status: "INFORMATION_REQUIRED", correctionRequest: d.message, reviewedById: admin.id, reviewedAt: new Date() },
      });
      if (!claimed.count) throw new Error("This application is not pending approval.");
      const app = await tx.teacherApplication.findUniqueOrThrow({ where: { id: d.applicationId } });
      await audit({ actorId: admin.id, action: d.decision === "REJECT" ? "teacher.reject" : "teacher.request_info", entityType: "TeacherApplication", entityId: app.id, sensitive: true, details: { message: d.message } }, tx);
      await notify({ userIds: [app.userId], category: "REGISTRATION", title: d.decision === "REJECT" ? "Teacher application not approved" : "Additional information requested", body: d.message, link: "/application", email: { template: "teacher-decision", priority: "HIGH" } }, tx);
    });
    await kickEmailWorker();
    return { ok: true, message: "Decision recorded.", redirect: "/admin/teachers/applications" };
  });
}

export async function assignTeacherToOffering(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("teachers.assign");
    const d = z.object({ teacherId: id, offeringId: id }).parse(Object.fromEntries(fd));
    await db.$transaction(async (tx) => {
      const t = await tx.teacher.findUniqueOrThrow({ where: { id: d.teacherId } });
      if (!t.isActive) throw new Error("This teacher is not active.");
      const off = await tx.subjectOffering.findUniqueOrThrow({ where: { id: d.offeringId }, include: { subject: true, class: true, session: true } });
      await tx.teacherAssignment.upsert({ where: { teacherId_offeringId: { teacherId: t.id, offeringId: off.id } }, create: { teacherId: t.id, offeringId: off.id, assignedById: admin.id }, update: { isActive: true, assignedById: admin.id } });
      await audit({ actorId: admin.id, action: "teacher.assign_subject", entityType: "TeacherAssignment", entityId: off.id, sensitive: true, details: { teacherId: t.id } }, tx);
      await notify({ userIds: [t.userId], category: "ASSIGNMENT", title: "New subject assignment", body: `You have been assigned ${off.subject.name} for ${off.class.name} (${off.session.name}).`, link: "/teacher/subjects", email: { template: "teacher-assignment" } }, tx);
    });
    await kickEmailWorker();
    return { ok: true, message: "Subject assigned." };
  });
}

export async function unassignTeacher(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("teachers.assign");
    const d = z.object({ assignmentId: id }).parse(Object.fromEntries(fd));
    const a = await db.teacherAssignment.update({ where: { id: d.assignmentId }, data: { isActive: false } });
    await audit({ actorId: admin.id, action: "teacher.unassign_subject", entityType: "TeacherAssignment", entityId: a.id, sensitive: true });
    return { ok: true, message: "Assignment removed. Historical records are preserved." };
  });
}

export async function assignClassTeacher(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("teachers.assign");
    const d = z.object({ classId: id, sessionId: id, teacherId: z.string() }).parse(Object.fromEntries(fd));
    if (!d.teacherId) {
      await db.classTeacherAssignment.deleteMany({ where: { classId: d.classId, sessionId: d.sessionId } });
      await audit({ actorId: admin.id, action: "class_teacher.remove", entityType: "Class", entityId: d.classId, sensitive: true });
      return { ok: true, message: "Class teacher removed." };
    }
    await db.$transaction(async (tx) => {
      const t = await tx.teacher.findUniqueOrThrow({ where: { id: d.teacherId } });
      const c = await tx.class.findUniqueOrThrow({ where: { id: d.classId } });
      await tx.classTeacherAssignment.upsert({ where: { classId_sessionId: { classId: d.classId, sessionId: d.sessionId } }, create: { classId: d.classId, sessionId: d.sessionId, teacherId: t.id }, update: { teacherId: t.id } });
      await audit({ actorId: admin.id, action: "class_teacher.assign", entityType: "Class", entityId: d.classId, sensitive: true, details: { teacherId: t.id } }, tx);
      await notify({ userIds: [t.userId], category: "ASSIGNMENT", title: "Class teacher assignment", body: `You are now the class teacher for ${c.name}.`, link: "/teacher/classes", email: { template: "class-teacher" } }, tx);
    });
    await kickEmailWorker();
    return { ok: true, message: "Class teacher assigned." };
  });
}

/* ───────────────────────── Parents ───────────────────────── */

export async function reviewLinkRequest(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("parents.manage");
    const d = z.object({ requestId: id, decision: z.enum(["APPROVE", "REJECT"]), studentId: z.string().optional(), note: z.string().trim().max(500).optional() }).parse(Object.fromEntries(fd));
    await db.$transaction(async (tx) => {
      const req = await tx.parentLinkRequest.findUniqueOrThrow({ where: { id: d.requestId }, include: { parent: true } });
      if (req.status !== "PENDING") throw new Error("Already reviewed.");
      if (d.decision === "APPROVE") {
        if (!d.studentId) throw new Error("Select the student to link.");
        const settings = await tx.schoolSettings.findUniqueOrThrow({ where: { id: "school" } });
        const existing = await tx.parentStudentRelationship.count({ where: { studentId: d.studentId, status: "VERIFIED", NOT: { parentId: req.parentId } } });
        if (existing >= settings.maxGuardiansPerStudent) throw new Error(`This student already has ${existing} verified guardian(s) (limit ${settings.maxGuardiansPerStudent}).`);
        await tx.parentStudentRelationship.upsert({
          where: { parentId_studentId: { parentId: req.parentId, studentId: d.studentId } },
          create: { parentId: req.parentId, studentId: d.studentId, relationship: req.relationship, status: "VERIFIED", method: "ADMIN_VERIFIED", verifiedAt: new Date(), verifiedById: admin.id },
          update: { status: "VERIFIED", method: "ADMIN_VERIFIED", verifiedAt: new Date(), verifiedById: admin.id, revokedAt: null, revokedReason: null },
        });
      }
      await tx.parentLinkRequest.update({ where: { id: req.id }, data: { status: d.decision === "APPROVE" ? "APPROVED" : "REJECTED", resolvedStudentId: d.studentId || null, reviewedById: admin.id, reviewedAt: new Date(), reviewNote: d.note || null } });
      await audit({ actorId: admin.id, action: `parent.link_${d.decision.toLowerCase()}`, entityType: "ParentLinkRequest", entityId: req.id, sensitive: true, details: { studentId: d.studentId ?? null } }, tx);
      await notify({ userIds: [req.parent.userId], category: "PARENT", title: d.decision === "APPROVE" ? "Child successfully linked" : "Link request not approved", body: d.decision === "APPROVE" ? `Your link request for ${req.childFullName} has been verified.` : `Your link request for ${req.childFullName} was not approved. ${d.note ?? ""}`, link: "/parent", email: { template: "parent-link", priority: "HIGH" } }, tx);
    });
    await kickEmailWorker();
    return { ok: true, message: "Request reviewed." };
  });
}

export async function revokeRelationship(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("parents.manage");
    const d = z.object({ relationshipId: id, reason: z.string().trim().min(5, "Give a reason.") }).parse(Object.fromEntries(fd));
    await db.parentStudentRelationship.update({ where: { id: d.relationshipId }, data: { status: "REVOKED", revokedAt: new Date(), revokedReason: d.reason } });
    await audit({ actorId: admin.id, action: "parent.revoke", entityType: "ParentStudentRelationship", entityId: d.relationshipId, sensitive: true, details: { reason: d.reason } });
    return { ok: true, message: "Access revoked." };
  });
}

export async function verifyRelationship(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("parents.manage");
    const d = z.object({ relationshipId: id }).parse(Object.fromEntries(fd));
    await db.parentStudentRelationship.update({ where: { id: d.relationshipId }, data: { status: "VERIFIED", verifiedAt: new Date(), verifiedById: admin.id, revokedAt: null, revokedReason: null } });
    await audit({ actorId: admin.id, action: "parent.verify", entityType: "ParentStudentRelationship", entityId: d.relationshipId, sensitive: true });
    return { ok: true, message: "Relationship verified." };
  });
}
