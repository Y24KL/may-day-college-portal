import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type PDFImage } from "pdf-lib";

export const C = {
  navy: rgb(16 / 255, 28 / 255, 53 / 255),
  royal: rgb(49 / 255, 87 / 255, 200 / 255),
  gold: rgb(232 / 255, 183 / 255, 90 / 255),
  ink: rgb(32 / 255, 43 / 255, 69 / 255),
  muted: rgb(137 / 255, 147 / 255, 168 / 255),
  lavender: rgb(233 / 255, 236 / 255, 255 / 255),
  soft: rgb(248 / 255, 250 / 255, 255 / 255),
  white: rgb(1, 1, 1),
};

/** pdf-lib standard fonts are WinAnsi only — strip unsupported characters. */
export function safe(s: string | null | undefined): string {
  return (s ?? "").replace(/₦/g, "NGN ").replace(/[–—]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
}

export type Kit = {
  doc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  width: number;
  height: number;
  y: number;
  margin: number;
  newPage: () => void;
  text: (s: string, x: number, y: number, o?: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; maxWidth?: number }) => void;
  ensure: (h: number) => void;
};

export async function createKit(landscape = false): Promise<Kit> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const [w, h] = landscape ? [841.89, 595.28] : [595.28, 841.89];
  const kit: Kit = {
    doc,
    page: doc.addPage([w, h]),
    font,
    bold,
    width: w,
    height: h,
    margin: 36,
    y: h - 36,
    newPage() {
      kit.page = doc.addPage([w, h]);
      kit.y = h - kit.margin;
    },
    text(s, x, y, o = {}) {
      const f = o.bold ? bold : font;
      const size = o.size ?? 10;
      let str = safe(s);
      if (o.maxWidth) while (str.length > 1 && f.widthOfTextAtSize(str, size) > o.maxWidth) str = str.slice(0, -2) + "…".replace("…", ".");
      kit.page.drawText(str, { x, y, size, font: f, color: o.color ?? C.ink });
    },
    ensure(hNeeded) {
      if (kit.y - hNeeded < kit.margin) kit.newPage();
    },
  };
  return kit;
}

export async function embedImage(doc: PDFDocument, bytes: Buffer | null): Promise<PDFImage | null> {
  if (!bytes) return null;
  try {
    if (bytes[0] === 0x89) return await doc.embedPng(bytes);
    if (bytes[0] === 0xff) return await doc.embedJpg(bytes);
  } catch {
    /* ignore broken images */
  }
  return null;
}

/** Draw a simple table; returns new y. Columns widths in points. */
export function drawTable(kit: Kit, headers: string[], rows: string[][], widths: number[], o: { size?: number; rowH?: number } = {}) {
  const size = o.size ?? 9;
  const rowH = o.rowH ?? 18;
  const x0 = kit.margin;
  const total = widths.reduce((a, b) => a + b, 0);
  const header = () => {
    kit.ensure(rowH * 2);
    kit.page.drawRectangle({ x: x0, y: kit.y - rowH, width: total, height: rowH, color: C.navy });
    let x = x0;
    headers.forEach((h, i) => {
      kit.text(h, x + 4, kit.y - rowH + 6, { size, bold: true, color: C.white, maxWidth: widths[i] - 8 });
      x += widths[i];
    });
    kit.y -= rowH;
  };
  header();
  rows.forEach((r, ri) => {
    if (kit.y - rowH < kit.margin) {
      kit.newPage();
      header();
    }
    if (ri % 2 === 0) kit.page.drawRectangle({ x: x0, y: kit.y - rowH, width: total, height: rowH, color: C.soft });
    let x = x0;
    r.forEach((c, i) => {
      kit.text(c, x + 4, kit.y - rowH + 6, { size, maxWidth: widths[i] - 8 });
      x += widths[i];
    });
    kit.page.drawLine({ start: { x: x0, y: kit.y - rowH }, end: { x: x0 + total, y: kit.y - rowH }, thickness: 0.4, color: C.lavender });
    kit.y -= rowH;
  });
  return kit.y;
}

export async function header(kit: Kit, school: { name: string; address?: string | null; contact?: string | null; logo?: Buffer | null }, title: string) {
  const { page, width, margin } = kit;
  page.drawRectangle({ x: 0, y: kit.height - 92, width, height: 92, color: C.navy });
  page.drawRectangle({ x: 0, y: kit.height - 96, width, height: 4, color: C.gold });
  const logo = await embedImage(kit.doc, school.logo ?? null);
  let tx = margin;
  if (logo) {
    const s = logo.scaleToFit(60, 60);
    page.drawImage(logo, { x: margin, y: kit.height - 78, width: s.width, height: s.height });
    tx += 72;
  }
  kit.text(school.name, tx, kit.height - 42, { size: 18, bold: true, color: C.white });
  kit.text([school.address, school.contact].filter(Boolean).join("  |  "), tx, kit.height - 58, { size: 8.5, color: C.lavender });
  kit.text(title.toUpperCase(), tx, kit.height - 76, { size: 10, bold: true, color: C.gold });
  kit.y = kit.height - 116;
}

export function generatedFooter(kit: Kit, note: string) {
  const pages = kit.doc.getPages();
  pages.forEach((p, i) => {
    p.drawText(safe(`${note}  |  Page ${i + 1} of ${pages.length}`), { x: kit.margin, y: 18, size: 7.5, font: kit.font, color: C.muted });
  });
}
