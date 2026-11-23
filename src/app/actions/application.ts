"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { run, type ActionState } from "@/lib/action";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthError } from "@/lib/auth/guards";
import { saveUpload } from "@/lib/storage/files";
import { notify, adminsWithPermission } from "@/lib/notifications";
import { kickEmailWorker } from "@/lib/email/worker";
import { parseDateOnly } from "@/lib/utils";
import { audit } from "@/lib/audit";

async function applicant(type: "STUDENT" | "TEACHER") {
  const u = await getCurrentUser();
  if (!u || u.accountType !== type) throw new AuthError();
  if (!u.emailVerified) throw new AuthError("Verify your email address first.");
  return u;
}

const text = (min: number, max: number, msg: string) => z.string().trim().min(min, msg).max(max);

export async function submitStudentApplication(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const u = await applicant("STUDENT");
    const app = await db.studentApplication.findUniqueOrThrow({ where: { userId: u.id } });
    if (!["DRAFT", "INFORMATION_REQUIRED"].includes(app.status)) throw new Error("Your application has already been submitted.");
    const d = z
      .object({
        fullName: text(3, 120, "Enter your full name."),
        dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter your date of birth."),
        gender: z.enum(["MALE", "FEMALE"], { message: "Select your gender." }),
        address: text(5, 300, "Enter your residential address."),
        guardianName: text(3, 120, "Enter your parent/guardian's full name."),
        guardianEmail: z.string().trim().toLowerCase().email("Enter a valid parent/guardian email."),
        guardianPhone: text(7, 30, "Enter your parent/guardian's phone number."),
        classId: z.string().min(1, "Select your class and academic sector."),
        sessionId: z.string().min(1, "Select the academic session."),
      })
      .parse(Object.fromEntries(fd));
    if (d.guardianEmail === u.email) throw new Error("The parent/guardian email must be different from your own email.");
    const dob = parseDateOnly(d.dateOfBirth);
    const age = (Date.now() - dob.getTime()) / (365.25 * 86400_000);
    if (age < 8 || age > 30) throw new Error("Please check the date of birth.");
    const [cls, session] = await Promise.all([
      db.class.findFirst({ where: { id: d.classId, isActive: true } }),
      db.academicSession.findFirst({ where: { id: d.sessionId, status: { not: "ARCHIVED" } } }),
    ]);
    if (!cls) throw new Error("The selected class is not available.");
    if (!session) throw new Error("The selected academic session is not available.");

    let photoFileId = app.photoFileId;
    const photo = fd.get("photo");
    if (photo instanceof File && photo.size > 0) {
      const doc = await saveUpload({ file: photo, purpose: "STUDENT_PHOTO", uploadedById: u.id });
      photoFileId = doc.id;
    }
    if (!photoFileId) throw new Error("Upload a passport photograph.");

    await db.$transaction(async (tx) => {
      await tx.studentApplication.update({
        where: { id: app.id },
        data: {
          fullName: d.fullName, dateOfBirth: dob, gender: d.gender, address: d.address, guardianName: d.guardianName,
          guardianEmail: d.guardianEmail, guardianPhone: d.guardianPhone, requestedClassId: cls.id, sessionId: session.id,
          photoFileId, status: "PENDING_APPROVAL", submittedAt: new Date(),
        },
      });
      await audit({ actorId: u.id, action: app.status === "DRAFT" ? "application.student.submit" : "application.student.resubmit", entityType: "StudentApplication", entityId: app.id }, tx);
      await notify({ userIds: await adminsWithPermission("students.manage", tx), category: "REGISTRATION", title: "New student registration", body: `${d.fullName} (${cls.name}) submitted application ${app.reference}.`, link: `/admin/students/applications/${app.id}` }, tx);
      await notify(
        { userIds: [u.id], category: "REGISTRATION", title: "Application received", body: `Your application ${app.reference} has been received and is pending approval by the school.`, link: "/application", email: { template: "application-received", priority: "NORMAL", content: { rows: [["Application reference", app.reference], ["Class", cls.name], ["Session", session.name]] } } },
        tx,
      );
    });
    await kickEmailWorker();
    return { ok: true, message: "Application submitted.", redirect: "/application" };
  });
}

export async function submitTeacherApplication(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const u = await applicant("TEACHER");
    const app = await db.teacherApplication.findUniqueOrThrow({ where: { userId: u.id } });
    if (!["DRAFT", "INFORMATION_REQUIRED"].includes(app.status)) throw new Error("Your application has already been submitted.");
    const d = z
      .object({
        fullName: text(3, 120, "Enter your full name."),
        phone: text(7, 30, "Enter your phone number."),
        gender: z.enum(["MALE", "FEMALE", ""]).optional(),
        address: z.string().trim().max(300).optional(),
        qualifications: text(2, 1000, "List your qualifications."),
        specialization: text(2, 200, "Enter your area of specialisation."),
        subjectsOfInterest: text(2, 500, "List the subjects you are qualified to teach."),
        yearsExperience: z.coerce.number().int().min(0).max(60),
        previousExperience: z.string().trim().max(2000).optional(),
        professionalInfo: z.string().trim().max(2000).optional(),
      })
      .parse(Object.fromEntries(fd));

    let photoFileId = app.photoFileId;
    const photo = fd.get("photo");
    if (photo instanceof File && photo.size > 0) photoFileId = (await saveUpload({ file: photo, purpose: "TEACHER_PHOTO", uploadedById: u.id })).id;
    if (!photoFileId) throw new Error("Upload a passport photograph.");
    const docs = fd.getAll("documents").filter((f): f is File => f instanceof File && f.size > 0);
    if (docs.length > 5) throw new Error("Upload at most 5 supporting documents.");
    for (const f of docs) await saveUpload({ file: f, purpose: "TEACHER_DOCUMENT", uploadedById: u.id, teacherApplicationId: app.id });

    await db.$transaction(async (tx) => {
      await tx.teacherApplication.update({
        where: { id: app.id },
        data: {
          fullName: d.fullName, phone: d.phone, gender: d.gender ? d.gender : null, address: d.address || null, qualifications: d.qualifications,
          specialization: d.specialization, subjectsOfInterest: d.subjectsOfInterest, yearsExperience: d.yearsExperience,
          previousExperience: d.previousExperience || null, professionalInfo: d.professionalInfo || null, photoFileId,
          status: "PENDING_APPROVAL", submittedAt: new Date(),
        },
      });
      await audit({ actorId: u.id, action: "application.teacher.submit", entityType: "TeacherApplication", entityId: app.id }, tx);
      await notify({ userIds: await adminsWithPermission("teachers.manage", tx), category: "REGISTRATION", title: "New teacher application", body: `${d.fullName} (${d.specialization}) submitted application ${app.reference}.`, link: `/admin/teachers/applications/${app.id}` }, tx);
      await notify({ userIds: [u.id], category: "REGISTRATION", title: "Application received", body: `Your teacher application ${app.reference} is pending administrator approval.`, link: "/application", email: { template: "application-received", content: { rows: [["Application reference", app.reference]] } } }, tx);
    });
    await kickEmailWorker();
    return { ok: true, message: "Application submitted.", redirect: "/application" };
  });
}
