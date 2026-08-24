import { b, c, callout, code, DocPage, endpoint, h, p, reqres } from "../types";

export const campaigns: DocPage = {
  slug: "campaigns",
  title: "Campaigns",
  summary: "Send one email to a whole audience, and measure how it lands.",
  blocks: [
    p("A campaign is a one-time send to an audience — a newsletter, an announcement. Create it, then send (or schedule) it; suppressed and unsubscribed contacts are skipped automatically."),
    p(
      "Every recipient gets a personalized copy: the template's ",
      c("{{placeholders}}"),
      " fill from each contact's own record (name, first_name, phone, custom metadata fields) at send time — one template, tailored per person.",
    ),
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

    h("Pre-flight: read (and change) each person's copy"),
    p(
      "A campaign reaches everyone at once, so there's no checking it afterwards. ",
      c("GET /v1/campaigns/:id/preview"),
      " resolves each recipient's ACTUAL email — the variant their tags select, rendered with their contact fields — by the same rules the send applies. It's read-only.",
    ),
    p(
      "If one person's copy isn't right, replace it. ",
      c("PUT /v1/campaigns/:id/overrides"),
      " stores a subject and/or body against a single recipient; theirs wins over the template ",
      b("and"),
      " over any A/B variant. Draft and scheduled campaigns only — an override on a campaign that already went out is refused rather than silently ignored.",
    ),
    ...reqres("GET", "/v1/campaigns/:id/preview", "Each recipient's actual copy, before it goes.", {
      response: `{
  "object": "list",
  "total": 3,
  "data": [
    {
      "object": "campaign_recipient",
      "email": "grace@example.com",
      "name": "Grace Hopper",
      "tags": ["vip"],
      "variant_tag": "vip",
      "template_name": "Newsletter VIP",
      "edited": false,
      "subject": "VIP news, Grace",
      "html": "<p>Hi Grace — as an Enterprise customer…</p>",
      "text": "Hi Grace — as an Enterprise customer…"
    }
  ]
}`,
    }),
    ...reqres("PUT", "/v1/campaigns/:id/overrides", "Replace one recipient's copy.", {
      request: `{
  "email": "linus@example.com",
  "subject": "Just for you, {{first_name}}",
  "html": "<p>Hi {{first_name}} — a hand-written note only you get.</p>"
}`,
    }),
    endpoint("DELETE", "/v1/campaigns/:id/overrides?email=…", "Put a recipient back on the normal copy."),
    code(
      "ts",
      `// Check everyone, then fix the one that reads wrong.
const { data } = await mail.campaigns.preview(c.id);
const odd = data.find((r) => r.subject.includes("undefined"));
if (odd) {
  await mail.campaigns.setRecipientCopy(c.id, {
    email: odd.email,
    subject: "A quick note",
    html: "<p>Hi there — here's the update.</p>",
  });
}`,
      "preflight.ts",
    ),
    callout(
      "note",
      "An edited copy still goes through the normal send path: {{variables}} you type are filled from the contact's record, and the compliance footer (postal address + unsubscribe) is still appended.",
    ),
  ],
};

export const sequences: DocPage = {
  slug: "sequences",
  title: "Sequences",
  summary: "Automated, multi-step drips that stop when someone replies.",
  blocks: [
    p("A sequence emails a contact over time — a welcome series, an onboarding drip — with waits between steps. It exits automatically the moment the contact replies. Each step's template personalizes from the enrollee's own contact record (name, first_name, custom fields), automatically."),
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
    // "Multi-step drip that stops on reply" is the shape of a cold-outreach tool,
    // and the restriction that makes it NOT one lived only in code. Anyone
    // judging what this product is for reads this page.
    callout(
      "warn",
      "Sequences are for people you already have a relationship with — onboarding, activation, renewals. Marketing and sales mail can only go to contacts already in your audience: a send to an address you haven't collected is refused. rootmail isn't a cold-outreach tool and won't work as one.",
    ),
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
