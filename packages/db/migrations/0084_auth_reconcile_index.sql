-- Only pending auth rows participate; ordinary mail is excluded.
CREATE INDEX "messages_auth_pending_expiry_idx" ON "messages" ("auth_expires_at")
WHERE "auth_expires_at" IS NOT NULL AND "status" IN ('queued', 'sending');
