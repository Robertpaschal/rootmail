import { buildDnsRecords } from "@rootmail/core";
import type {
  ApiKey,
  AuditEntry,
  Contact,
  Message,
  SubTenant,
  Template,
  Thread,
  ThreadMessage,
  User,
  Workspace,
} from "@rootmail/db";

export function serializeThreadMessage(m: ThreadMessage) {
  return {
    id: m.id,
    object: "thread_message",
    direction: m.direction,
    message_id: m.messageId,
    from: m.fromEmail,
    to: m.toEmail,
    body_html: m.bodyHtml,
    body_text: m.bodyText,
    created_at: m.createdAt,
  };
}

export function serializeThread(t: Thread, msgs?: ThreadMessage[]) {
  return {
    id: t.id,
    object: "thread",
    subject: t.subject,
    status: t.status,
    contact_email: t.contactEmail,
    sub_tenant_id: t.subTenantId,
    last_message_at: t.lastMessageAt,
    created_at: t.createdAt,
    ...(msgs ? { messages: msgs.map(serializeThreadMessage) } : {}),
  };
}

export function serializeUser(u: User) {
  return {
    id: u.id,
    object: "user",
    email: u.email,
    name: u.name,
    avatar_url: u.avatarUrl,
    email_verified: u.emailVerifiedAt != null,
    mfa_enabled: u.mfaEnabledAt != null,
    announcement_opt_out: u.announcementOptOutAt != null,
    created_at: u.createdAt,
  };
}

export function serializeWorkspace(w: Workspace) {
  return {
    id: w.id,
    object: "workspace",
    name: w.name,
    slug: w.slug,
    environment: w.environment,
    region: w.region,
    created_at: w.createdAt,
  };
}

export function serializeMessage(m: Message) {
  return {
    id: m.id,
    object: "message",
    type: m.type,
    status: m.status,
    to: m.toEmail,
    from: m.fromName ? { name: m.fromName, email: m.fromEmail } : { email: m.fromEmail },
    reply_to: m.replyTo,
    subject: m.subject,
    sub_tenant_id: m.subTenantId,
    template_id: m.templateId,
    template_version: m.templateVersion,
    priority: m.priority,
    tags: m.tags,
    metadata: m.metadata,
    idempotency_key: m.idempotencyKey,
    provider: m.provider,
    provider_message_id: m.providerMessageId,
    content_hash: m.contentHash,
    rendered_html: m.renderedHtml,
    rendered_text: m.renderedText,
    sandbox: m.sandbox,
    error: m.error,
    scheduled_at: m.sendAt,
    created_at: m.createdAt,
    updated_at: m.updatedAt,
  };
}

export function serializeAudit(e: AuditEntry) {
  return {
    event: e.event,
    actor: e.actorId ? `${e.actor}:${e.actorId}` : e.actor,
    ip: e.ip ?? undefined,
    user_agent: e.userAgent ?? undefined,
    provider: e.provider ?? undefined,
    provider_message_id: e.providerMessageId ?? undefined,
    metadata: e.metadata,
    timestamp: e.occurredAt,
  };
}

export function serializeSubTenant(t: SubTenant, opts: { includeDns?: boolean } = {}) {
  const base = {
    id: t.id,
    object: "sub_tenant",
    name: t.name,
    external_id: t.externalId,
    sending_domain: t.sendingDomain,
    status: t.status,
    inherits_templates: t.inheritsTemplates,
    dkim_selector: t.dkimSelector,
    verified_at: t.verifiedAt,
    last_checked_at: t.lastCheckedAt,
    created_at: t.createdAt,
  };
  if (!opts.includeDns) return base;
  return {
    ...base,
    dns_records: buildDnsRecords({
      domain: t.sendingDomain,
      verificationToken: t.verificationToken,
      dkimSelector: t.dkimSelector,
      dkimValue: t.dkimPublicKey,
    }),
  };
}

export function serializeTemplate(t: Template) {
  return {
    id: t.id,
    object: "template",
    name: t.name,
    slug: t.slug,
    type: t.type,
    subject: t.subject,
    html: t.html,
    text: t.text,
    blocks: t.blocks,
    variables_schema: t.variablesSchema,
    current_version: t.currentVersion,
    sub_tenant_id: t.subTenantId,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
  };
}

export function serializeApiKey(k: ApiKey) {
  return {
    id: k.id,
    object: "api_key",
    name: k.name,
    // `rm_live` / `rm_test` + last 4 — enough to identify a key, never the secret.
    prefix: k.prefix,
    last4: k.last4,
    mode: k.mode,
    revoked: k.revokedAt != null,
    last_used_at: k.lastUsedAt,
    revoked_at: k.revokedAt,
    created_at: k.createdAt,
  };
}

export function serializeContact(c: Contact) {
  return {
    id: c.id,
    object: "contact",
    email: c.email,
    name: c.name,
    phone: c.phone,
    tags: c.tags,
    metadata: c.metadata,
    status: c.status,
    sub_tenant_id: c.subTenantId,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  };
}
