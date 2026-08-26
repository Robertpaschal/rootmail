import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Errors, encryptSecret, newId } from "@rootmail/core";
import { db, orgSendingProviders } from "@rootmail/db";
import { requirePermission } from "../lib/permissions";
import { checkSendingCredentials } from "../lib/provider-check";
import { parse } from "../lib/validate";

// Connecting your own sending account.
//
// rootmail's value to a platform that already sends email is the layer above the
// provider — per-client domains, per-client reputation, suppression, isolation,
// proof — not the delivery itself. Letting them keep their own provider means
// their mail leaves on their reputation, under approval they already hold, and
// our provider's opinion of us stops being a gate on their launch.

const connectBody = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("ses"),
    access_key_id: z.string().min(16),
    secret_access_key: z.string().min(16),
    region: z.string().min(2).default("us-east-1"),
  }),
  z.object({
    provider: z.literal("mailgun"),
    api_key: z.string().min(8),
    domain: z.string().min(3),
    region: z.enum(["us", "eu"]).default("us"),
  }),
]);

/** Never returns the credentials — only whether they work. */
function serialize(row: typeof orgSendingProviders.$inferSelect) {
  return {
    object: "sending_provider",
    id: row.id,
    provider: row.provider,
    sending_domain: row.sendingDomain,
    status: row.status,
    last_error: row.lastError,
    verified_at: row.verifiedAt,
    last_checked_at: row.lastCheckedAt,
  };
}

export async function sendingProviderRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/sending-provider", async (req) => {
    const [row] = await db
      .select()
      .from(orgSendingProviders)
      .where(eq(orgSendingProviders.organizationId, req.auth.workspace.organizationId))
      .limit(1);
    return row
      ? serialize(row)
      : {
          object: "sending_provider",
          connected: false,
          note: "Your mail is sending through rootmail's own account. Connect your own provider and it will send from yours instead — your domains, your reputation, your limits.",
        };
  });

  app.post("/v1/sending-provider", async (req) => {
    await requirePermission(req, "domains.manage");
    const body = parse(connectBody, req.body);
    const orgId = req.auth.workspace.organizationId;

    // Checked BEFORE it is stored. A credential that fails here would fail
    // mid-campaign otherwise, and "we saved it, it just doesn't work" is the
    // worst version of this feature.
    const check = await checkSendingCredentials(body);
    if (!check.ok) {
      throw Errors.badRequest(`Those credentials didn't work: ${check.reason}`);
    }

    const credentials = encryptSecret(
      JSON.stringify(
        body.provider === "ses"
          ? { accessKeyId: body.access_key_id, secretAccessKey: body.secret_access_key, region: body.region }
          : { apiKey: body.api_key, domain: body.domain, region: body.region },
      ),
    );
    const sendingDomain = body.provider === "mailgun" ? body.domain : (check.domain ?? null);
    const now = new Date();

    const [existing] = await db
      .select({ id: orgSendingProviders.id })
      .from(orgSendingProviders)
      .where(eq(orgSendingProviders.organizationId, orgId))
      .limit(1);

    const values = {
      provider: body.provider,
      credentials,
      sendingDomain,
      status: "active",
      lastError: null,
      lastCheckedAt: now,
      verifiedAt: now,
      updatedAt: now,
    };

    const [row] = existing
      ? await db
          .update(orgSendingProviders)
          .set(values)
          .where(eq(orgSendingProviders.id, existing.id))
          .returning()
      : await db
          .insert(orgSendingProviders)
          .values({ id: newId("sendingProvider"), organizationId: orgId, ...values })
          .returning();

    return {
      ...serialize(row),
      note: `Connected. New mail sends through your own ${body.provider === "ses" ? "Amazon SES" : "Mailgun"} account — on your reputation and your limits, not ours.`,
    };
  });

  app.delete("/v1/sending-provider", async (req) => {
    await requirePermission(req, "domains.manage");
    const orgId = req.auth.workspace.organizationId;
    const [row] = await db
      .select()
      .from(orgSendingProviders)
      .where(eq(orgSendingProviders.organizationId, orgId))
      .limit(1);
    if (!row) throw Errors.notFound("No sending provider is connected.");

    await db.delete(orgSendingProviders).where(eq(orgSendingProviders.id, row.id));
    return {
      object: "sending_provider",
      disconnected: true,
      note: "Your mail will send through rootmail's own account again, subject to its limits.",
    };
  });
}
