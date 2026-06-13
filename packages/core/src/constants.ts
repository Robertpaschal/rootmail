/**
 * Shared enums for the rootmail domain model.
 *
 * This module is intentionally dependency-free and side-effect-free so it can be
 * imported by the database schema (via `@rootmail/core/constants`) without pulling
 * in env parsing, Redis, or the queue.
 */

export const MESSAGE_TYPES = ["transactional", "marketing", "sales"] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export const TEMPLATE_TYPES = ["transactional", "marketing", "sales", "any"] as const;
export type TemplateType = (typeof TEMPLATE_TYPES)[number];

export const MESSAGE_STATUSES = [
  "queued",
  "sending",
  "sent",
  "delivered",
  "bounced",
  "complained",
  "failed",
  "suppressed",
] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const AUDIT_EVENTS = [
  "queued",
  "sending",
  "sent",
  "delivered",
  "opened",
  "clicked",
  "bounced",
  "complained",
  "unsubscribed",
  "failed",
  "suppressed",
  "retried",
] as const;
export type AuditEvent = (typeof AUDIT_EVENTS)[number];

export const PRIORITIES = ["high", "normal", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const CONTACT_STATUSES = ["active", "unsubscribed", "bounced", "complained"] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export const SUBTENANT_STATUSES = [
  "pending_verification",
  "verifying",
  "verified",
  "failed",
  "disabled",
] as const;
export type SubTenantStatus = (typeof SUBTENANT_STATUSES)[number];

export const SUPPRESSION_REASONS = ["bounce", "complaint", "unsubscribe", "manual"] as const;
export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

export const WORKSPACE_ENVIRONMENTS = ["live", "test"] as const;
export type WorkspaceEnvironment = (typeof WORKSPACE_ENVIRONMENTS)[number];
