import { a, c, callout, code, DocPage, endpoint, h, p } from "../types";

export const contacts: DocPage = {
  slug: "contacts",
  title: "Contacts",
  summary: "The people you email — created, updated, and looked up by address.",
  blocks: [
    p("Contacts are the individuals in your audience. Create them directly, import in bulk, or let them arrive through sign-up flows."),
    endpoint("POST", "/v1/contacts", "Create or upsert a contact."),
    endpoint("GET", "/v1/contacts/:email", "Look a contact up by email address."),
    endpoint("POST", "/v1/contacts/unsubscribe", "Unsubscribe a contact from marketing mail."),
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
    endpoint("POST", "/v1/lists", "Create an audience."),
    endpoint("GET", "/v1/lists/:id", "Fetch one audience."),
    endpoint("PATCH", "/v1/lists/:id", "Rename or edit an audience."),
    endpoint("DELETE", "/v1/lists/:id", "Delete an audience."),
    endpoint("GET", "/v1/lists/:id/contacts", "List the contacts in an audience."),
    endpoint("POST", "/v1/lists/:id/contacts", "Add contacts to an audience."),
    endpoint("DELETE", "/v1/lists/:id/contacts/:contactId", "Remove a contact from an audience."),
    endpoint("GET", "/v1/lists/:id/tags", "Distinct tags carried by this audience's members, with counts — feeds campaign segments and A/B variants."),
    code(
      "ts",
      `const list = await mail.lists.create({ name: "Newsletter" });
await mail.lists.addContacts(list.id, ["ada@example.com", "grace@example.com"]);`,
      "audience.ts",
    ),
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
