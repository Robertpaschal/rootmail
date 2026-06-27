import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  env,
  Errors,
  generateRecoveryCode,
  generateTotpSecret,
  hashPassword,
  sendSystemEmail,
  sha256Hex,
  signMfaChallenge,
  totpUri,
  verifyMfaChallenge,
  verifyPassword,
  verifyTotp,
} from "@rootmail/core";
import { db, impersonationGrants, sessions, type User, users } from "@rootmail/db";
import {
  createSession,
  defaultWorkspaceForUser,
  deleteSession,
  provisionAccount,
  resolveSession,
  upsertOAuthUser,
  userWorkspaces,
  workspaceForUser,
} from "../lib/auth";
import { consumeAuthToken, createAuthToken } from "../lib/auth-tokens";
import { passwordResetEmail, verificationEmail, welcomeEmail } from "../lib/emails";
import { clearAuthFailures, isLockedOut, recordAuthFailure } from "../lib/login-throttle";
import { signupAllowed } from "../lib/signup-limit";
import { serializeUser, serializeWorkspace } from "../lib/serialize";
import { parse } from "../lib/validate";

const signupBody = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Use at least 8 characters."),
  name: z.string().min(1).max(120).optional(),
  organization_name: z.string().min(1).max(120).optional(),
});

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const oauthBody = z.object({
  provider: z.string().min(1),
  email: z.string().email(),
  name: z.string().optional(),
  email_verified: z.boolean().optional(),
});

const mfaVerifyBody = z
  .object({
    mfa_token: z.string().min(1),
    code: z.string().optional(),
    recovery_code: z.string().optional(),
  })
  .refine((b) => Boolean(b.code || b.recovery_code), {
    message: "Provide an authenticator code or a recovery code.",
  });

const mfaActivateBody = z.object({ code: z.string().min(6) });
const mfaDisableBody = z.object({ code: z.string().optional(), password: z.string().optional() });

const verifyEmailBody = z.object({ token: z.string().min(1) });
const forgotPasswordBody = z.object({ email: z.string().email() });
const resetPasswordBody = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Use at least 8 characters."),
});

const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

function bearerToken(req: FastifyRequest): string | undefined {
  const header = req.headers.authorization;
  if (!header) return undefined;
  const [scheme, token] = header.split(" ");
  if (!token || scheme?.toLowerCase() !== "bearer") return undefined;
  return token.trim();
}

async function requireSession(req: FastifyRequest) {
  const token = bearerToken(req);
  if (!token) throw Errors.unauthorized();
  const resolved = await resolveSession(token);
  if (!resolved) throw Errors.unauthorized();
  return resolved;
}

/** Mint a session and build the post-authentication payload (login + mfa/verify). */
async function sessionResponse(
  user: User,
  opts: { impersonatedByStaffId?: string; ttlMs?: number } = {},
) {
  const workspaces = await userWorkspaces(user.id);
  const live = workspaces.find((w) => w.environment === "live") ?? workspaces[0] ?? null;
  const { token, session } = await createSession(user.id, live?.id ?? null, opts);
  return {
    user: serializeUser(user),
    workspaces: workspaces.map(serializeWorkspace),
    active_workspace: live ? serializeWorkspace(live) : null,
    session_token: token,
    session_expires_at: session.expiresAt,
    impersonating: session.impersonatedByStaffId != null,
  };
}

/** Issue an email-verification token and enqueue the verification email. */
async function sendVerificationEmail(user: { id: string; email: string; name: string | null }): Promise<void> {
  const token = await createAuthToken(user.id, "email_verify", EMAIL_VERIFY_TTL_MS);
  const mail = verificationEmail(token, user.name);
  await sendSystemEmail({ to: user.email, subject: mail.subject, html: mail.html, text: mail.text });
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // --- Sign up ------------------------------------------------------------
  app.post("/v1/auth/signup", async (req, reply) => {
    // Anti-abuse: cap sign-ups per source IP.
    if (!(await signupAllowed(req.ip))) {
      throw Errors.rateLimited("Too many sign-ups from this network. Please try again later.");
    }
    const body = parse(signupBody, req.body);
    const email = body.email.toLowerCase();

    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing) throw Errors.conflict("An account with that email already exists.");

    const account = await provisionAccount({
      email,
      passwordHash: hashPassword(body.password),
      name: body.name,
      organizationName: body.organization_name,
    });

    const { token, session } = await createSession(account.user.id, account.production.id);

    // Kick off email verification (best-effort — never fail signup on it).
    try {
      await sendVerificationEmail(account.user);
    } catch (err) {
      req.log.warn({ err }, "verification email enqueue failed");
    }

    return reply.status(201).send({
      user: serializeUser(account.user),
      workspace: serializeWorkspace(account.production),
      active_workspace: serializeWorkspace(account.production),
      workspaces: [account.production, account.sandbox].map(serializeWorkspace),
      session_token: token,
      session_expires_at: session.expiresAt,
    });
  });

  // --- Log in -------------------------------------------------------------
  app.post("/v1/auth/login", async (req) => {
    const body = parse(loginBody, req.body);
    const email = body.email.toLowerCase();

    if (await isLockedOut("pw", email)) {
      throw Errors.rateLimited("Too many failed login attempts. Try again in a few minutes.");
    }

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    // Verify even when the user is missing to keep timing uniform.
    const ok = verifyPassword(body.password, user?.passwordHash);
    if (!user || !ok) {
      await recordAuthFailure("pw", email);
      throw Errors.unauthorized("Invalid email or password.");
    }
    await clearAuthFailures("pw", email);

    // MFA gate: return a short-lived challenge instead of a session; the client
    // completes login at /v1/auth/mfa/verify with a TOTP or recovery code.
    if (user.mfaEnabledAt) {
      return { mfa_required: true, mfa_token: signMfaChallenge(user.id) };
    }

    return sessionResponse(user);
  });

  // --- Social login upsert (internal; called by the dashboard) ------------
  // The dashboard completes the OAuth dance, then exchanges the verified email
  // here for a session. Guarded by a shared secret so only first-party callers
  // can mint sessions.
  app.post("/v1/auth/oauth", async (req, reply) => {
    if (!env.INTERNAL_API_SECRET) throw Errors.notFound("Social login is not enabled.");
    const provided = req.headers["x-rootmail-internal"];
    if (provided !== env.INTERNAL_API_SECRET) throw Errors.unauthorized();

    const body = parse(oauthBody, req.body);
    const { user, created } = await upsertOAuthUser({
      email: body.email.toLowerCase(),
      name: body.name,
      emailVerified: body.email_verified ?? true,
    });

    // OAuth signups are verified on creation (they skip the verify-email step), so
    // welcome them here instead. Best-effort.
    if (created) {
      try {
        const mail = welcomeEmail(user.name);
        await sendSystemEmail({ to: user.email, subject: mail.subject, html: mail.html, text: mail.text });
      } catch (err) {
        req.log.warn({ err }, "oauth welcome email enqueue failed");
      }
    }

    const workspaces = await userWorkspaces(user.id);
    const live = workspaces.find((w) => w.environment === "live") ?? workspaces[0] ?? null;
    const { token, session } = await createSession(user.id, live?.id ?? null);

    return reply.status(created ? 201 : 200).send({
      user: serializeUser(user),
      workspaces: workspaces.map(serializeWorkspace),
      active_workspace: live ? serializeWorkspace(live) : null,
      session_token: token,
      session_expires_at: session.expiresAt,
    });
  });

  // --- Current user -------------------------------------------------------
  app.get("/v1/auth/me", async (req) => {
    const { user, session } = await requireSession(req);
    const workspaces = await userWorkspaces(user.id);
    const active =
      (session.activeWorkspaceId
        ? await workspaceForUser(user.id, session.activeWorkspaceId)
        : null) ?? (await defaultWorkspaceForUser(user.id));
    return {
      user: serializeUser(user),
      workspaces: workspaces.map(serializeWorkspace),
      active_workspace: active ? serializeWorkspace(active) : null,
      impersonating: session.impersonatedByStaffId != null,
    };
  });

  // --- Email preferences (the signed-in user) -----------------------------
  // In-app counterpart to the announcement unsubscribe link. Toggles whether the
  // user receives staff broadcast announcements; essential account/security mail
  // is always sent.
  const prefsBody = z.object({ announcement_opt_out: z.boolean() });
  app.post("/v1/auth/preferences", async (req) => {
    const { user } = await requireSession(req);
    const body = parse(prefsBody, req.body);
    const [updated] = await db
      .update(users)
      .set({ announcementOptOutAt: body.announcement_opt_out ? new Date() : null, updatedAt: new Date() })
      .where(eq(users.id, user.id))
      .returning();
    return serializeUser(updated);
  });

  // --- Log out ------------------------------------------------------------
  app.post("/v1/auth/logout", async (req) => {
    const token = bearerToken(req);
    if (token) await deleteSession(token);
    return { ok: true };
  });

  // --- Accept an impersonation handoff ------------------------------------
  // The admin app hands the dashboard a one-time code (never the session token).
  // Here we exchange it for a short-lived, impersonation-marked customer session.
  const impersonateAcceptBody = z.object({ code: z.string().min(1) });
  app.post("/v1/auth/impersonate/accept", async (req) => {
    const { code } = parse(impersonateAcceptBody, req.body);
    const [grant] = await db
      .select()
      .from(impersonationGrants)
      .where(eq(impersonationGrants.codeHash, sha256Hex(code)))
      .limit(1);
    if (!grant || grant.usedAt || grant.expiresAt.getTime() <= Date.now()) {
      throw Errors.unauthorized("This impersonation link is invalid or has expired.");
    }
    // One-time: consume immediately.
    await db
      .update(impersonationGrants)
      .set({ usedAt: new Date() })
      .where(eq(impersonationGrants.id, grant.id));
    const [user] = await db.select().from(users).where(eq(users.id, grant.targetUserId)).limit(1);
    if (!user) throw Errors.notFound("User not found");
    return sessionResponse(user, {
      impersonatedByStaffId: grant.staffUserId,
      ttlMs: 30 * 60 * 1000,
    });
  });

  // --- MFA: complete login with a TOTP or recovery code -------------------
  app.post("/v1/auth/mfa/verify", async (req) => {
    const body = parse(mfaVerifyBody, req.body);
    const userId = verifyMfaChallenge(body.mfa_token);
    if (!userId) throw Errors.unauthorized("MFA challenge expired — please log in again.");
    if (await isLockedOut("mfa", userId)) {
      throw Errors.rateLimited("Too many incorrect codes. Try again in a few minutes.");
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user || !user.mfaEnabledAt || !user.mfaSecret) throw Errors.unauthorized();

    let passed = false;
    if (body.code) {
      passed = verifyTotp(user.mfaSecret, body.code);
    } else if (body.recovery_code) {
      const codes = user.mfaRecoveryCodes ?? [];
      const candidate = body.recovery_code.trim().toLowerCase();
      const idx = codes.findIndex((hash) => verifyPassword(candidate, hash));
      if (idx >= 0) {
        passed = true;
        // Recovery codes are single-use.
        await db
          .update(users)
          .set({ mfaRecoveryCodes: codes.filter((_, i) => i !== idx), updatedAt: new Date() })
          .where(eq(users.id, user.id));
      }
    }
    if (!passed) {
      await recordAuthFailure("mfa", userId);
      throw Errors.unauthorized("Invalid code.");
    }
    await clearAuthFailures("mfa", userId);

    return sessionResponse(user);
  });

  // --- MFA: begin enrollment (returns the secret + otpauth URI) -----------
  app.post("/v1/auth/mfa/setup", async (req) => {
    const { user } = await requireSession(req);
    if (user.mfaEnabledAt) throw Errors.conflict("MFA is already enabled.");
    const secret = generateTotpSecret();
    await db.update(users).set({ mfaSecret: secret, updatedAt: new Date() }).where(eq(users.id, user.id));
    return { secret, otpauth_uri: totpUri(secret, user.email) };
  });

  // --- MFA: activate after confirming a code (recovery codes shown once) ---
  app.post("/v1/auth/mfa/activate", async (req) => {
    const { user } = await requireSession(req);
    const body = parse(mfaActivateBody, req.body);
    if (user.mfaEnabledAt) throw Errors.conflict("MFA is already enabled.");
    if (!user.mfaSecret) throw Errors.badRequest("Start MFA setup first.");
    if (!verifyTotp(user.mfaSecret, body.code)) {
      throw Errors.badRequest("That code didn't match — check your authenticator and try again.");
    }
    const recoveryCodes = Array.from({ length: 10 }, () => generateRecoveryCode());
    await db
      .update(users)
      .set({
        mfaEnabledAt: new Date(),
        mfaRecoveryCodes: recoveryCodes.map((c) => hashPassword(c)),
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));
    return { enabled: true, recovery_codes: recoveryCodes };
  });

  // --- MFA: disable (requires a current code or the account password) -----
  app.post("/v1/auth/mfa/disable", async (req) => {
    const { user } = await requireSession(req);
    const body = parse(mfaDisableBody, req.body);
    if (!user.mfaEnabledAt) return { enabled: false };
    const okCode = Boolean(body.code && user.mfaSecret && verifyTotp(user.mfaSecret, body.code));
    const okPassword = Boolean(body.password && verifyPassword(body.password, user.passwordHash));
    if (!okCode && !okPassword) {
      throw Errors.unauthorized("Provide a valid code or your password to disable MFA.");
    }
    await db
      .update(users)
      .set({ mfaSecret: null, mfaEnabledAt: null, mfaRecoveryCodes: null, updatedAt: new Date() })
      .where(eq(users.id, user.id));
    return { enabled: false };
  });

  // --- Email verification -------------------------------------------------
  app.post("/v1/auth/verify-email", async (req) => {
    const body = parse(verifyEmailBody, req.body);
    const userId = await consumeAuthToken(body.token, "email_verify");
    if (!userId) throw Errors.badRequest("This verification link is invalid or has expired.");
    await db
      .update(users)
      .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, userId));

    // Welcome aboard — dogfood our own pipeline (best-effort).
    try {
      const [u] = await db
        .select({ email: users.email, name: users.name })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (u) {
        const mail = welcomeEmail(u.name);
        await sendSystemEmail({ to: u.email, subject: mail.subject, html: mail.html, text: mail.text });
      }
    } catch (err) {
      req.log.warn({ err }, "welcome email enqueue failed");
    }
    return { verified: true };
  });

  app.post("/v1/auth/verify-email/resend", async (req) => {
    const { user } = await requireSession(req);
    if (user.emailVerifiedAt) return { verified: true };
    await sendVerificationEmail(user);
    return { sent: true };
  });

  // --- Password reset -----------------------------------------------------
  app.post("/v1/auth/forgot-password", async (req) => {
    const body = parse(forgotPasswordBody, req.body);
    const email = body.email.toLowerCase();
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    // Send only when the account exists with a password, but always return ok so
    // the endpoint can't be used to discover which emails are registered.
    if (user?.passwordHash) {
      const token = await createAuthToken(user.id, "password_reset", PASSWORD_RESET_TTL_MS);
      const mail = passwordResetEmail(token, user.name);
      await sendSystemEmail({ to: user.email, subject: mail.subject, html: mail.html, text: mail.text });
    }
    return { ok: true };
  });

  app.post("/v1/auth/reset-password", async (req) => {
    const body = parse(resetPasswordBody, req.body);
    const userId = await consumeAuthToken(body.token, "password_reset");
    if (!userId) throw Errors.badRequest("This reset link is invalid or has expired.");
    await db
      .update(users)
      .set({ passwordHash: hashPassword(body.password), updatedAt: new Date() })
      .where(eq(users.id, userId));
    // A reset invalidates existing sessions — force a fresh login everywhere.
    await db.delete(sessions).where(eq(sessions.userId, userId));
    return { reset: true };
  });
}
