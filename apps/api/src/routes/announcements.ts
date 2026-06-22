import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { verifyAnnouncementUnsubToken } from "@rootmail/core";
import { db, users } from "@rootmail/db";
import { escapeHtml, unsubPage } from "../lib/unsub-page";

export async function announcementRoutes(app: FastifyInstance): Promise<void> {
  // PUBLIC one-click opt-out from staff announcements. GET shows a confirmation
  // page; the &confirm=1 step performs the opt-out, so email-client link
  // prefetchers can't auto-unsubscribe. The token is HMAC-signed (can't forge).
  app.get("/v1/announcements/unsubscribe", async (req, reply) => {
    const { token, confirm } = req.query as { token?: string; confirm?: string };
    const email = token ? verifyAnnouncementUnsubToken(token) : null;
    if (!email) {
      return reply
        .type("text/html")
        .code(400)
        .send(unsubPage("Invalid link", "<p>This unsubscribe link is invalid or has expired.</p>"));
    }

    if (confirm === "1") {
      await db
        .update(users)
        .set({ announcementOptOutAt: new Date(), updatedAt: new Date() })
        .where(eq(users.email, email));
      return reply
        .type("text/html")
        .send(
          unsubPage(
            "Unsubscribed",
            "<p>You won't receive product announcements anymore. You'll still get essential account &amp; security emails.</p>",
          ),
        );
    }

    const href = `/v1/announcements/unsubscribe?token=${encodeURIComponent(token!)}&confirm=1`;
    return reply.type("text/html").send(
      unsubPage(
        "Unsubscribe",
        `<p>Stop sending product announcements to <strong>${escapeHtml(email)}</strong>?</p>` +
          `<p><a class="btn" href="${href}">Confirm unsubscribe</a></p>`,
      ),
    );
  });
}
