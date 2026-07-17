import { c, callout, code, DocPage, endpoint, h, p } from "../types";

export const campaigns: DocPage = {
  slug: "campaigns",
  title: "Campaigns",
  summary: "Send one email to a whole audience, and measure how it lands.",
  blocks: [
    p("A campaign is a one-time send to an audience — a newsletter, an announcement. Create it, then send (or schedule) it; suppressed and unsubscribed contacts are skipped automatically."),
    endpoint("GET", "/v1/campaigns", "List campaigns."),
    endpoint("POST", "/v1/campaigns", "Create a campaign (audience + template)."),
    endpoint("GET", "/v1/campaigns/:id", "Fetch one campaign."),
    endpoint("PATCH", "/v1/campaigns/:id", "Edit a draft campaign."),
    endpoint("POST", "/v1/campaigns/:id/send", "Send or schedule the campaign."),
    endpoint("GET", "/v1/campaigns/:id/analytics", "The campaign's funnel: sent → delivered → opened → clicked."),
    endpoint("DELETE", "/v1/campaigns/:id", "Delete a draft campaign."),
    code(
      "ts",
      `const c = await mail.campaigns.create({
  name: "March newsletter",
  listId: list.id,
  templateId: tmpl.id,
});
await mail.campaigns.send(c.id, { sendAt: "2026-03-01T15:00:00Z" });
const funnel = await mail.campaigns.analytics(c.id);`,
      "campaign.ts",
    ),
    h("Segments & A/B by tags"),
    p("Two optional fields target the send. ", c("segment_tag"), " narrows the audience to list members carrying that tag. ", c("variants"), " (up to 4) A/B-tests by tag: a contact carrying a variant's tag gets that variant's template (and optional subject) instead of the base message — first matching variant wins, everyone else gets the base. Distinct tags for a list come from ", c("GET /v1/lists/:id/tags"), "."),
    code(
      "json",
      `POST /v1/campaigns
{
  "name": "March newsletter",
  "list_id": "lst_…",
  "template_id": "tpl_base…",
  "segment_tag": "active",
  "variants": [
    { "tag": "vip", "template_id": "tpl_vip…", "subject": "A thank-you for being a VIP" }
  ]
}`,
      "campaign-ab.json",
    ),
  ],
};

export const sequences: DocPage = {
  slug: "sequences",
  title: "Sequences",
  summary: "Automated, multi-step drips that stop when someone replies.",
  blocks: [
    p("A sequence emails a contact over time — a welcome series, an onboarding drip — with waits between steps. It exits automatically the moment the contact replies."),
    endpoint("GET", "/v1/sequences", "List sequences."),
    endpoint("POST", "/v1/sequences", "Create a sequence with its steps."),
    endpoint("GET", "/v1/sequences/:id", "Fetch a sequence."),
    endpoint("PATCH", "/v1/sequences/:id", "Edit steps or pause/resume."),
    endpoint("POST", "/v1/sequences/:id/enroll", "Enroll a contact."),
    endpoint("GET", "/v1/sequences/:id/enrollments", "List who's enrolled and where they are."),
    endpoint("POST", "/v1/sequences/:id/enrollments/:enrollmentId/cancel", "Remove a contact from the sequence."),
    endpoint("GET", "/v1/sequences/:id/analytics", "Per-step delivery and drop-off."),
    code(
      "ts",
      `const seq = await mail.sequences.create({
  name: "Onboarding",
  steps: [
    { template: "welcome", delayHours: 0 },
    { template: "tips",    delayHours: 48 },
    { template: "upgrade", delayHours: 120 },
  ],
});
await mail.sequences.enroll(seq.id, "ada@example.com");`,
      "sequence.ts",
    ),
    callout("note", "Sequences and campaigns are Marketing-wing features — enrolling or sending checks your plan and returns a ", c("feature_locked"), " error if it isn't enabled."),
  ],
};

export const threads: DocPage = {
  slug: "threads",
  title: "Replies & threads",
  summary: "Inbound replies, parsed and threaded — answer in-app or by webhook.",
  blocks: [
    p("When someone replies, rootmail parses the message and attaches it to a thread. Read threads over the API, answer them, and get a webhook the moment a reply arrives."),
    endpoint("GET", "/v1/threads", "List conversation threads."),
    endpoint("GET", "/v1/threads/:id", "Fetch a thread and its messages."),
    endpoint("POST", "/v1/threads/:id/reply", "Send a reply into the thread."),
    endpoint("POST", "/v1/inbound", "The endpoint inbound mail is delivered to (provider webhook)."),
    h("React to replies in real time"),
    p("Subscribe to the ", c("message.received"), " webhook event to route inbound replies straight into your own systems. See ", c("Webhooks"), "."),
    code("ts", `await mail.threads.reply(threadId, { html: "<p>Thanks for writing back!</p>" });`, "reply.ts"),
  ],
};
