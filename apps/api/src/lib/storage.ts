import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { env } from "@rootmail/core";

export interface StoredAsset {
  key: string;
  url: string;
}

/** Pluggable object store. The local driver is the default; swap an S3 driver
 * behind this same interface in production (keys/urls stay opaque to callers). */
export interface StorageDriver {
  put(key: string, body: Buffer): Promise<StoredAsset>;
  get(key: string): Promise<Buffer | null>;
}

class LocalStorage implements StorageDriver {
  private readonly dir = resolve(env.ASSET_STORAGE_DIR);
  private readonly base = env.ASSET_PUBLIC_URL.replace(/\/$/, "");

  async put(key: string, body: Buffer): Promise<StoredAsset> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, key), body);
    return { key, url: `${this.base}/${key}` };
  }

  async get(key: string): Promise<Buffer | null> {
    // Keys are server-generated (`ast_….ext`); the allowlist blocks slashes and
    // the `..` check blocks traversal, so the read stays inside the asset dir.
    if (!/^[a-z0-9_.-]+$/i.test(key) || key.includes("..")) return null;
    const path = join(this.dir, key);
    if (!existsSync(path)) return null;
    return readFile(path);
  }
}

export const storage: StorageDriver = new LocalStorage();
