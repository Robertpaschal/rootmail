import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { verifyViewToken } from "@rootmail/core";
import { db, messages } from "@rootmail/db";
import { unsubPage } from "../lib/unsub-page";

// PUBLIC "view this email in your browser". Serves the message's own stored
// rendered HTML, so a client that mangles the layout — or blocks every image —
// isn't the last word on what the email looked like.
//
// THIS SERVES CUSTOMER-AUTHORED HTML ON OUR ORIGIN
// ------------------------------------------------
// Templates support "paste your own HTML", so `rendered_html` is not
// necessarily something our serializer produced — it can contain <script>. That
// makes this endpoint a stored-XSS surface on the API origin unless it is
// locked down, which is what the CSP below is for: `default-src 'none'` with no
// script-src at all, so nothing executes no matter what is in the body. Images
// and inline styles are allowed because an email is nothing without them.
// Do not relax this to add script-src.
const CSP = [
  "default-src 'none'",
  "img-src https: http: data:",
  "style-src 'unsafe-inline'",
  "font-src https: data:",
  "frame-ancestors 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

/**
 * One page for "this link is dead", used for BOTH an unknown message and a
 * retention-scrubbed one. They must be indistinguishable: a distinct 404 would
 * turn this endpoint into an oracle for whether a given message ever existed.
 */
function gonePage(): string {
  return unsubPage(
    "This email is no longer available",
    "<p>The browser copy of this email has expired. If you still have the original in your inbox, it will keep working there.</p>",
  );
}

export async function viewInBrowserRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/view", async (req, reply) => {
    const { token } = req.query as { token?: string };
    const payload = token ? verifyViewToken(token) : null;

    reply
      .type("text/html")
      .header("Content-Security-Policy", CSP)
      .header("X-Content-Type-Options", "nosniff")
      // A hosted copy of someone's personalised mail must never be indexed, and
      // must not leak its URL (which is the credential) through the referer.
      .header("X-Robots-Tag", "noindex, nofollow, noarchive")
      .header("Referrer-Policy", "no-referrer")
      .header("Cache-Control", "private, no-store");

    if (!payload) return reply.code(404).send(gonePage());

    const [row] = await db
      .select({ html: messages.renderedHtml, subject: messages.subject })
      .from(messages)
      .where(eq(messages.id, payload.m))
      .limit(1);

    // `rendered_html` is nulled by the retention sweep (apps/worker/src/
    // retention.ts) along with the recipient's address and subject. That is the
    // link dying on purpose: once the message has been scrubbed there is
    // nothing left to show, and we shouldn't be keeping a public copy of
    // personal mail past the workspace's own retention window anyway.
    if (!row?.html) return reply.code(404).send(gonePage());

    return reply.send(row.html);
  });
}
