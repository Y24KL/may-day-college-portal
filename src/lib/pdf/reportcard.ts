import QRCode from "qrcode";
import { db } from "@/lib/db";
import { createKit, header, drawTable, embedImage, C, generatedFooter, safe } from "./kit";
import { readFileBytes, saveUpload } from "@/lib/storage/files";
import { makeReference } from "@/lib/counters";
import { env } from "@/lib/env";
import { attendanceSummary } from "@/lib/academic";
import { boundariesForSession } from "@/lib/results";
import { formatDate } from "@/lib/utils";
import { randomBytes } from "node:crypto";

/**
 * Build the report card PDF for a PUBLISHED Result. Refuses unpublished data.
 */
export async function buildReportCardPdf(resultId: string, reference: string, verifyCode: string): Promise<Buffer> {
  const r = await db.result.findUniqueOrThrow({
    where: { id: resultId },
    include: { student: true, class: { include: { level: true, sector: true } }, term: { include: { session: true } } },
  });
  if (r.status !== "PUBLISHED") throw new Error("Report cards can only be generated from published results.");
  const [settings, template, details, att, cfg, nextTerm] = await Promise.all([
    db.schoolSettings.findUniqueOrThrow({ where: { id: "school" } }),
    db.reportCardTemplate.findFirst({ where: { isDefault: true } }),
    db.resultDetail.findMany({
      where: { studentId: r.studentId, termId: r.termId, submission: { status: "PUBLISHED", offering: { classId: r.classId } } },
      include: { submission: { include: { offering: { include: { subject: true } } } } },
    }),
    attendanceSummary(r.studentId, r.termId),
    boundariesForSession(r.term.sessionId),
    db.term.findFirst({ where: { OR: [{ sessionId: r.term.sessionId, order: r.term.order + 1 }] } }),
  ]);
  details.sort((a, b) => a.submission.offering.subject.name.localeCompare(b.submission.offering.subject.name));

  const kit = await createKit();
  await header(kit, { name: settings.schoolName, address: settings.address, contact: [settings.phone, settings.email].filter(Boolean).join(" / "), logo: await readFileBytes(settings.logoFileId) }, "Student Report Card");

  // Student panel
  const photo = await embedImage(kit.doc, await readFileBytes(r.student.photoFileId));
  const top = kit.y;
  kit.page.drawRectangle({ x: kit.margin, y: top - 92, width: kit.width - kit.margin * 2, height: 92, color: C.soft, borderColor: C.lavender, borderWidth: 1 });
  if (photo) {
    const s = photo.scaleToFit(70, 80);
    kit.page.drawImage(photo, { x: kit.width - kit.margin - 80, y: top - 86, width: s.width, height: s.height });
  }
  const info: [string, string][] = [
    ["Name", r.student.fullName],
    ["Student ID", r.student.studentNumber],
    ["Class", r.class.name],
    ["Sector", r.class.sector.name],
    ["Session", r.term.session.name],
    ["Term", r.term.name],
  ];
  info.forEach(([k, v], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = kit.margin + 12 + col * 220, y = top - 22 - row * 24;
    kit.text(k.toUpperCase(), x, y + 9, { size: 6.5, color: C.muted, bold: true });
    kit.text(v, x, y - 2, { size: 10, bold: true, maxWidth: 200 });
  });
  kit.y = top - 108;

  // Academic table
  const rows = details.map((d) => [
    d.submission.offering.subject.name,
    d.caScore?.toString() ?? "-",
    d.examScore?.toString() ?? "-",
    d.total?.toString() ?? "-",
    d.grade ?? "-",
    d.gradeDescription ?? "",
    d.teacherRemark ?? "",
  ]);
  const caMax = details[0]?.submission.caMax ?? cfg?.caMax ?? 40;
  const exMax = details[0]?.submission.examMax ?? cfg?.examMax ?? 60;
  drawTable(kit, ["Subject", `CA (${caMax})`, `Exam (${exMax})`, `Total (${caMax + exMax})`, "Grade", "Remark", "Teacher's comment"], rows, [128, 50, 56, 60, 40, 70, 119]);
  kit.y -= 12;

  // Summary boxes
  kit.ensure(70);
  const showPos = settings.showClassPosition && (template?.showPosition ?? true) && r.position;
  const boxes: [string, string][] = [
    ["Total marks", r.totalMarks.toString()],
    ["Average", `${r.average.toString()}%`],
    ["Subjects", String(r.subjectCount)],
    ...(showPos ? ([["Position", `${r.position} of ${r.classSize}`]] as [string, string][]) : []),
  ];
  if (template?.showAttendance ?? true) {
    boxes.push(["Attendance", att.percentage === null ? "No record" : `${att.present + att.late}/${att.total} (${att.percentage}%)`]);
  }
  const bw = (kit.width - kit.margin * 2 - (boxes.length - 1) * 8) / boxes.length;
  boxes.forEach(([k, v], i) => {
    const x = kit.margin + i * (bw + 8);
    kit.page.drawRectangle({ x, y: kit.y - 46, width: bw, height: 46, color: C.lavender });
    kit.text(k.toUpperCase(), x + 8, kit.y - 16, { size: 6.5, bold: true, color: C.muted });
    kit.text(v, x + 8, kit.y - 34, { size: 11, bold: true, color: C.navy, maxWidth: bw - 16 });
  });
  kit.y -= 60;
  if (att.total) {
    kit.text(`Attendance: days/sessions recorded ${att.total}, present ${att.present}, late ${att.late}, absent ${att.absent}, excused ${att.excused}.`, kit.margin, kit.y, { size: 8.5, color: C.ink });
    kit.y -= 16;
  }

  // Remarks
  kit.ensure(80);
  for (const [label, val] of [["Class teacher's remark", r.classTeacherRemark], ["Principal's remark", r.principalRemark]] as const) {
    kit.text(label, kit.margin, kit.y, { size: 8, bold: true, color: C.muted });
    kit.text(val || "-", kit.margin, kit.y - 13, { size: 10, maxWidth: kit.width - kit.margin * 2 });
    kit.y -= 32;
  }
  const resumption = r.term.nextResumptionDate ?? nextTerm?.startDate;
  if (resumption) {
    kit.text(`Next term resumes: ${formatDate(resumption, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`, kit.margin, kit.y, { size: 9.5, bold: true, color: C.royal });
    kit.y -= 20;
  }

  // Grading key
  if ((template?.showGradingKey ?? true) && cfg) {
    kit.ensure(30);
    const key = cfg.boundaries.sort((a, b) => b.minScore - a.minScore).map((b) => `${b.grade}: ${b.minScore}-${b.maxScore} ${b.description}`).join("   ");
    kit.text("Grading key", kit.margin, kit.y, { size: 7.5, bold: true, color: C.muted });
    const words = safe(key).split("   ");
    let line = "";
    kit.y -= 11;
    for (const w of words) {
      if (kit.font.widthOfTextAtSize(line + "   " + w, 7.5) > kit.width - kit.margin * 2) {
        kit.text(line, kit.margin, kit.y, { size: 7.5 });
        kit.y -= 10;
        line = w;
      } else line = line ? line + "   " + w : w;
    }
    if (line) kit.text(line, kit.margin, kit.y, { size: 7.5 });
    kit.y -= 18;
  }

  // Signatures, stamp, QR
  kit.ensure(110);
  const labels = (template?.signatureLabels || "Class Teacher,Principal").split(",").map((s) => s.trim()).filter(Boolean);
  const sigY = kit.y - 50;
  labels.forEach((l, i) => {
    const x = kit.margin + i * 150;
    kit.page.drawLine({ start: { x, y: sigY }, end: { x: x + 130, y: sigY }, thickness: 0.8, color: C.ink });
    kit.text(l === "Principal" && (template?.principalName || settings.principalName) ? `${l} (${template?.principalName || settings.principalName})` : `${l}'s signature`, x, sigY - 11, { size: 7.5, color: C.muted, maxWidth: 140 });
  });
  if (template?.showStampArea ?? true) {
    const sx = kit.margin + labels.length * 150;
    kit.page.drawRectangle({ x: sx, y: sigY - 14, width: 90, height: 70, borderColor: C.muted, borderWidth: 0.8, borderDashArray: [3, 3] });
    kit.text("School stamp", sx + 20, sigY + 22, { size: 7.5, color: C.muted });
  }
  const url = `${env.appBaseUrl}/verify/${verifyCode}`;
  const qr = await kit.doc.embedPng(await QRCode.toBuffer(url, { margin: 1, width: 220 }));
  kit.page.drawImage(qr, { x: kit.width - kit.margin - 80, y: sigY - 20, width: 80, height: 80 });
  kit.text("Scan to verify", kit.width - kit.margin - 72, sigY - 30, { size: 7, color: C.muted });
  kit.y = sigY - 46;
  kit.text(`Reference: ${reference}`, kit.margin, kit.y, { size: 8, bold: true });
  if (template?.footerNote) kit.text(template.footerNote, kit.margin, kit.y - 12, { size: 7.5, color: C.muted, maxWidth: kit.width - kit.margin * 2 });
  generatedFooter(kit, `${settings.schoolName} - generated ${formatDate(new Date())} - verify at ${env.appBaseUrl}/verify`);
  return Buffer.from(await kit.doc.save());
}

/**
 * Generate (or regenerate) report cards for Result ids. A regeneration
 * creates a new version and marks the previous one SUPERSEDED (history kept).
 */
export async function generateReportCards(resultIds: string[]) {
  let done = 0;
  for (const resultId of resultIds) {
    const result = await db.result.findUnique({ where: { id: resultId } });
    if (!result || result.status !== "PUBLISHED") continue;
    const last = await db.reportCard.findFirst({ where: { resultId }, orderBy: { version: "desc" } });
    const reference = makeReference("MDC-RC");
    const code = randomBytes(12).toString("base64url");
    const pdf = await buildReportCardPdf(resultId, reference, code);
    const file = await saveUpload({ file: { name: `report-card-${reference}.pdf`, buffer: pdf }, purpose: "REPORT_CARD", studentId: result.studentId });
    await db.$transaction(async (tx) => {
      if (last) await tx.reportCard.updateMany({ where: { resultId, status: "ACTIVE" }, data: { status: "SUPERSEDED" } });
      const rc = await tx.reportCard.create({ data: { reference, resultId, studentId: result.studentId, termId: result.termId, version: (last?.version ?? 0) + 1, fileId: file.id } });
      await tx.documentVerification.create({ data: { code, documentType: "REPORT_CARD", reportCardId: rc.id } });
    });
    done++;
  }
  return done;
}
