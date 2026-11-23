import { Prisma } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { makeReference } from "@/lib/counters";
import { notify, verifiedParentUserIds, studentUserId } from "@/lib/notifications";
import { formatNaira, formatDate } from "@/lib/utils";

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const ZERO = D(0);

export function obligationOutstanding(o: { amount: Prisma.Decimal; amountPaid: Prisma.Decimal; amountAdjusted: Prisma.Decimal; status?: string }) {
  if (o.status === "WAIVED") return ZERO;
  const out = o.amount.sub(o.amountAdjusted).sub(o.amountPaid);
  return out.lessThan(0) ? ZERO : out;
}

export function statusFor(o: { amount: Prisma.Decimal; amountPaid: Prisma.Decimal; amountAdjusted: Prisma.Decimal }) {
  const due = o.amount.sub(o.amountAdjusted);
  if (due.lessThanOrEqualTo(0)) return "WAIVED" as const;
  if (o.amountPaid.greaterThanOrEqualTo(due)) return "PAID" as const;
  if (o.amountPaid.greaterThan(0)) return "PARTIAL" as const;
  return "UNPAID" as const;
}

/**
 * Pure allocation: apply `amount` to obligations oldest-due first.
 * Returns the allocations and any unallocated remainder (overpayment credit).
 */
export function planAllocation(
  amount: Prisma.Decimal,
  obligations: { id: string; outstanding: Prisma.Decimal; dueDate: Date | null; createdAt: Date }[],
) {
  const sorted = [...obligations].sort(
    (a, b) => (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity) || a.createdAt.getTime() - b.createdAt.getTime(),
  );
  let remaining = amount;
  const allocations: { obligationId: string; amount: Prisma.Decimal }[] = [];
  for (const o of sorted) {
    if (remaining.lessThanOrEqualTo(0)) break;
    if (o.outstanding.lessThanOrEqualTo(0)) continue;
    const take = Prisma.Decimal.min(remaining, o.outstanding);
    allocations.push({ obligationId: o.id, amount: take });
    remaining = remaining.sub(take);
  }
  return { allocations, remainder: remaining };
}

/** Student balance summary from obligations + ledger (credit = unallocated). */
export async function studentBalance(studentId: string, termId?: string) {
  const obligations = await db.studentFeeObligation.findMany({
    where: { studentId, ...(termId ? { termId } : {}) },
    include: { feeStructure: { include: { category: true } }, term: { include: { session: true } } },
    orderBy: [{ term: { session: { startDate: "asc" } } }, { term: { order: "asc" } }],
  });
  let payable = ZERO, paid = ZERO, adjusted = ZERO, outstanding = ZERO;
  for (const o of obligations) {
    payable = payable.add(o.amount);
    paid = paid.add(o.amountPaid);
    adjusted = adjusted.add(o.amountAdjusted);
    outstanding = outstanding.add(obligationOutstanding(o));
  }
  const ledger = await db.financialLedger.aggregate({ where: { studentId }, _sum: { debit: true, credit: true } });
  const payments = await db.payment.aggregate({ where: { studentId }, _sum: { amount: true } });
  const allocated = await db.paymentAllocation.aggregate({ where: { payment: { studentId } }, _sum: { amount: true } });
  const refunds = await db.paymentAdjustment.aggregate({ where: { studentId, type: "REFUND" }, _sum: { amount: true } });
  const credit = D(payments._sum.amount ?? 0).sub(allocated._sum.amount ?? 0).sub(refunds._sum.amount ?? 0);
  return {
    obligations,
    payable,
    paid,
    adjusted,
    outstanding,
    credit: credit.lessThan(0) ? ZERO : credit,
    ledgerBalance: D(ledger._sum.debit ?? 0).sub(ledger._sum.credit ?? 0),
  };
}

/** Create obligations for every active enrollment in a fee structure's class+session. Idempotent. */
export async function generateObligationsForStructure(feeStructureId: string, actorId: string | null, tx: Tx = db) {
  const fs = await tx.feeStructure.findUniqueOrThrow({ where: { id: feeStructureId }, include: { category: true, term: true } });
  if (!fs.isActive) return 0;
  const enrollments = await tx.studentEnrollment.findMany({
    where: { classId: fs.classId, sessionId: fs.sessionId, status: "ACTIVE", student: { status: "ACTIVE" } },
  });
  let created = 0;
  for (const e of enrollments) {
    const exists = await tx.studentFeeObligation.findUnique({ where: { studentId_feeStructureId: { studentId: e.studentId, feeStructureId: fs.id } } });
    if (exists) continue;
    const ob = await tx.studentFeeObligation.create({
      data: { studentId: e.studentId, feeStructureId: fs.id, enrollmentId: e.id, termId: fs.termId, amount: fs.amount, dueDate: fs.dueDate },
    });
    await tx.financialLedger.create({
      data: { studentId: e.studentId, entryType: "CHARGE", debit: fs.amount, obligationId: ob.id, description: `${fs.category.name} — ${fs.term.name}`, createdById: actorId },
    });
    created++;
  }
  return created;
}

/** Create obligations for one student's enrollment across all active structures of that class/session. */
export async function generateObligationsForEnrollment(enrollmentId: string, actorId: string | null, tx: Tx = db) {
  const e = await tx.studentEnrollment.findUniqueOrThrow({ where: { id: enrollmentId } });
  const structures = await tx.feeStructure.findMany({ where: { classId: e.classId, sessionId: e.sessionId, isActive: true }, include: { category: true, term: true } });
  for (const fs of structures) {
    const exists = await tx.studentFeeObligation.findUnique({ where: { studentId_feeStructureId: { studentId: e.studentId, feeStructureId: fs.id } } });
    if (exists) continue;
    const ob = await tx.studentFeeObligation.create({
      data: { studentId: e.studentId, feeStructureId: fs.id, enrollmentId: e.id, termId: fs.termId, amount: fs.amount, dueDate: fs.dueDate },
    });
    await tx.financialLedger.create({
      data: { studentId: e.studentId, entryType: "CHARGE", debit: fs.amount, obligationId: ob.id, description: `${fs.category.name} — ${fs.term.name}`, createdById: actorId },
    });
  }
}

/**
 * Change a fee amount. Obligations not yet fully paid are re-priced and the
 * difference is posted to the ledger, preserving history. Fully-paid ones are
 * left unchanged unless `includePaid`.
 */
export async function repriceFeeStructure(feeStructureId: string, newAmount: Prisma.Decimal, actorId: string) {
  return db.$transaction(async (tx) => {
    const fs = await tx.feeStructure.findUniqueOrThrow({ where: { id: feeStructureId }, include: { category: true } });
    const old = fs.amount;
    if (old.equals(newAmount)) return 0;
    await tx.feeStructure.update({ where: { id: fs.id }, data: { amount: newAmount } });
    const obs = await tx.studentFeeObligation.findMany({ where: { feeStructureId: fs.id, status: { in: ["UNPAID", "PARTIAL"] } } });
    for (const o of obs) {
      const diff = newAmount.sub(o.amount);
      const updated = { amount: newAmount, amountPaid: o.amountPaid, amountAdjusted: o.amountAdjusted };
      await tx.studentFeeObligation.update({ where: { id: o.id }, data: { amount: newAmount, status: statusFor(updated) } });
      await tx.financialLedger.create({
        data: {
          studentId: o.studentId,
          entryType: "ADJUSTMENT",
          debit: diff.greaterThan(0) ? diff : ZERO,
          credit: diff.lessThan(0) ? diff.abs() : ZERO,
          obligationId: o.id,
          description: `Fee change: ${fs.category.name} ${formatNaira(old)} → ${formatNaira(newAmount)}`,
          createdById: actorId,
        },
      });
    }
    await audit({ actorId, action: "fee.reprice", entityType: "FeeStructure", entityId: fs.id, sensitive: true, details: { old: old.toString(), new: newAmount.toString(), affected: obs.length } }, tx);
    return obs.length;
  });
}

export class FinanceError extends Error {}

/**
 * Approve a payment submission — ONLY after the administrator has confirmed
 * the funds are in the school bank account. Runs in a single serializable
 * transaction; the conditional status update guarantees a submission can
 * never be approved twice (no duplicate ledger entries).
 */
export async function approvePaymentSubmission(submissionId: string, actorId: string, opts: { confirmedFundsReceived: boolean; note?: string }) {
  if (!opts.confirmedFundsReceived) throw new FinanceError("You must confirm that the funds have been received in the school account.");
  const result = await db.$transaction(
    async (tx) => {
      const claimed = await tx.paymentSubmission.updateMany({
        where: { id: submissionId, status: "PENDING" },
        data: { status: "APPROVED", reviewedById: actorId, reviewedAt: new Date() },
      });
      if (claimed.count !== 1) throw new FinanceError("This submission has already been processed.");
      const sub = await tx.paymentSubmission.findUniqueOrThrow({ where: { id: submissionId }, include: { term: { include: { session: true } }, student: true } });

      const dup = await tx.payment.findFirst({ where: { transactionReference: sub.bankReference } });
      if (dup) throw new FinanceError("A verified payment with this bank reference already exists.");

      const payment = await tx.payment.create({
        data: {
          transactionReference: sub.bankReference,
          confirmationNumber: makeReference("MDC-RCPT"),
          submissionId: sub.id,
          studentId: sub.studentId,
          amount: sub.amount,
          paymentDate: sub.paymentDate,
          method: "BANK_TRANSFER",
          verifiedById: actorId,
        },
      });
      await tx.financialLedger.create({
        data: { studentId: sub.studentId, entryType: "PAYMENT", credit: sub.amount, paymentId: payment.id, description: `Bank transfer ${sub.bankReference}`, createdById: actorId },
      });

      // Allocate: the submitted term first, then any other outstanding obligations (oldest first).
      const obligations = await tx.studentFeeObligation.findMany({ where: { studentId: sub.studentId, status: { in: ["UNPAID", "PARTIAL"] } } });
      const prioritised = obligations.map((o) => ({
        id: o.id,
        outstanding: obligationOutstanding(o),
        dueDate: o.termId === sub.termId ? new Date(0) : o.dueDate,
        createdAt: o.createdAt,
      }));
      const plan = planAllocation(sub.amount, prioritised);
      for (const a of plan.allocations) {
        await tx.paymentAllocation.create({ data: { paymentId: payment.id, obligationId: a.obligationId, amount: a.amount } });
        const o = obligations.find((x) => x.id === a.obligationId)!;
        const amountPaid = o.amountPaid.add(a.amount);
        await tx.studentFeeObligation.update({
          where: { id: o.id },
          data: { amountPaid, status: statusFor({ amount: o.amount, amountPaid, amountAdjusted: o.amountAdjusted }) },
        });
      }
      await audit({ actorId, action: "payment.approve", entityType: "PaymentSubmission", entityId: sub.id, sensitive: true, details: { amount: sub.amount.toString(), paymentId: payment.id, remainder: plan.remainder.toString(), note: opts.note ?? null } }, tx);

      // Outstanding after allocation
      const after = await tx.studentFeeObligation.findMany({ where: { studentId: sub.studentId } });
      const outstanding = after.reduce((s, o) => s.add(obligationOutstanding(o)), ZERO);
      const category = plan.allocations.length
        ? (
            await tx.studentFeeObligation.findMany({ where: { id: { in: plan.allocations.map((a) => a.obligationId) } }, include: { feeStructure: { include: { category: true } } } })
          )
            .map((o) => o.feeStructure.category.name)
            .join(", ")
        : "Credit balance";
      const rows: [string, string][] = [
        ["Amount received", formatNaira(sub.amount)],
        ["Payment date", formatDate(sub.paymentDate)],
        ["Transaction reference", sub.bankReference],
        ["Confirmation number", payment.confirmationNumber],
        ["Academic session", sub.term.session.name],
        ["Term", sub.term.name],
        ["Fee category", category],
        ["Outstanding balance", formatNaira(outstanding)],
      ];
      if (plan.remainder.greaterThan(0)) rows.push(["Credit (overpayment)", formatNaira(plan.remainder)]);
      const recipients = [await studentUserId(sub.studentId, tx), ...(await verifiedParentUserIds(sub.studentId, tx))].filter(Boolean) as string[];
      await notify(
        {
          userIds: recipients,
          category: "PAYMENT",
          title: "Payment confirmed",
          body: `A payment of ${formatNaira(sub.amount)} for ${sub.student.fullName} has been verified and recorded.`,
          link: "/student/payments",
          email: { template: "payment-approved", priority: "HIGH", content: { rows, paragraphs: [`We have verified a payment of ${formatNaira(sub.amount)} for ${sub.student.fullName}. Thank you.`] } },
        },
        tx,
      );
      return { payment, remainder: plan.remainder };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000 },
  );
  return result;
}

export async function rejectPaymentSubmission(submissionId: string, actorId: string, reason: string) {
  if (reason.trim().length < 5) throw new FinanceError("Please give a clear rejection reason.");
  return db.$transaction(async (tx) => {
    const claimed = await tx.paymentSubmission.updateMany({
      where: { id: submissionId, status: "PENDING" },
      data: { status: "REJECTED", rejectionReason: reason.trim(), reviewedById: actorId, reviewedAt: new Date() },
    });
    if (claimed.count !== 1) throw new FinanceError("This submission has already been processed.");
    const sub = await tx.paymentSubmission.findUniqueOrThrow({ where: { id: submissionId }, include: { student: true } });
    await audit({ actorId, action: "payment.reject", entityType: "PaymentSubmission", entityId: sub.id, sensitive: true, details: { reason } }, tx);
    const recipients = [await studentUserId(sub.studentId, tx), ...(await verifiedParentUserIds(sub.studentId, tx))].filter(Boolean) as string[];
    await notify(
      {
        userIds: recipients,
        category: "PAYMENT",
        title: "Payment submission not approved",
        body: `The payment submission ${sub.reference} (${formatNaira(sub.amount)}) for ${sub.student.fullName} was not approved. Reason: ${reason.trim()}. You may submit a corrected receipt.`,
        link: "/student/payments",
        email: { template: "payment-rejected", priority: "HIGH" },
      },
      tx,
    );
  });
}

/** Authorised adjustments (waiver/discount/surcharge/refund). */
export async function recordAdjustment(args: { studentId: string; obligationId?: string | null; type: "WAIVER" | "DISCOUNT" | "SURCHARGE" | "REFUND"; amount: Prisma.Decimal; reason: string; actorId: string }) {
  if (args.amount.lessThanOrEqualTo(0)) throw new FinanceError("Amount must be greater than zero.");
  if (args.reason.trim().length < 5) throw new FinanceError("A reason is required.");
  return db.$transaction(async (tx) => {
    if (args.type === "REFUND") {
      const b = await creditFor(args.studentId, tx);
      if (args.amount.greaterThan(b)) throw new FinanceError(`Refund exceeds the student's credit balance (${formatNaira(b)}).`);
    }
    let ob = null;
    if (args.obligationId) {
      ob = await tx.studentFeeObligation.findFirst({ where: { id: args.obligationId, studentId: args.studentId } });
      if (!ob) throw new FinanceError("Fee obligation not found for this student.");
    } else if (args.type !== "REFUND") throw new FinanceError("Select the fee the adjustment applies to.");
    const adj = await tx.paymentAdjustment.create({
      data: { studentId: args.studentId, obligationId: ob?.id, type: args.type, amount: args.amount, reason: args.reason.trim(), createdById: args.actorId },
    });
    if (ob) {
      const delta = args.type === "SURCHARGE" ? args.amount.neg() : args.amount;
      const amountAdjusted = ob.amountAdjusted.add(delta);
      await tx.studentFeeObligation.update({ where: { id: ob.id }, data: { amountAdjusted, status: statusFor({ amount: ob.amount, amountPaid: ob.amountPaid, amountAdjusted }) } });
    }
    await tx.financialLedger.create({
      data: {
        studentId: args.studentId,
        entryType: args.type === "REFUND" ? "REFUND" : "ADJUSTMENT",
        debit: args.type === "SURCHARGE" || args.type === "REFUND" ? args.amount : ZERO,
        credit: args.type === "WAIVER" || args.type === "DISCOUNT" ? args.amount : ZERO,
        obligationId: ob?.id,
        adjustmentId: adj.id,
        description: `${args.type}: ${args.reason.trim()}`,
        createdById: args.actorId,
      },
    });
    await audit({ actorId: args.actorId, action: `finance.${args.type.toLowerCase()}`, entityType: "PaymentAdjustment", entityId: adj.id, sensitive: true, details: { amount: args.amount.toString(), studentId: args.studentId } }, tx);
    return adj;
  });
}

async function creditFor(studentId: string, tx: Tx) {
  const payments = await tx.payment.aggregate({ where: { studentId }, _sum: { amount: true } });
  const allocated = await tx.paymentAllocation.aggregate({ where: { payment: { studentId } }, _sum: { amount: true } });
  const refunds = await tx.paymentAdjustment.aggregate({ where: { studentId, type: "REFUND" }, _sum: { amount: true } });
  return D(payments._sum.amount ?? 0).sub(allocated._sum.amount ?? 0).sub(refunds._sum.amount ?? 0);
}
