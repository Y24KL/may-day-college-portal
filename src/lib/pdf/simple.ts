import { db } from "@/lib/db";
import { createKit, header, drawTable, generatedFooter } from "./kit";
import { readFileBytes } from "@/lib/storage/files";
import { formatDateTime } from "@/lib/utils";

/** Generic branded tabular PDF (timetables, registration slips, reports). */
export async function tablePdf(opts: { title: string; subtitle?: string[]; headers: string[]; rows: string[][]; widths?: number[]; landscape?: boolean }) {
  const settings = await db.schoolSettings.findUniqueOrThrow({ where: { id: "school" } });
  const kit = await createKit(opts.landscape);
  await header(kit, { name: settings.schoolName, address: settings.address, contact: [settings.phone, settings.email].filter(Boolean).join(" / "), logo: await readFileBytes(settings.logoFileId) }, opts.title);
  for (const s of opts.subtitle ?? []) {
    kit.text(s, kit.margin, kit.y, { size: 10 });
    kit.y -= 15;
  }
  kit.y -= 6;
  const avail = kit.width - kit.margin * 2;
  const widths = opts.widths ?? opts.headers.map(() => avail / opts.headers.length);
  if (opts.rows.length) drawTable(kit, opts.headers, opts.rows, widths);
  else kit.text("No records.", kit.margin, kit.y, { size: 10 });
  generatedFooter(kit, `${settings.schoolName} - generated ${formatDateTime(new Date())}`);
  return Buffer.from(await kit.doc.save());
}

export function pdfResponse(bytes: Buffer, filename: string) {
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${filename}"`, "Cache-Control": "private, no-store" },
  });
}
