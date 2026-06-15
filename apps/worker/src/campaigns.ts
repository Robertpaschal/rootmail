import { eq } from "drizzle-orm";
import { type CampaignJob, env } from "@rootmail/core";
import { campaigns, contacts, db, listContacts, subTenants, templates, workspaces } from "@rootmail/db";
import { automationSend } from "./send";

/** Fan a campaign out to every contact on its list, metered + suppression-aware. */
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

  let fromEmail = c.fromEmail ?? `no-reply@${env.ROOTMAIL_DOMAIN}`;
  let fromName: string | null = ws.name;
  if (c.subTenantId) {
    const [st] = await db.select().from(subTenants).where(eq(subTenants.id, c.subTenantId)).limit(1);
    if (st) {
      if (!c.fromEmail) fromEmail = `no-reply@${st.sendingDomain}`;
      fromName = st.name;
    }
  }

  const members = await db
    .select({ email: contacts.email })
    .from(listContacts)
    .innerJoin(contacts, eq(contacts.id, listContacts.contactId))
    .where(eq(listContacts.listId, c.listId));

  let sent = 0;
  let suppressed = 0;
  let failed = 0;
  for (const m of members) {
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
        subject: c.subject ?? tpl.subject,
        html: tpl.html,
        text: tpl.text,
        templateId: tpl.id,
        templateVersion: tpl.currentVersion,
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
