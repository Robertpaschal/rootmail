import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { type CampaignJob, env } from "@rootmail/core";
import { campaigns, contacts, db, listContacts, senderIdentities, subTenants, templates, workspaces, type Template } from "@rootmail/db";
import { automationSend } from "./send";

/** Fan a campaign out to every contact on its list, metered + suppression-aware.
 * Honors the campaign's segment tag (only matching members receive it) and its
 * tag-targeted A/B variants (first matching variant wins; else the base message). */
export async function processCampaignSend(data: CampaignJob): Promise<void> {
  const [c] = await db.select().from(campaigns).where(eq(campaigns.id, data.campaignId)).limit(1);
  if (!c || c.status === "sent" || !c.listId || !c.templateId) return;

  await db.update(campaigns).set({ status: "sending", updatedAt: new Date() }).where(eq(campaigns.id, c.id));

  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, c.workspaceId)).limit(1);
  const [tpl] = await db.select().from(templates).where(eq(templates.id, c.templateId)).limit(1);
  if (!ws || !tpl) {
    await db.update(campaigns).set({ status: "sent", sentAt: new Date() }).where(eq(campaigns.id, c.id));
    return;
  }

  // Variant templates, keyed by id — invalid/foreign refs simply fall back to base.
  const variants = (c.variants ?? []).filter((v) => v.tag && v.template_id);
  const variantTemplates = new Map<string, Template>();
  if (variants.length > 0) {
    const rows = await db
      .select()
      .from(templates)
      .where(inArray(templates.id, [...new Set(variants.map((v) => v.template_id))]));
    for (const t of rows) if (t.workspaceId === c.workspaceId) variantTemplates.set(t.id, t);
  }

  let fromEmail = c.fromEmail ?? `no-reply@${env.ROOTMAIL_DOMAIN}`;
  let fromName: string | null = ws.name;
  if (c.subTenantId) {
    const [st] = await db.select().from(subTenants).where(eq(subTenants.id, c.subTenantId)).limit(1);
    if (st) {
      if (!c.fromEmail) fromEmail = `no-reply@${st.sendingDomain}`;
      fromName = st.name;
    }
  } else if (!c.fromEmail) {
    // No address named + not a client-domain send → use the org's own verified
    // sender if it set one up (default first, else earliest verified), so campaigns
    // go out from the customer's address, not rootmail's no-reply.
    const [own] = await db
      .select()
      .from(senderIdentities)
      .where(and(eq(senderIdentities.organizationId, ws.organizationId), eq(senderIdentities.status, "verified")))
      .orderBy(desc(senderIdentities.isDefault), asc(senderIdentities.createdAt))
      .limit(1);
    if (own) {
      fromEmail = own.email;
      fromName = own.displayName ?? ws.name;
    }
  }

  const all = await db
    .select({ email: contacts.email, tags: contacts.tags })
    .from(listContacts)
    .innerJoin(contacts, eq(contacts.id, listContacts.contactId))
    .where(eq(listContacts.listId, c.listId));

  // Segmented campaigns only reach members carrying the tag.
  const members = c.segmentTag ? all.filter((m) => (m.tags ?? []).includes(c.segmentTag!)) : all;

  let sent = 0;
  let suppressed = 0;
  let failed = 0;
  for (const m of members) {
    // A/B by tags: the first variant whose tag this member carries wins.
    const hit = variants.find((v) => (m.tags ?? []).includes(v.tag));
    const vTpl = hit ? variantTemplates.get(hit.template_id) : undefined;
    const useTpl = vTpl ?? tpl;
    const useSubject = (vTpl ? (hit?.subject ?? vTpl.subject) : (c.subject ?? tpl.subject));
    try {
      const res = await automationSend({
        workspaceId: c.workspaceId,
        subTenantId: c.subTenantId,
        organizationId: ws.organizationId,
        mode: ws.environment === "test" ? "test" : "live",
        type: "marketing",
        to: m.email,
        fromEmail,
        fromName,
        subject: useSubject,
        html: useTpl.html,
        text: useTpl.text,
        templateId: useTpl.id,
        templateVersion: useTpl.currentVersion,
        campaignId: c.id,
      });
      if (res.suppressed) suppressed += 1;
      else sent += 1;
    } catch (err) {
      failed += 1;
      console.error(`[campaign] send to ${m.email} failed:`, err instanceof Error ? err.message : err);
    }
  }

  await db
    .update(campaigns)
    .set({
      status: "sent",
      sentAt: new Date(),
      stats: { recipients: members.length, sent, suppressed, failed },
      updatedAt: new Date(),
    })
    .where(eq(campaigns.id, c.id));
}
