import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { Errors, newId } from "@rootmail/core";
import { assets, db } from "@rootmail/db";
import { requirePermission } from "../lib/permissions";
import { storage } from "../lib/storage";

// Allowlist keyed by the *sniffed* type — we never trust the client's declared
// content-type. Each entry verifies the leading magic bytes.
const ALLOWED: Array<{ mime: string; ext: string; sniff: (b: Buffer) => boolean }> = [
  { mime: "image/png", ext: "png", sniff: (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: "image/jpeg", ext: "jpg", sniff: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/gif", ext: "gif", sniff: (b) => b.subarray(0, 4).toString("ascii") === "GIF8" },
  {
    mime: "image/webp",
    ext: "webp",
    sniff: (b) => b.length > 12 && b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP",
  },
  { mime: "application/pdf", ext: "pdf", sniff: (b) => b.subarray(0, 4).toString("ascii") === "%PDF" },
];

const EXT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
};

export async function assetRoutes(app: FastifyInstance): Promise<void> {
  // --- Upload (authenticated) ---------------------------------------------
  app.post("/v1/assets", async (req, reply) => {
    await requirePermission(req, "content.manage");
    const data = await req.file();
    if (!data) throw Errors.badRequest("No file uploaded — send a multipart 'file' field.");

    const buf = await data.toBuffer();
    // @fastify/multipart flags truncation when the file exceeds the size limit.
    if (data.file.truncated) throw Errors.badRequest("File exceeds the upload size limit.");

    const match = ALLOWED.find((a) => a.sniff(buf));
    if (!match) {
      throw Errors.validation("Unsupported file type. Allowed: PNG, JPEG, GIF, WEBP, PDF.");
    }

    const id = newId("asset");
    const key = `${id}.${match.ext}`;
    const stored = await storage.put(key, buf);

    const [row] = await db
      .insert(assets)
      .values({
        id,
        workspaceId: req.auth.workspace.id,
        subTenantId: req.auth.subTenant?.id ?? null,
        filename: data.filename || key,
        contentType: match.mime,
        size: buf.length,
        storageKey: key,
        url: stored.url,
        createdBy: req.auth.user?.id ?? req.auth.apiKey?.id ?? null,
      })
      .returning();

    return reply.status(201).send({
      object: "asset",
      id: row.id,
      url: row.url,
      content_type: row.contentType,
      size: row.size,
      filename: row.filename,
    });
  });

  // --- List (authenticated; read baseline) --------------------------------
  app.get("/v1/assets", async (req) => {
    const rows = await db
      .select()
      .from(assets)
      .where(eq(assets.workspaceId, req.auth.workspace.id))
      .orderBy(desc(assets.createdAt))
      .limit(200);
    return {
      object: "list",
      data: rows.map((a) => ({
        object: "asset",
        id: a.id,
        url: a.url,
        content_type: a.contentType,
        size: a.size,
        filename: a.filename,
        created_at: a.createdAt,
      })),
    };
  });

  // --- Serve (PUBLIC; images are loaded by email clients with no auth) -----
  app.get("/assets/:name", async (req, reply) => {
    const { name } = req.params as { name: string };
    const buf = await storage.get(name);
    if (!buf) throw Errors.notFound("Asset not found");
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    return reply
      .type(EXT_TYPES[ext] ?? "application/octet-stream")
      .header("Cache-Control", "public, max-age=31536000, immutable")
      .send(buf);
  });
}
