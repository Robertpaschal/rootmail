"use client";

import { useId, useState } from "react";
import { CodeBlock } from "./code-block";
import { RunButton, Segmented } from "./controls";
import { Panel, PanelHead } from "./panel";
import { CACHED_SEND, DEMO_DISCLOSURE, renderBody, type DemoRun } from "@/lib/demo";
import { cn } from "@/lib/utils";

/**
 * D1 — THE CALL AND THE RESPONSE, AND THE HONEST WORD IN IT.
 * `docs/design/04-EXPERIENCE.md` §8.4.
 *
 * A bakery owner is convinced by watching a mechanism. A developer is
 * convinced by running it and reading what comes back — so the first artifact
 * on this site returns something, and the thing it returns is the real shape.
 *
 * THREE THINGS THAT ARE NOT OBVIOUS FROM THE MARKUP
 *
 * 1. **The status is `202`, not `201`.** `apps/api/src/routes/messages.ts`
 *    ends `POST /v1/messages` with `reply.status(202)`, because the send is
 *    accepted and enqueued, not created-and-done. The design spec sketched
 *    `201 Created`; the code is the authority, and a developer checks.
 * 2. **All four language panels are in the DOM at all times**, with the
 *    inactive ones at `visibility: hidden` rather than removed. That locks the
 *    column to the tallest variant, so switching language cannot move the page
 *    under the reader — a code panel that resizes on tab change is the tell of
 *    a page assembled rather than authored. `visibility: hidden` also takes
 *    them out of the accessibility tree, which `display: none` would do too
 *    but at the cost of the height lock.
 * 3. **The response panel starts full.** It renders a previous run,
 *    server-side, labelled `cached example`. Nothing on this fold waits on a
 *    click, and with JavaScript disabled the entire artifact still reads
 *    (Law 1). Pressing Send it replaces it with a live one.
 *
 * Only ONE of these is an SDK. Node has `@rootmail/node`; Python, Go and cURL
 * call the same REST route with their standard library, and the caption says
 * so — shipping a fake `pip install rootmail` on the page that argues for
 * honest reporting would be its own answer.
 */

const KEY = "demo-8f21c4";

const LANGS = [
  {
    id: "ts",
    label: "TypeScript",
    filename: "send.ts",
    code: `import { RootMail } from "@rootmail/node";

const mail = new RootMail({ apiKey: process.env.ROOTMAIL_API_KEY! });

const msg = await mail.send({
  to: "delivered@test.rootmail.dev",
  subject: "Your booking is confirmed",
  html: "<p>See you Friday.</p>",
  idempotencyKey: "${KEY}",
});`,
  },
  {
    id: "py",
    label: "Python",
    filename: "send.py",
    code: `import os, requests

r = requests.post(
    "https://api.rootmail.io/v1/messages",
    headers={"Authorization": f"Bearer {os.environ['ROOTMAIL_API_KEY']}"},
    json={
        "to": "delivered@test.rootmail.dev",
        "subject": "Your booking is confirmed",
        "html": "<p>See you Friday.</p>",
        "idempotency_key": "${KEY}",
    },
)`,
  },
  {
    id: "go",
    label: "Go",
    filename: "send.go",
    code: `body, _ := json.Marshal(map[string]any{
	"to":              "delivered@test.rootmail.dev",
	"subject":         "Your booking is confirmed",
	"html":            "<p>See you Friday.</p>",
	"idempotency_key": "${KEY}",
})

req, _ := http.NewRequest("POST",
	"https://api.rootmail.io/v1/messages", bytes.NewReader(body))
req.Header.Set("Authorization", "Bearer "+os.Getenv("ROOTMAIL_API_KEY"))
req.Header.Set("Content-Type", "application/json")

res, err := http.DefaultClient.Do(req)`,
  },
  {
    id: "curl",
    label: "cURL",
    filename: "send.sh",
    code: `curl -X POST https://api.rootmail.io/v1/messages \\
  -H "Authorization: Bearer $ROOTMAIL_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "delivered@test.rootmail.dev",
    "subject": "Your booking is confirmed",
    "html": "<p>See you Friday.</p>",
    "idempotency_key": "${KEY}"
  }'`,
  },
] as const;

export function CallResponse() {
  const [lang, setLang] = useState(0);
  const [run, setRun] = useState<DemoRun>(CACHED_SEND);
  const [pending, setPending] = useState(false);
  const idBase = useId();

  const send = async () => {
    setPending(true);
    try {
      const res = await fetch("/api/demo/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: `demo-${Math.random().toString(16).slice(2, 10)}` }),
      });
      setRun((await res.json()) as DemoRun);
    } catch {
      setRun({ ...CACHED_SEND, note: "cached example — this browser could not reach the demo" });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
      <div>
        <Segmented
          options={LANGS}
          active={lang}
          onChange={setLang}
          label="Language"
          idBase={idBase}
        />
        {/* `grid-cols-[minmax(0,1fr)]`, not a bare `grid`. A grid item's default
              `min-width: auto` refuses to shrink below its content, so the four
              stacked code panels sized the column to the WIDEST line in any of
              them and pushed the whole document 364px wide on a 375px phone —
              the `overflow-x-auto` on the <pre> never got a chance to engage.
              The explicit `minmax(0,…)` track is what lets it. */}
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)]">
          {LANGS.map((l, i) => (
            <div
              key={l.id}
              role="tabpanel"
              id={`${idBase}-panel-${l.id}`}
              aria-labelledby={`${idBase}-tab-${l.id}`}
              className={cn("min-w-0 [grid-area:1/1]", i === lang ? "visible" : "invisible")}
            >
              <CodeBlock code={l.code} filename={l.filename} />
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-3">
          <RunButton onClick={send} disabled={pending}>
            {pending ? "sending…" : "Send it"}
          </RunButton>
          <span className="font-mono text-[12.5px] text-ink-muted" data-fact>
            {DEMO_DISCLOSURE}
          </span>
        </div>

        <Response run={run} className="mt-3" />

        <p className="mt-4 max-w-md text-sm text-ink-muted">
          <code className="font-mono text-foreground">queued</code> is the only status we can
          honestly return in a request. Everything after it arrives on your webhook, and we draw
          the difference.
        </p>
      </div>
    </div>
  );
}

/** The response panel — shared with D3, which renders two of them. */
export function Response({
  run,
  className,
  request,
  compact,
}: {
  run: DemoRun;
  className?: string;
  /** D3 labels each of its two panels. */
  request?: string;
  /** D3 prints `id` and `status` only — see `renderBody`. */
  compact?: boolean;
}) {
  return (
    <Panel className={className}>
      <PanelHead>
        {/* A STATUS CODE IS A PROTOCOL FACT, NOT A MESSAGE STATE. This used to
            paint 202 in `--witnessed`, which reads as "the provider confirmed
            delivery" — and a 202 means the opposite: we accepted it and have
            not yet seen anything happen to it. §10.2 reserves those three
            colours for what happened to a message; the honest word in this
            panel is the `status` field in the body, and it says `queued`. */}
        <span className="text-foreground">
          {request ? `${request}  ` : ""}
          {run.status} {run.statusText} · {run.ms}ms
        </span>
        <span>{run.live ? "live" : run.note}</span>
      </PanelHead>
      {run.replayed ? (
        // The real response header, on its own ground because it is the single
        // thing D3 exists to show. No accent: it is a fact we are reporting,
        // not something to press.
        <div className="border-b border-rule bg-muted px-3 py-2 font-mono text-[12.5px]" data-fact>
          <span className="text-ink-muted">Idempotent-Replayed:</span>{" "}
          <span className="text-foreground">true</span>
        </div>
      ) : null}
      <pre className="overflow-x-auto px-3 py-3 text-[13.5px] leading-[1.7]">
        <code className="font-mono">{renderBody(run, compact)}</code>
      </pre>
    </Panel>
  );
}
