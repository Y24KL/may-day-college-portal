import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/current-user";
import { tablePdf, pdfResponse } from "@/lib/pdf/simple";
import { termLabel } from "@/lib/academic";
import { formatNaira, formatDate } from "@/lib/utils";
import { obligationOutstanding } from "@/lib/finance";

export const dynamic = "force-dynamic";

/** Official payment confirmation (only for VERIFIED payments). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await getCurrentUser();
  if (!u) return new Response("Unauthorized", { status: 401 });
  const p = await db.payment.findUnique({ where: { id }, include: { student: true, submission: { include: { term: { include: { session: true } } } }, allocations: { include: { obligation: { include: { feeStructure: { include: { category: true } }, term: true } } } } } });
  if (!p) return new Response("Not found", { status: 404 });
  const allowed =
    (u.isAdmin && (u.permissions.has("finance.view") || u.permissions.has("finance.verify"))) ||
    u.studentId === p.studentId ||
    (!!u.parentId && !!(await db.parentStudentRelationship.findFirst({ where: { parentId: u.parentId, studentId: p.studentId, status: "VERIFIED" } })));
  if (!allowed) return new Response("Not found", { status: 404 });
  const obs = await db.studentFeeObligation.findMany({ where: { studentId: p.studentId } });
  const outstanding = obs.reduce((s, o) => s + Number(obligationOutstanding(o)), 0);
  const rows: string[][] = [
    ["Confirmation number", p.confirmationNumber],
    ["Student", `${p.student.fullName} (${p.student.studentNumber})`],
    ["Amount received", formatNaira(p.amount)],
    ["Payment date", formatDate(p.paymentDate)],
    ["Transaction reference", p.transactionReference],
    ["Academic session / term", p.submission ? termLabel(p.submission.term) : "-"],
    ["Verified on", formatDate(p.verifiedAt)],
    ...p.allocations.map((a) => [`Applied to: ${a.obligation.feeStructure.category.name} (${a.obligation.term.name})`, formatNaira(a.amount)]),
    ["Current outstanding balance", formatNaira(outstanding)],
  ];
  const pdf = await tablePdf({ title: "Payment Confirmation", subtitle: ["This confirms that the school has verified receipt of the payment below."], headers: ["Item", "Detail"], rows, widths: [220, 303] });
  return pdfResponse(pdf, `payment-${p.confirmationNumber}.pdf`);
}
