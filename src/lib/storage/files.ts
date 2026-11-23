import { createHash, randomBytes } from "node:crypto";
import type { DocumentPurpose, UploadedDocument } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { storage } from "./driver";
import type { CurrentUser } from "@/lib/auth/current-user";

export const PREFIX: Record<DocumentPurpose, string> = {
  STUDENT_PHOTO: "students",
  TEACHER_PHOTO: "teachers",
  TEACHER_DOCUMENT: "teachers",
  PAYMENT_RECEIPT: "payments",
  PAYMENT_CONFIRMATION: "payments",
  REPORT_CARD: "report-cards",
  RESULT_DOCUMENT: "results",
  ANNOUNCEMENT_IMAGE: "announcements",
  ANNOUNCEMENT_ATTACHMENT: "announcements",
  SCHOOL_LOGO: "school-documents",
  SCHOOL_DOCUMENT: "school-documents",
};

type Kind = "pdf" | "jpeg" | "png";
const MIME: Record<Kind, string> = { pdf: "application/pdf", jpeg: "image/jpeg", png: "image/png" };

/** Allowed types and max raw sizes per purpose. */
export const RULES: Record<DocumentPurpose, { kinds: Kind[]; maxBytes: number }> = {
  STUDENT_PHOTO: { kinds: ["jpeg", "png"], maxBytes: 4 * 1024 * 1024 },
  TEACHER_PHOTO: { kinds: ["jpeg", "png"], maxBytes: 4 * 1024 * 1024 },
  TEACHER_DOCUMENT: { kinds: ["pdf", "jpeg", "png"], maxBytes: 5 * 1024 * 1024 },
  PAYMENT_RECEIPT: { kinds: ["pdf", "jpeg", "png"], maxBytes: 5 * 1024 * 1024 },
  PAYMENT_CONFIRMATION: { kinds: ["pdf"], maxBytes: 5 * 1024 * 1024 },
  REPORT_CARD: { kinds: ["pdf"], maxBytes: 10 * 1024 * 1024 },
  RESULT_DOCUMENT: { kinds: ["pdf"], maxBytes: 10 * 1024 * 1024 },
  ANNOUNCEMENT_IMAGE: { kinds: ["jpeg", "png"], maxBytes: 4 * 1024 * 1024 },
  ANNOUNCEMENT_ATTACHMENT: { kinds: ["pdf", "jpeg", "png"], maxBytes: 5 * 1024 * 1024 },
  SCHOOL_LOGO: { kinds: ["png", "jpeg"], maxBytes: 2 * 1024 * 1024 },
  SCHOOL_DOCUMENT: { kinds: ["pdf", "jpeg", "png"], maxBytes: 10 * 1024 * 1024 },
};

/** Detect file type from magic bytes — the browser-supplied MIME is never trusted. */
export function sniff(buf: Buffer): Kind | null {
  if (buf.length >= 5 && buf.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  return null;
}

export class UploadError extends Error {}

const PHOTO_PURPOSES: DocumentPurpose[] = ["STUDENT_PHOTO", "TEACHER_PHOTO", "ANNOUNCEMENT_IMAGE"];

export async function saveUpload(args: {
  file: File | { name: string; buffer: Buffer };
  purpose: DocumentPurpose;
  uploadedById?: string | null;
  studentId?: string | null;
  teacherApplicationId?: string | null;
  announcementId?: string | null;
  tx?: Tx;
}): Promise<UploadedDocument> {
  const tx = args.tx ?? db;
  const rule = RULES[args.purpose];
  let bytes: Buffer;
  let name: string;
  if ("buffer" in args.file && Buffer.isBuffer(args.file.buffer)) {
    bytes = args.file.buffer;
    name = args.file.name;
  } else {
    if (!(args.file instanceof Blob)) throw new UploadError("No file received.");
    if (args.file.size === 0) throw new UploadError("The selected file is empty.");
    if (args.file.size > rule.maxBytes) throw new UploadError(`File is too large (max ${Math.round(rule.maxBytes / 1024 / 1024)} MB).`);
    bytes = Buffer.from(await args.file.arrayBuffer());
    name = args.file.name || "upload";
  }
  if (bytes.length > rule.maxBytes) throw new UploadError(`File is too large (max ${Math.round(rule.maxBytes / 1024 / 1024)} MB).`);
  let kind = sniff(bytes);
  if (!kind || !rule.kinds.includes(kind)) {
    throw new UploadError(`Unsupported file type. Allowed: ${rule.kinds.map((k) => k.toUpperCase()).join(", ")}.`);
  }

  // Compress photographs (and strip EXIF/GPS metadata).
  if (PHOTO_PURPOSES.includes(args.purpose)) {
    try {
      const sharp = (await import("sharp")).default;
      bytes = await sharp(bytes).rotate().resize({ width: 900, height: 900, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
      kind = "jpeg";
      name = name.replace(/\.(png|jpe?g)$/i, "") + ".jpg";
    } catch {
      throw new UploadError("The image could not be processed. Please upload a valid JPG or PNG.");
    }
  }

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  // De-duplicate identical re-uploads by the same user for the same purpose.
  if (args.uploadedById) {
    const existing = await tx.uploadedDocument.findFirst({
      where: { uploadedById: args.uploadedById, sha256, purpose: args.purpose, deletedAt: null, studentId: args.studentId ?? undefined },
    });
    if (existing && args.purpose !== "PAYMENT_RECEIPT") return existing;
  }

  const ext = kind === "jpeg" ? "jpg" : kind;
  const key = `${PREFIX[args.purpose]}/${args.purpose.toLowerCase()}/${new Date().toISOString().slice(0, 7)}/${randomBytes(16).toString("hex")}.${ext}`;
  await storage().put(key, bytes, MIME[kind]);
  return tx.uploadedDocument.create({
    data: {
      storageKey: key,
      purpose: args.purpose,
      originalName: name.slice(0, 200),
      mimeType: MIME[kind],
      size: bytes.length,
      sha256,
      uploadedById: args.uploadedById ?? null,
      studentId: args.studentId ?? null,
      teacherApplicationId: args.teacherApplicationId ?? null,
      announcementId: args.announcementId ?? null,
    },
  });
}

export async function readFileBytes(fileId: string | null | undefined): Promise<Buffer | null> {
  if (!fileId) return null;
  const doc = await db.uploadedDocument.findUnique({ where: { id: fileId } });
  if (!doc || doc.deletedAt) return null;
  try {
    return await storage().get(doc.storageKey);
  } catch {
    return null;
  }
}

export async function storageUsageBytes(): Promise<number> {
  const agg = await db.uploadedDocument.aggregate({ _sum: { size: true }, where: { deletedAt: null } });
  return agg._sum.size ?? 0;
}

/**
 * Authorisation for private files. Every download goes through this check.
 */
export async function canAccessFile(user: CurrentUser | null, doc: UploadedDocument): Promise<boolean> {
  if (doc.deletedAt) return false;
  if (doc.purpose === "SCHOOL_LOGO") return true; // branding is public
  if (!user) return false;
  if (doc.uploadedById && doc.uploadedById === user.id) return true;

  if (user.isAdmin) {
    const p = user.permissions;
    switch (doc.purpose) {
      case "STUDENT_PHOTO":
        return p.has("students.view");
      case "TEACHER_PHOTO":
      case "TEACHER_DOCUMENT":
        return p.has("teachers.view");
      case "PAYMENT_RECEIPT":
      case "PAYMENT_CONFIRMATION":
        return p.has("finance.view") || p.has("finance.verify");
      case "REPORT_CARD":
      case "RESULT_DOCUMENT":
        // Academic records: results officers only (least privilege — not finance).
        return p.has("results.review") || p.has("results.publish") || p.has("reportcards.configure");
      default:
        return true;
    }
  }

  if (doc.purpose === "ANNOUNCEMENT_IMAGE" || doc.purpose === "ANNOUNCEMENT_ATTACHMENT" || doc.purpose === "SCHOOL_DOCUMENT") {
    return Boolean(user.studentId || user.teacherId || user.parentId);
  }

  if (doc.studentId) {
    if (user.studentId === doc.studentId) return true;
    if (user.parentId) {
      const rel = await db.parentStudentRelationship.findFirst({ where: { parentId: user.parentId, studentId: doc.studentId, status: "VERIFIED" } });
      if (rel) return true;
    }
    if (user.teacherId && doc.purpose === "STUDENT_PHOTO") {
      const { teacherCanAccessStudent } = await import("@/lib/access");
      return teacherCanAccessStudent(user.teacherId, doc.studentId);
    }
  }
  return false;
}
