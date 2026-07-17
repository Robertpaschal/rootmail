import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { DeleteObjectCommand, GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "@rootmail/core";

export interface StoredAsset {
  key: string;
  url: string;
}

/** Pluggable object store. The local driver is the default; the S3 driver swaps
 * in behind this same interface when ASSET_S3_BUCKET is set (keys/urls stay
 * opaque to callers). */
export interface StorageDriver {
  put(key: string, body: Buffer): Promise<StoredAsset>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

// Server-generated keys are `ast_….ext`; the allowlist blocks slashes and the
// `..` check blocks traversal, so reads stay scoped to our namespace.
function isSafeKey(key: string): boolean {
  return /^[a-z0-9_.-]+$/i.test(key) && !key.includes("..");
}

// Minimal ext→mime map so stored objects carry a content-type (used if assets
// are ever served straight from S3/CloudFront instead of through our API).
const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
};

function contentTypeFor(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

const CACHE_CONTROL = "public, max-age=31536000, immutable";

class LocalStorage implements StorageDriver {
  private readonly dir = resolve(env.ASSET_STORAGE_DIR);
  private readonly base = env.ASSET_PUBLIC_URL.replace(/\/$/, "");

  async put(key: string, body: Buffer): Promise<StoredAsset> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, key), body);
    return { key, url: `${this.base}/${key}` };
  }

  async get(key: string): Promise<Buffer | null> {
    if (!isSafeKey(key)) return null;
    const path = join(this.dir, key);
    if (!existsSync(path)) return null;
    return readFile(path);
  }

  async delete(key: string): Promise<void> {
    if (!isSafeKey(key)) return;
    // `force` makes a missing file a no-op — deletes stay idempotent.
    await rm(join(this.dir, key), { force: true });
  }
}

/**
 * S3 object store. Objects live in a (private) bucket; assets are still served
 * through our API at ASSET_PUBLIC_URL/<key> (so the bucket needs no public
 * access). A CDN can later point straight at the bucket — Phase 8.
 */
class S3Storage implements StorageDriver {
  private readonly client: S3Client;
  private readonly base = env.ASSET_PUBLIC_URL.replace(/\/$/, "");

  constructor(private readonly bucket: string) {
    // Region + credentials resolve via the SDK's default chain (AWS_REGION,
    // AWS_ACCESS_KEY_ID/SECRET, or an instance role in prod).
    this.client = new S3Client(env.AWS_REGION ? { region: env.AWS_REGION } : {});
  }

  async put(key: string, body: Buffer): Promise<StoredAsset> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentTypeFor(key),
        CacheControl: CACHE_CONTROL,
      }),
    );
    return { key, url: `${this.base}/${key}` };
  }

  async get(key: string): Promise<Buffer | null> {
    if (!isSafeKey(key)) return null;
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      const bytes = await res.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch (err) {
      // A missing object is a 404, not an error.
      if (err instanceof NoSuchKey) return null;
      if ((err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    if (!isSafeKey(key)) return;
    // S3 DeleteObject is idempotent — a missing key returns success.
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

function createStorage(): StorageDriver {
  return env.ASSET_S3_BUCKET ? new S3Storage(env.ASSET_S3_BUCKET) : new LocalStorage();
}

export const storage: StorageDriver = createStorage();
