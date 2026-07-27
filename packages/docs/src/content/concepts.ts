import { a, b, c, callout, code, DocPage, h, list, p, params, reqres } from "../types";

export const idempotency: DocPage = {
  slug: "idempotency",
  title: "Idempotency",
  summary: "Make retries safe — the same key sends exactly once.",
  blocks: [
    p(
      "Networks are unreliable: a request times out, a process restarts, a queue retries. Pass an ",
      c("idempotency_key"),
      " on a send and rootmail guarantees a single message even if the request arrives more than once. A replay returns the ",
      b("original"),
      " message instead of sending again.",
    ),
    code(
      "ts",
      `await mail.messages.create({
  to: user.email,
  template: "password-reset",
  variables: { reset_url },
  idempotencyKey: \`pwd-reset-\${user.id}-\${tokenId}\`, // stable per logical action
});`,
      "idempotent-send.ts",
    ),
    p("Over HTTP, send it as a header or in the body:"),
    code("bash", `Idempotency-Key: pwd-reset-8821-4c1`, "header"),
    h("Choosing a key"),
    list([
      ["Derive it from the ", b("action"), ", not the attempt — e.g. the order id, not a random per-request value."],
      ["Keys are scoped to your workspace and remembered for 24 hours."],
      ["Reusing a key with a different body returns the first result; it does not send the new one."],
    ]),
    callout("tip", "For transactional mail tied to a database row, the row's id (plus a purpose) makes a perfect key."),
  ],
};

export const pagination: DocPage = {
  slug: "pagination",
  title: "Pagination",
  summary: "Cursor-based paging over list endpoints.",
  blocks: [
    p(
      "List endpoints return up to ",
      c("limit"),
      " items (default 20, max 100) plus a ",
      c("next_cursor"),
      ". Pass it back as ",
      c("cursor"),
      " to fetch the next page; a ",
      c("null"),
      " cursor means you've reached the end.",
    ),
    code(
      "ts",
      `let cursor: string | undefined;
do {
  const page = await mail.messages.list({ limit: 100, cursor });
  for (const m of page.data) process(m);
  cursor = page.nextCursor ?? undefined;
} while (cursor);`,
      "paginate.ts",
    ),
    params([
      { name: "limit", type: "integer", desc: ["1–100. Defaults to 20."] },
      { name: "cursor", type: "string", desc: ["The ", c("next_cursor"), " from the previous page. Omit for the first page."] },
    ]),
  ],
};

export const errors: DocPage = {
  slug: "errors",
  title: "Errors",
  summary: "Consistent error shapes and the full code catalog.",
  blocks: [
    p("Errors use standard HTTP status codes and a consistent JSON body:"),
    code(
      "json",
      `{
  "error": {
    "type": "feature_locked",
    "message": "Sequences are on the Marketing Growth plan.",
    "details": { "required_plan": "mk_growth", "upgrade_url": "…" }
  }
}`,
      "error.json",
    ),
    p(
      "The SDK throws a single ",
      c("RootMailError"),
      " with ",
      c(".status"),
      ", ",
      c(".type"),
      ", and ",
      c(".details"),
      " so you can branch on the machine-readable ",
      c("type"),
      " rather than parsing messages.",
    ),
    code(
      "ts",
      `import { RootMailError } from "@rootmail/node";

try {
  await mail.sequences.create({ /* … */ });
} catch (e) {
  if (e instanceof RootMailError && e.type === "feature_locked") {
    // send them to e.details.upgrade_url
  }
}`,
      "handle-error.ts",
    ),
    h("Status codes"),
    params([
      { name: "400", type: "bad_request", desc: ["Invalid or missing parameters. The message says which."] },
      { name: "401", type: "unauthorized", desc: ["Missing, malformed, or revoked API key."] },
      { name: "402", type: "feature_locked", desc: ["The feature needs a higher plan or an add-on. ", c("details"), " carries the upgrade path."] },
      { name: "403", type: "forbidden", desc: ["Authenticated, but your role or scope isn't allowed."] },
      { name: "404", type: "not_found", desc: ["No such resource in this workspace."] },
      { name: "409", type: "conflict", desc: ["A uniqueness or state conflict — e.g. a duplicate slug."] },
      { name: "429", type: "rate_limited", desc: ["Too many requests. Back off and retry — see Rate limits."] },
    ]),
    callout(
      "note",
      "Validation is strict and fails closed: a paid feature is never silently granted, and a bad write never partially applies.",
    ),
  ],
};

export const sandbox: DocPage = {
  slug: "sandbox",
  title: "Sandbox & test recipients",
  summary: "Two lanes: rehearse your integration for free, then prove real delivery safely.",
  blocks: [
    p(
      "Testing email splits cleanly in two. The ",
      b("sandbox"),
      " proves your integration — that you're calling the API correctly and your templates render. ",
      b("Test recipients"),
      " prove the outside world — that mail actually goes out, gets signed, delivers, bounces and comes back through your webhooks.",
    ),

    h("The sandbox: a free rehearsal"),
    p(
      "A ",
      c("rm_test_…"),
      " key runs every request through the full pipeline — validation, suppression, rendering, events — but ",
      b("never delivers"),
      " and ",
      b("never bills"),
      ". It's a separate workspace with its own data, so nothing you do there can touch production. Open it in the dashboard from ",
      b("Developers → Testing"),
      " — it's deliberately kept out of the workspace picker, since it isn't a product you run.",
    ),
    list([
      ["Sandbox messages are stored with their full rendered content — read them back over the API, or in the dashboard under ", b("Testing"), "."],
      ["Webhooks still fire for sandbox sends, so you can verify your handlers."],
      ["Sandbox sends are free forever and don't count toward any quota."],
    ]),
    callout(
      "warn",
      "What the sandbox can't prove: delivery. Nothing is handed to a provider, so a green sandbox run says your code is right — not that your mail arrives.",
    ),

    h("Test recipients: the real path, safely"),
    p(
      "Every address at ",
      c("test.rootmail.dev"),
      " is a scenario. Mail sent to one takes the ",
      b("real"),
      " send path — your DKIM key, your sending provider, your webhooks — but is delivered to the provider's mailbox simulator. No person receives it, and it's excluded from your sender reputation, so you can force a hard bounce as often as you like at no cost.",
    ),
    params(
      [
        { name: "delivered@test.rootmail.dev", type: "delivered", desc: ["A clean delivery, with a real ", c("message.delivered"), " event."] },
        { name: "bounced@test.rootmail.dev", type: "bounced", desc: ["A permanent rejection. The address is auto-suppressed, exactly as a real hard bounce would be."] },
        { name: "complained@test.rootmail.dev", type: "complained", desc: ["The recipient reports spam — proves complaint handling and auto-suppression."] },
        { name: "suppressed@test.rootmail.dev", type: "suppressed", desc: ["Already on the provider's suppression list; the send is refused before it goes anywhere."] },
        { name: "away@test.rootmail.dev", type: "delivered", desc: ["Delivers, then returns an out-of-office auto-reply — useful for reply handling."] },
      ],
      "Scenarios",
    ),
    code(
      "ts",
      `// Prove your bounce handling, end to end.
const { data } = await mail.testing.list();
const bounce = data.find((t) => t.slug === "bounced")!;

await mail.messages.create({
  to: bounce.email,             // bounced@test.rootmail.dev
  subject: "Bounce me",
  html: "<p>This should never arrive.</p>",
});
// → message.sent, then message.bounced on your webhook,
//   and the address lands on your suppression list.

// Bounce tests suppress the address. Clear them to run again:
await mail.testing.reset();`,
      "test-recipients.ts",
    ),
    ...reqres("GET", "/v1/test-recipients", "List every scenario and the address that triggers it.", {
      response: `{
  "object": "list",
  "domain": "test.rootmail.dev",
  "data": [
    {
      "object": "test_recipient",
      "slug": "bounced",
      "email": "bounced@test.rootmail.dev",
      "label": "Hard bounce",
      "description": "The address rejects permanently…",
      "outcome": "bounced"
    }
  ]
}`,
    }),
    ...reqres("POST", "/v1/test-recipients/reset", "Clear suppressions for the test domain so scenarios can be re-run.", {
      response: `{
  "object": "test_recipients_reset",
  "cleared": 2,
  "emails": ["bounced@test.rootmail.dev", "complained@test.rootmail.dev"]
}`,
    }),
    callout(
      "note",
      "Test recipients work from a live workspace (an ordinary send against your quota) and from the sandbox, where they still go out for real — free, up to 50 a day.",
    ),
    callout("tip", "Point your CI's ROOTMAIL_API_KEY at a test key, and assert on real responses without emailing anyone. Reach for a test recipient when the thing under test is delivery itself."),
  ],
};

export const rateLimits: DocPage = {
  slug: "rate-limits",
  title: "Rate limits",
  summary: "How throttling works and how to handle a 429.",
  blocks: [
    p(
      "The API is rate-limited per key to keep the platform fast and fair. When you exceed the limit you get a ",
      c("429 rate_limited"),
      "; back off and retry.",
    ),
    p("A resilient client retries 429s with exponential backoff and jitter:"),
    code(
      "ts",
      `async function withRetry<T>(fn: () => Promise<T>, tries = 5): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries || !(e instanceof RootMailError) || e.status !== 429) throw e;
      await new Promise((r) => setTimeout(r, 2 ** i * 200 + Math.random() * 100));
    }
  }
}`,
      "retry.ts",
    ),
    callout("note", "Send volume itself is governed by your plan's blocks and daily caps, not the request rate limit — the two are separate."),
  ],
};
