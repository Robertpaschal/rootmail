import { a, b, c, callout, code, DocPage, h, list, p, params } from "../types";

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
  title: "Sandbox & test mode",
  summary: "Build and test end-to-end without sending real mail — always free.",
  blocks: [
    p(
      "A ",
      c("rm_test_…"),
      " key runs every request through the full pipeline — validation, suppression, rendering, events — but ",
      b("never delivers"),
      " and ",
      b("never bills"),
      ". Use it in development and CI to exercise real code paths safely.",
    ),
    list([
      ["Test-mode messages appear in the dashboard's ", b("Test inbox"), " so you can preview exactly what would have gone out."],
      ["Webhooks still fire for test sends, so you can verify your handlers."],
      ["Sandbox sends are free forever and don't count toward any quota."],
    ]),
    callout("tip", "Point your CI's ROOTMAIL_API_KEY at a test key. Your test suite can assert on real responses without emailing anyone."),
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
