import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canAccessFile } from "@/lib/storage/files";
import { storage } from "@/lib/storage/driver";

export const dynamic = "force-dynamic";

/**
 * The ONLY way to download a stored file. Re-checks authorisation, then
 * redirects to a 5-minute signed R2 URL (or streams in local development).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await db.uploadedDocument.findUnique({ where: { id } });
  const user = await getCurrentUser();
  if (!doc || !(await canAccessFile(user, doc))) return new Response("Not found", { status: 404 });
  const download = new URL(req.url).searchParams.get("download") === "1";
  const drv = storage();
  if (doc.purpose !== "SCHOOL_LOGO") {
    const url = await drv.signedUrl(doc.storageKey, doc.originalName, 300);
    if (url) return Response.redirect(url, 302);
  }
  const bytes = await drv.get(doc.storageKey);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${doc.originalName.replace(/[^\w.\- ]/g, "_")}"`,
      "Cache-Control": doc.purpose === "SCHOOL_LOGO" ? "public, max-age=3600" : "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
