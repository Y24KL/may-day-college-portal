import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "@/lib/env";

/**
 * Storage driver. Production uses a PRIVATE Cloudflare R2 bucket via the S3
 * API. When R2 is not configured outside production, a private local folder
 * is used so development works offline. Production refuses to fall back to
 * the (ephemeral) Render filesystem.
 */
export interface StorageDriver {
  kind: "r2" | "local";
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  /** Short-lived URL for direct download, or null if the app must stream. */
  signedUrl(key: string, filename: string, expiresSec?: number): Promise<string | null>;
  ping(): Promise<boolean>;
}

let s3: S3Client | null = null;
function client() {
  if (!s3) {
    const r = env.r2;
    s3 = new S3Client({ region: "auto", endpoint: r.endpoint, credentials: { accessKeyId: r.accessKeyId, secretAccessKey: r.secretAccessKey } });
  }
  return s3;
}

const r2Driver: StorageDriver = {
  kind: "r2",
  async put(key, body, contentType) {
    await client().send(new PutObjectCommand({ Bucket: env.r2.bucket, Key: key, Body: body, ContentType: contentType }));
  },
  async get(key) {
    const out = await client().send(new GetObjectCommand({ Bucket: env.r2.bucket, Key: key }));
    return Buffer.from(await out.Body!.transformToByteArray());
  },
  async delete(key) {
    await client().send(new DeleteObjectCommand({ Bucket: env.r2.bucket, Key: key }));
  },
  async signedUrl(key, filename, expiresSec = 300) {
    return getSignedUrl(
      client(),
      new GetObjectCommand({ Bucket: env.r2.bucket, Key: key, ResponseContentDisposition: `inline; filename="${filename.replace(/[^\w.\- ]/g, "_")}"` }),
      { expiresIn: expiresSec },
    );
  },
  async ping() {
    try {
      await client().send(new HeadBucketCommand({ Bucket: env.r2.bucket }));
      return true;
    } catch {
      return false;
    }
  },
};

function localPath(key: string) {
  const root = path.resolve(process.cwd(), env.localStorageDir);
  const p = path.resolve(root, key);
  if (!p.startsWith(root + path.sep)) throw new Error("Invalid storage key");
  return p;
}

const localDriver: StorageDriver = {
  kind: "local",
  async put(key, body) {
    const p = localPath(key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, body);
  },
  async get(key) {
    return fs.readFile(localPath(key));
  },
  async delete(key) {
    await fs.rm(localPath(key), { force: true });
  },
  async signedUrl() {
    return null;
  },
  async ping() {
    return true;
  },
};

export function storage(): StorageDriver {
  if (env.r2Configured) return r2Driver;
  if (env.isProd && process.env.ALLOW_LOCAL_STORAGE !== "true") {
    throw new Error("Cloudflare R2 is not configured (R2_* environment variables). Refusing to store files on the ephemeral filesystem.");
  }
  return localDriver;
}

export function storageConfigured(): boolean {
  return env.r2Configured || !env.isProd;
}
