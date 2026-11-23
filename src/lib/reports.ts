import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { termLabel } from "@/lib/academic";
import { obligationOutstanding } from "@/lib/finance";
import { tablePdf } from "@/lib/pdf/simple";
import { formatDate } from "@/lib/utils";

export type Table = { title: string; subtitle?: string[]; headers: string[]; rows: (string | number)[][] };

function csvCell(v: string | number) {
  const s = String(v ?? "");
  // Neutralise spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(t: Table) {
  return [t.headers, ...t.rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}

export async function toXlsx(t: Table) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(t.title.slice(0, 30));
  ws.addRow(t.headers).font = { bold: true };
  t.rows.forEach((r) => ws.addRow(r.map((c) => (typeof c === "string" && /^[=+\-@]/.test(c) ? `'${c}` : c))));
  ws.columns.forEach((c) => (c.width = 20));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function toPdf(t: Table) {
  return tablePdf({ title: t.title, subtitle: t.subtitle, headers: t.headers, rows: t.rows.map((r) => r.map(String)), landscape: t.headers.length > 6 });
}

/** Report builders — every report reads live database records. */
export const REPORTS: Record<string, { permission: string; build: (p: URLSearchParams) => Promise<Table> }> = {
  students: {
    permission: "students.view",
    async build(p) {
      const sessionId = p.get("sessionId") ?? (await db.academicSession.findFirst({ where: { isCurrent: true } }))?.id;
      const rows = await db.studentEnrollment.findMany({ where: { sessionId, ...(p.get("classId") ? { classId: p.get("classId")! } : {}) }, include: { student: { include: { user: { select: { email: true } } } }, class: { include: { sector: true, level: true } }, session: true }, orderBy: [{ class: { name: "asc" } }, { student: { fullName: "asc" } }] });
      return { title: "Student enrollment", subtitle: [rows[0]?.session.name ?? ""], headers: ["Student ID", "Full name", "Gender", "Class", "Level", "Sector", "Enrollment status", "Email"], rows: rows.map((e) => [e.student.studentNumber, e.student.fullName, e.student.gender ?? "", e.class.name, e.class.level.name, e.class.sector.name, e.status, e.student.user.email]) };
    },
  },
  distribution: {
    permission: "reports.view",
    async build(p) {
      const sessionId = p.get("sessionId") ?? (await db.academicSession.findFirst({ where: { isCurrent: true } }))?.id;
      const g = await db.studentEnrollment.groupBy({ by: ["classId"], where: { sessionId, status: "ACTIVE" }, _count: true });
      const classes = await db.class.findMany({ include: { level: true, sector: true } });
      return { title: "Student distribution", headers: ["Class", "Level", "Sector", "Active students"], rows: g.map((x) => { const c = classes.find((k) => k.id === x.classId)!; return [c.name, c.level.name, c.sector.name, x._count]; }) };
    },
  },
  teachers: {
    permission: "teachers.view",
    async build(p) {
      const sessionId = p.get("sessionId") ?? (await db.academicSession.findFirst({ where: { isCurrent: true } }))?.id;
      const a = await db.teacherAssignment.findMany({ where: { isActive: true, offering: { sessionId } }, include: { teacher: true, offering: { include: { subject: true, class: true } } }, orderBy: { teacher: { fullName: "asc" } } });
      return { title: "Teacher assignments", headers: ["Staff no.", "Teacher", "Subject", "Class"], rows: a.map((x) => [x.teacher.staffNumber, x.teacher.fullName, x.offering.subject.name, x.offering.class.name]) };
    },
  },
  registrations: {
    permission: "registration.manage",
    async build(p) {
      const sessionId = p.get("sessionId") ?? (await db.academicSession.findFirst({ where: { isCurrent: true } }))?.id;
      const items = await db.subjectRegistrationItem.findMany({ where: { registration: { sessionId }, ...(p.get("subjectId") ? { offering: { subjectId: p.get("subjectId")! } } : {}) }, include: { offering: { include: { subject: true, class: true } }, registration: { include: { student: true } } } });
      return { title: "Subject registrations", headers: ["Student ID", "Student", "Class", "Subject", "Type", "Status"], rows: items.map((i) => [i.registration.student.studentNumber, i.registration.student.fullName, i.offering.class.name, i.offering.subject.name, i.offering.isCompulsory ? "Compulsory" : "Elective", i.registration.status]) };
    },
  },
  performance: {
    permission: "reports.view",
    async build(p) {
      const termId = p.get("termId") ?? (await db.term.findFirst({ where: { isCurrent: true } }))?.id;
      const res = await db.result.findMany({ where: { termId, status: "PUBLISHED", ...(p.get("classId") ? { classId: p.get("classId")! } : {}) }, include: { student: true, class: true, term: { include: { session: true } } }, orderBy: [{ class: { name: "asc" } }, { position: "asc" }] });
      return { title: "Academic performance", subtitle: [res[0] ? termLabel(res[0].term) : ""], headers: ["Class", "Position", "Student ID", "Student", "Subjects", "Total", "Average"], rows: res.map((r) => [r.class.name, r.position ?? "", r.student.studentNumber, r.student.fullName, r.subjectCount, r.totalMarks.toString(), r.average.toString()]) };
    },
  },
  "class-performance": {
    permission: "reports.view",
    async build(p) {
      const termId = p.get("termId") ?? (await db.term.findFirst({ where: { isCurrent: true } }))?.id;
      const d = await db.resultDetail.findMany({ where: { termId, submission: { status: "PUBLISHED" }, total: { not: null } }, include: { submission: { include: { offering: { include: { subject: true, class: true } } } } } });
      const m = new Map<string, number[]>();
      d.forEach((x) => { const k = `${x.submission.offering.class.name}|${x.submission.offering.subject.name}`; m.set(k, [...(m.get(k) ?? []), Number(x.total)]); });
      return { title: "Class performance by subject", headers: ["Class", "Subject", "Students", "Average", "Highest", "Lowest", "Pass rate (>=50)"], rows: [...m.entries()].sort().map(([k, xs]) => { const [c, s] = k.split("|"); return [c, s, xs.length, (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1), Math.max(...xs), Math.min(...xs), `${((xs.filter((x) => x >= 50).length / xs.length) * 100).toFixed(1)}%`]; }) };
    },
  },
  attendance: {
    permission: "attendance.view",
    async build(p) {
      const termId = p.get("termId") ?? (await db.term.findFirst({ where: { isCurrent: true } }))?.id;
      const recs = await db.attendanceRecord.findMany({ where: { session: { termId, type: "DAILY", ...(p.get("classId") ? { classId: p.get("classId")! } : {}) } }, include: { student: true, session: { include: { class: true } } } });
      const m = new Map<string, { id: string; name: string; cls: string; c: Record<string, number> }>();
      recs.forEach((r) => { const e = m.get(r.studentId) ?? { id: r.student.studentNumber, name: r.student.fullName, cls: r.session.class.name, c: {} }; e.c[r.status] = (e.c[r.status] ?? 0) + 1; m.set(r.studentId, e); });
      return { title: "Attendance summary (daily registers)", headers: ["Student ID", "Student", "Class", "Present", "Late", "Absent", "Excused", "Rate"], rows: [...m.values()].map((e) => { const t = Object.values(e.c).reduce((a, b) => a + b, 0); return [e.id, e.name, e.cls, e.c.PRESENT ?? 0, e.c.LATE ?? 0, e.c.ABSENT ?? 0, e.c.EXCUSED ?? 0, `${((((e.c.PRESENT ?? 0) + (e.c.LATE ?? 0)) / t) * 100).toFixed(1)}%`]; }) };
    },
  },
  fees: {
    permission: "finance.view",
    async build(p) {
      const termId = p.get("termId") ?? (await db.term.findFirst({ where: { isCurrent: true } }))?.id;
      const status = p.get("status");
      const obs = await db.studentFeeObligation.findMany({ where: { termId, ...(status ? { status: status as "PAID" } : {}), ...(p.get("classId") ? { enrollment: { classId: p.get("classId")! } } : {}) }, include: { student: true, enrollment: { include: { class: true } }, feeStructure: { include: { category: true } }, term: { include: { session: true } } }, orderBy: [{ enrollment: { class: { name: "asc" } } }, { student: { fullName: "asc" } }] });
      return { title: "School fees & outstanding balances", subtitle: [obs[0] ? termLabel(obs[0].term) : ""], headers: ["Student ID", "Student", "Class", "Category", "Billed", "Adjusted", "Paid", "Outstanding", "Status", "Deadline"], rows: obs.map((o) => [o.student.studentNumber, o.student.fullName, o.enrollment.class.name, o.feeStructure.category.name, o.amount.toString(), o.amountAdjusted.toString(), o.amountPaid.toString(), obligationOutstanding(o).toString(), o.status, formatDate(o.dueDate)]) };
    },
  },
  collections: {
    permission: "finance.view",
    async build(p) {
      const from = p.get("from") ? new Date(p.get("from")!) : new Date(Date.now() - 30 * 86400_000);
      const to = p.get("to") ? new Date(p.get("to")! + "T23:59:59") : new Date();
      const pays = await db.payment.findMany({ where: { verifiedAt: { gte: from, lte: to } }, include: { student: true, submission: { include: { term: { include: { session: true } } } } }, orderBy: { verifiedAt: "asc" } });
      return { title: "Payment collections", subtitle: [`${formatDate(from)} – ${formatDate(to)}`], headers: ["Verified on", "Confirmation", "Bank reference", "Student ID", "Student", "Term", "Amount"], rows: pays.map((x) => [formatDate(x.verifiedAt), x.confirmationNumber, x.transactionReference, x.student.studentNumber, x.student.fullName, x.submission ? termLabel(x.submission.term) : "", x.amount.toString()]) };
    },
  },
};
