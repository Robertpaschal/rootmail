import {
  enqueueSend,
  type MessageType,
  newId,
  type Priority,
  render,
  sha256Hex,
} from "@rootmail/core";
import { db, type Message, messages, type Organization, type Workspace } from "@rootmail/db";
import type { AuthContext } from "../context";
import { writeAudit } from "./audit";
import { recordSend } from "./billing";
import { findContact, isSuppressed } from "./queries";

/** Who's acting on a request — for audit actor attribution. */
export function authActor(auth: AuthContext): { actor: string; actorId: string | null } {
  if (auth.apiKey) return { actor: "api_key", actorId: auth.apiKey.id };
  if (auth.user) return { actor: "user", actorId: auth.user.id };
  return { actor: "system", actorId: null };
}

export interface DispatchInput {
  workspace: Workspace;
  subTenantId: string | null;
  org: Organization | null;
  mode: "live" | "test";
  type: MessageType;
  to: string;
  fromEmail: string;
  fromName?: string | null;
  replyTo?: string | null;
  subject: string;
  html: string;
  text?: string | null;
  variables?: Record<string, unknown>;
  templateId?: string | null;
  templateVersion?: number | null;
  priority?: Priority;
  tags?: string[];
  metadata?: Record<string, unknown>;
  idempotencyKey?: string | null;
  sendAt?: Date | null;
  actor: { actor: string; actorId: string | null };
  ip?: string;
  userAgent?: string | null;
}

/**
 * Render, persist, meter, audit and enqueue an outbound message — the shared
 * mechanics behind a direct send and a thread reply. (The /v1/messages route
 * keeps its own idempotency handling; this path is for non-idempotent sends
 * like replies.)
 */
export async function dispatchMessage(
  input: DispatchInput,
): Promise<{ message: Message; suppressed: boolean }> {
  const rendered = render({
    subject: input.subject,
    html: input.html,
    text: input.text ?? null,
    variables: input.variables ?? {},
  });
  const contentHash = sha256Hex(rendered.html);
  const contact = await findContact(input.workspace.id, input.subTenantId, input.to);
  const suppressed = await isSuppressed(input.workspace.id, input.subTenantId, input.to);
  const id = newId("message");

  const [message] = await db
    .insert(messages)
    .values({
      id,
      workspaceId: input.workspace.id,
      subTenantId: input.subTenantId,
      type: input.type,
      toEmail: input.to,
      toContactId: contact?.id ?? null,
      fromEmail: input.fromEmail,
      fromName: input.fromName ?? null,
      replyTo: input.replyTo ?? null,
      subject: rendered.subject,
      templateId: input.templateId ?? null,
      templateVersion: input.templateVersion ?? null,
      variables: input.variables ?? {},
      renderedHtml: rendered.html,
      renderedText: rendered.text,
      contentHash,
      sendAt: input.sendAt ?? null,
      priority: input.priority ?? "normal",
      tags: input.tags ?? [],
      metadata: input.metadata ?? {},
      idempotencyKey: input.idempotencyKey ?? null,
      status: suppressed ? "suppressed" : "queued",
      sandbox: input.mode === "test",
    })
    .returning();

  if (input.mode === "live" && input.org) await recordSend(input.org.id);

  await writeAudit(db, {
    workspaceId: input.workspace.id,
    subTenantId: input.subTenantId,
    messageId: id,
    event: "queued",
    actor: input.actor.actor,
    actorId: input.actor.actorId,
    ip: input.ip,
    userAgent: input.userAgent ?? null,
  });

  if (suppressed) {
    await writeAudit(db, {
      workspaceId: input.workspace.id,
      subTenantId: input.subTenantId,
      messageId: id,
      event: "suppressed",
      actor: "system",
      metadata: { reason: "recipient is on the suppression list" },
    });
    return { message, suppressed: true };
  }

  const delayMs = input.sendAt ? Math.max(0, input.sendAt.getTime() - Date.now()) : 0;
  await enqueueSend(
    { messageId: id, workspaceId: input.workspace.id },
    { priority: input.priority ?? "normal", delayMs },
  );
  return { message, suppressed: false };
}
