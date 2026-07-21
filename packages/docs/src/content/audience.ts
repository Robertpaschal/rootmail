import { a, c, callout, code, DocPage, endpoint, h, p } from "../types";

export const contacts: DocPage = {
  slug: "contacts",
  title: "Contacts",
  summary: "The people you email — created, updated, and looked up by address.",
  blocks: [
    p("Contacts are the individuals in your audience. Create them directly, import in bulk, or let them arrive through sign-up flows."),
    endpoint("POST", "/v1/contacts", "Create or upsert a contact."),
    endpoint("GET", "/v1/contacts", "Browse contacts — paged, with q (email/name search), tag, status, and stage filters; returns total."),
    endpoint("GET", "/v1/contacts/tags", "Distinct tags across your contacts, with how many carry each."),
    endpoint("GET", "/v1/contacts/:email", "Look a contact up by email address."),
    endpoint("POST", "/v1/contacts/unsubscribe", "Unsubscribe a contact from marketing mail."),
    h("The full relationship (CRM)"),
    p(
      "Each contact is a full profile: audiences, notes, lifecycle events (subscribed, unsubscribed, waitlisted, admitted) and recent sends with open/click times. Custom ",
      c("metadata"),
      " fields personalize templates automatically, and status changes carry their real side effects — unsubscribing suppresses, resubscribing clears the suppression, and new tags can enroll into tag-triggered sequences.",
    ),
    endpoint("GET", "/v1/contacts/id/:id", "The full CRM view — profile, stage, audiences, notes, lifecycle events, recent sends."),
    endpoint("GET", "/v1/contacts/stages", "How many contacts sit at each lifecycle stage — the pipeline at a glance."),
    endpoint("PATCH", "/v1/contacts/id/:id", "Edit name, phone, tags, metadata, status (active | unsubscribed), or lifecycle stage (subscriber | engaged | customer | champion | at_risk — changes land on the timeline)."),
    endpoint("DELETE", "/v1/contacts/id/:id", "Delete a contact (memberships and notes go too; send history stays)."),
    endpoint("POST", "/v1/contacts/id/:id/notes", "Add a note to a contact."),
    endpoint("DELETE", "/v1/contacts/id/:id/notes/:noteId", "Remove a note."),
    code(
      "ts",
      `await mail.contacts.create({
  email: "ada@example.com",
  name: "Ada Lovelace",
  attributes: { plan: "pro", signup_source: "docs" },
});`,
      "contact.ts",
    ),
    callout("note", "Your marketing plan is priced by contact size — see ", a("Pricing", "https://marketing.gateml.io/pricing"), "."),
  ],
};

export const lists: DocPage = {
  slug: "lists",
  title: "Audiences (lists)",
  summary: "Group contacts into the audiences you send campaigns to.",
  blocks: [
    p("An audience (list) is a named group of contacts. Campaigns and sequences target audiences."),
    endpoint("GET", "/v1/lists", "List your audiences."),
    endpoint("POST", "/v1/lists", "Create an audience — pass from_tag to seed it with everyone carrying that tag."),
    endpoint("GET", "/v1/lists/:id", "Fetch one audience."),
    endpoint("PATCH", "/v1/lists/:id", "Rename or edit an audience."),
    endpoint("DELETE", "/v1/lists/:id", "Delete an audience."),
    endpoint("GET", "/v1/lists/:id/contacts", "List the contacts in an audience — paged (q, stage, limit, offset); returns total and the audience's lifecycle-stage breakdown."),
    endpoint("POST", "/v1/lists/:id/contacts", "Add contacts to an audience."),
    endpoint("DELETE", "/v1/lists/:id/contacts/:contactId", "Remove a contact from an audience."),
    endpoint("GET", "/v1/lists/:id/tags", "Distinct tags carried by this audience's members, with counts — feeds campaign segments and A/B variants."),
    code(
      "ts",
      `const list = await mail.lists.create({ name: "Newsletter" });
await mail.lists.addContacts(list.id, ["ada@example.com", "grace@example.com"]);`,
      "audience.ts",
    ),
    h("Growing an audience (public signup)"),
    p(
      "Enable signup on an audience and it grows itself: every audience gets a hosted, branded signup page plus an embeddable HTML form for your own site. Double opt-in (default) sends a confirmation email from your verified sender; the signup tag is applied to every subscriber — a sequence triggered by that tag is your welcome automation. Signups that arrive while you're at your contact limit are waitlisted (never lost) and admitted automatically when room frees up.",
    ),
    endpoint("PATCH", "/v1/lists/:id", "Enable signup: signup_enabled, double_opt_in, signup_tag, signup_redirect_url."),
    endpoint("POST", "/v1/subscribe", "PUBLIC — subscribe someone: { list_id, email, name? }. Also accepts a plain HTML form post."),
    endpoint("GET", "/v1/lists/:id/growth", "Daily subscribes vs unsubscribes (30d), waitlist count, and the hosted page + embed endpoint URLs."),
    code(
      "html",
      `<!-- Drop this on your site — style it however you like -->
<form action="https://service.gateml.io/v1/subscribe" method="post">
  <input type="hidden" name="list_id" value="lst_your_audience">
  <input type="email" name="email" placeholder="you@example.com" required>
  <input type="text" name="name" placeholder="Your name">
  <input type="text" name="website" style="display:none" tabindex="-1" autocomplete="off">
  <button type="submit">Subscribe</button>
</form>`,
      "embed.html",
    ),
    callout("note", "The hidden ", c("website"), " field is a honeypot — leave it in. Bots fill it; humans never see it."),
  ],
};

export const imports: DocPage = {
  slug: "imports",
  title: "Imports & migration",
  summary: "Bring contacts and your do-not-email list over — no reputation lost.",
  blocks: [
    p("Move in from another provider in one step. Import contacts and, crucially, your suppression list so you never email someone who already opted out."),
    endpoint("POST", "/v1/imports/contacts", "Import contacts (CSV/JSON or a provider export)."),
    endpoint("POST", "/v1/imports/suppressions", "Import a suppression/unsubscribe list."),
    h("From SendGrid, Postmark, or Mailgun"),
    p("Export your contacts and suppressions from your current provider, then import both. Your history and reputation come with you."),
    code(
      "ts",
      `await mail.imports.contacts({ file: csvBuffer, format: "csv" });
await mail.imports.suppressions({ file: sendgridExport, format: "csv" });`,
      "migrate.ts",
    ),
    callout("tip", "Do the suppression import first, then contacts — that way a re-imported contact who previously unsubscribed stays suppressed."),
  ],
};
