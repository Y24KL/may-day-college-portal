"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { run, type ActionState } from "@/lib/action";
import { authorizeAdmin } from "@/lib/auth/guards";
import { audit } from "@/lib/audit";
import { approvePaymentSubmission, rejectPaymentSubmission, generateObligationsForStructure, repriceFeeStructure, recordAdjustment } from "@/lib/finance";
import { kickEmailWorker } from "@/lib/email/worker";
import { parseDateOnly } from "@/lib/utils";

const id = z.string().min(1);
const money = z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Enter an amount like 150000 or 150000.50").transform((v) => new Prisma.Decimal(v));

export async function saveFeeCategory(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("finance.configure");
    const d = z.object({ categoryId: z.string().optional(), name: z.string().trim().min(2).max(80), description: z.string().trim().max(300).optional() }).parse(Object.fromEntries(fd));
    const c = d.categoryId ? await db.feeCategory.update({ where: { id: d.categoryId }, data: { name: d.name, description: d.description || null } }) : await db.feeCategory.create({ data: { name: d.name, description: d.description || null } });
    await audit({ actorId: admin.id, action: "fee_category.save", entityType: "FeeCategory", entityId: c.id });
    return { ok: true, message: "Fee category saved." };
  });
}

export async function createFeeStructures(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("finance.configure");
    const d = z.object({ termId: id, categoryId: id, amount: money, dueDate: z.string().optional() }).parse(Object.fromEntries(fd));
    const classIds = fd.getAll("classIds").map(String).filter(Boolean);
    if (!classIds.length) throw new Error("Select at least one class.");
    const term = await db.term.findUniqueOrThrow({ where: { id: d.termId } });
    let created = 0, obligations = 0;
    for (const classId of classIds) {
      const exists = await db.feeStructure.findUnique({ where: { termId_classId_categoryId: { termId: term.id, classId, categoryId: d.categoryId } } });
      if (exists) continue;
      const fs = await db.feeStructure.create({ data: { sessionId: term.sessionId, termId: term.id, classId, categoryId: d.categoryId, amount: d.amount, dueDate: d.dueDate ? parseDateOnly(d.dueDate) : null } });
      obligations += await db.$transaction((tx) => generateObligationsForStructure(fs.id, admin.id, tx), { timeout: 60_000 });
      created++;
    }
    await audit({ actorId: admin.id, action: "fee_structure.create", entityType: "FeeStructure", sensitive: true, details: { termId: term.id, classIds, amount: d.amount.toString(), created, obligations } });
    return { ok: true, message: `${created} fee item(s) created; ${obligations} student bill(s) generated.${created < classIds.length ? " Existing items were skipped." : ""}` };
  });
}

export async function updateFeeStructure(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("finance.configure");
    const d = z.object({ feeStructureId: id, amount: money, dueDate: z.string().optional() }).parse(Object.fromEntries(fd));
    const affected = await repriceFeeStructure(d.feeStructureId, d.amount, admin.id);
    await db.feeStructure.update({ where: { id: d.feeStructureId }, data: { dueDate: d.dueDate ? parseDateOnly(d.dueDate) : null } });
    await db.studentFeeObligation.updateMany({ where: { feeStructureId: d.feeStructureId, status: { in: ["UNPAID", "PARTIAL"] } }, data: { dueDate: d.dueDate ? parseDateOnly(d.dueDate) : null } });
    return { ok: true, message: `Fee updated. ${affected} unpaid/partly-paid bill(s) re-priced; fully paid bills unchanged.` };
  });
}

export async function syncFeeObligations(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("finance.configure");
    const feeStructureId = id.parse(fd.get("feeStructureId"));
    const n = await db.$transaction((tx) => generateObligationsForStructure(feeStructureId, admin.id, tx), { timeout: 60_000 });
    return { ok: true, message: `${n} new bill(s) generated for newly enrolled students.` };
  });
}

export async function toggleFeeStructure(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("finance.configure");
    const feeStructureId = id.parse(fd.get("feeStructureId"));
    const fs = await db.feeStructure.findUniqueOrThrow({ where: { id: feeStructureId } });
    await db.feeStructure.update({ where: { id: fs.id }, data: { isActive: !fs.isActive } });
    await audit({ actorId: admin.id, action: fs.isActive ? "fee_structure.deactivate" : "fee_structure.activate", entityType: "FeeStructure", entityId: fs.id, sensitive: true });
    return { ok: true, message: fs.isActive ? "Fee deactivated for new enrollments. Existing bills remain (use waivers to cancel them)." : "Fee re-activated." };
  });
}

export async function saveBankDetails(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("finance.configure");
    const d = z
      .object({ bankName: z.string().trim().min(2).max(80), bankAccountName: z.string().trim().min(2).max(120), bankAccountNumber: z.string().trim().regex(/^\d{10}$/, "Nigerian (NUBAN) account numbers have 10 digits."), transferInstructions: z.string().trim().max(1000).optional(), paymentReferenceInstructions: z.string().trim().max(500).optional() })
      .parse(Object.fromEntries(fd));
    const before = await db.schoolSettings.findUniqueOrThrow({ where: { id: "school" } });
    await db.schoolSettings.update({ where: { id: "school" }, data: { ...d, transferInstructions: d.transferInstructions || null, paymentReferenceInstructions: d.paymentReferenceInstructions || null } });
    await audit({ actorId: admin.id, action: "finance.bank_details", entityType: "SchoolSettings", sensitive: true, details: { before: { bankName: before.bankName, accountNumber: before.bankAccountNumber }, after: { bankName: d.bankName, accountNumber: d.bankAccountNumber } } });
    return { ok: true, message: "Bank details updated." };
  });
}

export async function approvePayment(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("finance.verify");
    const d = z.object({ submissionId: id, note: z.string().max(500).optional() }).parse(Object.fromEntries(fd));
    const r = await approvePaymentSubmission(d.submissionId, admin.id, { confirmedFundsReceived: fd.get("confirmFunds") === "on", note: d.note });
    await kickEmailWorker();
    return { ok: true, message: `Payment verified (${r.payment.confirmationNumber}). Student and verified parents notified.` };
  });
}

export async function rejectPayment(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("finance.verify");
    const d = z.object({ submissionId: id, reason: z.string() }).parse(Object.fromEntries(fd));
    await rejectPaymentSubmission(d.submissionId, admin.id, d.reason);
    await kickEmailWorker();
    return { ok: true, message: "Submission rejected; the student can submit a corrected receipt." };
  });
}

export async function createAdjustment(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await authorizeAdmin("finance.adjust");
    const d = z.object({ studentId: id, obligationId: z.string().optional(), type: z.enum(["WAIVER", "DISCOUNT", "SURCHARGE", "REFUND"]), amount: money, reason: z.string() }).parse(Object.fromEntries(fd));
    await recordAdjustment({ ...d, obligationId: d.obligationId || null, actorId: admin.id });
    return { ok: true, message: "Adjustment recorded in the ledger." };
  });
}
