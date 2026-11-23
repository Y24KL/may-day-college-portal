"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { run, type ActionState } from "@/lib/action";
import { authorizeStudent } from "@/lib/auth/guards";
import { audit } from "@/lib/audit";
import { makeReference } from "@/lib/counters";
import { notify, adminsWithPermission } from "@/lib/notifications";
import { kickEmailWorker } from "@/lib/email/worker";
import { registrationContext, validateSelection } from "@/lib/registration";
import { saveUpload } from "@/lib/storage/files";
import { parseDateOnly, todayLagos, formatNaira } from "@/lib/utils";
import { rateLimit } from "@/lib/rate-limit";

export async function updateMyProfile(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const u = await authorizeStudent();
    // Only non-sensitive fields; class, sector, ID and academic records are admin-only.
    const d = z.object({ phone: z.string().trim().max(30).optional(), address: z.string().trim().min(5, "Enter your address.").max(300), guardianPhone: z.string().trim().max(30).optional() }).parse(Object.fromEntries(fd));
    const data: Prisma.StudentUpdateInput = { phone: d.phone || null, address: d.address, guardianPhone: d.guardianPhone || null };
    const photo = fd.get("photo");
    if (photo instanceof File && photo.size > 0) data.photoFileId = (await saveUpload({ file: photo, purpose: "STUDENT_PHOTO", uploadedById: u.id, studentId: u.studentId })).id;
    await db.student.update({ where: { id: u.studentId }, data });
    await audit({ actorId: u.id, action: "student.self_update", entityType: "Student", entityId: u.studentId });
    return { ok: true, message: "Profile updated." };
  });
}

export async function submitSubjectRegistration(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const u = await authorizeStudent();
    const ctx = await registrationContext(u.studentId);
    if (!ctx || !ctx.enrollment) throw new Error("You are not enrolled in the current session.");
    if (!ctx.window.open) throw new Error(ctx.window.reason ?? "Registration is closed.");
    if (ctx.enrollment.subjectRegistration) throw new Error("You have already registered subjects for this session.");
    const selected = fd.getAll("offeringIds").map(String);
    const errors = validateSelection(ctx.offerings.map((o) => ({ id: o.id, isCompulsory: o.isCompulsory, isActive: o.isActive, subjectName: o.subject.name })), selected, { minElectives: ctx.cfg?.minElectives ?? 0, maxElectives: ctx.cfg?.maxElectives ?? 0 });
    if (errors.length) throw new Error(errors.join(" "));
    const requiresApproval = ctx.cfg?.requiresApproval ?? false;
    const reg = await db.$transaction(async (tx) => {
      const r = await tx.subjectRegistration.create({
        data: { reference: makeReference("REG"), studentId: u.studentId, enrollmentId: ctx.enrollment.id, sessionId: ctx.session.id, status: requiresApproval ? "SUBMITTED" : "APPROVED", reviewedAt: requiresApproval ? null : new Date(), items: { create: [...new Set(selected)].map((offeringId) => ({ offeringId })) } },
      });
      await audit({ actorId: u.id, action: "subject_registration.submit", entityType: "SubjectRegistration", entityId: r.id, details: { count: selected.length } }, tx);
      await notify({ userIds: [u.id], category: "REGISTRATION", title: "Subject registration received", body: `Reference ${r.reference}: ${selected.length} subject(s) registered for ${ctx.session.name}${requiresApproval ? " — awaiting school approval" : ""}.`, link: "/student/subjects", email: { template: "subject-registration" } }, tx);
      if (requiresApproval) await notify({ userIds: await adminsWithPermission("registration.manage", tx), category: "REGISTRATION", title: "Subject registration awaiting approval", body: `${u.displayName} (${ctx.enrollment.class.name}) submitted ${r.reference}.`, link: "/admin/registration" }, tx);
      return r;
    });
    await kickEmailWorker();
    return { ok: true, message: `Registration submitted (${reg.reference}).`, redirect: "/student/subjects" };
  });
}

export async function submitPayment(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const u = await authorizeStudent();
    if (!rateLimit(`payment:${u.id}`, 10, 60 * 60_000).ok) throw new Error("Too many submissions. Please try again later.");
    const d = z
      .object({
        termId: z.string().min(1),
        amount: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Enter the amount paid, e.g. 150000").transform((v) => new Prisma.Decimal(v)),
        paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the payment date."),
        bankReference: z.string().trim().min(4, "Enter the bank transfer reference.").max(80).regex(/^[\w\-/. ]+$/, "The reference contains invalid characters."),
        description: z.string().trim().max(300).optional(),
      })
      .parse(Object.fromEntries(fd));
    if (d.amount.lessThanOrEqualTo(0)) throw new Error("The amount must be greater than zero.");
    if (d.amount.greaterThan(50_000_000)) throw new Error("Please check the amount.");
    const paymentDate = parseDateOnly(d.paymentDate);
    if (paymentDate > todayLagos()) throw new Error("The payment date cannot be in the future.");
    const term = await db.term.findUnique({ where: { id: d.termId } });
    if (!term) throw new Error("Select a valid term.");
    const receipt = fd.get("receipt");
    if (!(receipt instanceof File) || receipt.size === 0) throw new Error("Upload the payment receipt (PDF, JPG or PNG).");
    const dup = await db.paymentSubmission.findFirst({ where: { bankReference: { equals: d.bankReference, mode: "insensitive" }, status: { in: ["PENDING", "APPROVED"] } } });
    if (dup) throw new Error(dup.studentId === u.studentId ? `You have already submitted this bank reference (${dup.reference}).` : "This bank reference has already been submitted. Contact the bursary if this is an error.");
    const file = await saveUpload({ file: receipt, purpose: "PAYMENT_RECEIPT", uploadedById: u.id, studentId: u.studentId });
    const sub = await db.$transaction(async (tx) => {
      const s = await tx.paymentSubmission.create({
        data: { reference: makeReference("MDC-PAY"), studentId: u.studentId, submittedById: u.id, termId: term.id, amount: d.amount, paymentDate, bankReference: d.bankReference, description: d.description || null, receipts: { create: { fileId: file.id } } },
      });
      await audit({ actorId: u.id, action: "payment.submit", entityType: "PaymentSubmission", entityId: s.id, sensitive: true, details: { amount: d.amount.toString() } }, tx);
      await notify({ userIds: await adminsWithPermission("finance.verify", tx), category: "PAYMENT", title: "New payment submission", body: `${u.displayName}: ${formatNaira(d.amount)} (ref ${d.bankReference}).`, link: `/admin/payments/${s.id}` }, tx);
      await notify({ userIds: [u.id], category: "PAYMENT", title: "Payment submitted for verification", body: `We received your submission ${s.reference} for ${formatNaira(d.amount)}. It will be confirmed once the bursary verifies the funds.`, link: "/student/payments" }, tx);
      return s;
    });
    return { ok: true, message: `Submitted for verification (${sub.reference}).`, redirect: "/student/payments" };
  });
}
