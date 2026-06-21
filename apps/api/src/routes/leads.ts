import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { newId } from "@rootmail/core";
import { db, leads } from "@rootmail/db";
import { parse } from "../lib/validate";

// Public "Contact sales" submission. No auth — anyone can ask for an enterprise
// quote — so it's rate-limited per IP, length-capped on every field, and carries
// a honeypot. Staff work the resulting pipeline in apps/admin.
const leadBody = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  company: z.string().trim().max(160).optional(),
  website: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(40).optional(),
  company_size: z.string().trim().max(40).optional(),
  expected_volume: z.string().trim().max(80).optional(),
  current_provider: z.string().trim().max(120).optional(),
  message: z.string().trim().max(4000).optional(),
  source: z.string().trim().max(40).optional(),
  // Honeypot: a field hidden from humans. Bots fill it; if non-empty we silently
  // accept (so the bot sees success) but store nothing. Capped so it can't be used
  // as an oversized-payload vector.
  company_fax: z.string().max(200).optional(),
});

export async function leadRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/v1/leads",
    // Per-IP backstop against scripted spam (the honeypot + validation do the
    // rest). Generous enough that a real person never trips it.
    { config: { rateLimit: { max: 10, timeWindow: "10 minutes" } } },
    async (req, reply) => {
      const body = parse(leadBody, req.body);

      // Honeypot tripped → pretend success, drop the submission.
      if (body.company_fax && body.company_fax.trim() !== "") {
        return reply.code(202).send({ object: "lead", ok: true });
      }

      const ua = req.headers["user-agent"];
      await db.insert(leads).values({
        id: newId("lead"),
        name: body.name,
        email: body.email.toLowerCase(),
        company: body.company || null,
        website: body.website || null,
        phone: body.phone || null,
        companySize: body.company_size || null,
        expectedVolume: body.expected_volume || null,
        currentProvider: body.current_provider || null,
        message: body.message || null,
        source: body.source || "contact_form",
        ip: req.ip,
        userAgent: (Array.isArray(ua) ? ua[0] : ua)?.slice(0, 400) ?? null,
      });

      return reply.code(202).send({ object: "lead", ok: true });
    },
  );
}
