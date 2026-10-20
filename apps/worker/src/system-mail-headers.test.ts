import assert from "node:assert/strict";
import { after, describe, it, mock } from "node:test";
import { SESv2Client } from "@aws-sdk/client-sesv2";
import { SYSTEM_MAIL_CLASSES, verifyUnsubscribeToken } from "@rootmail/core";
import { SesProvider } from "./providers/ses";
import { systemMailUnsubHeaders } from "./system-mail-headers";

// RFC 8058 one-click unsubscribe on rootmail's own mail: only the class that may
// be unsubscribed from carries it, and it survives to the SES payload on both
// the Simple and the Raw (attachments) paths. No database, no network.
const ws = "ws_internal_test";
const to = "owner@example.test";

describe("systemMailUnsubHeaders", () => {
  it("marketing (win-back, announcements) gets both headers with a valid signed /v1/unsubscribe URL", () => {
    const h = systemMailUnsubHeaders("marketing", ws, to);
    assert.deepEqual(h.map((x) => x.name), ["List-Unsubscribe", "List-Unsubscribe-Post"]);
    assert.equal(h[1].value, "List-Unsubscribe=One-Click");
    const m = /^<(https?:\/\/[^>]+)>$/.exec(h[0].value);
    assert.ok(m, h[0].value);
    const url = new URL(m[1]);
    assert.equal(url.pathname, "/v1/unsubscribe");
    assert.deepEqual(verifyUnsubscribeToken(url.searchParams.get("token")!), { w: ws, e: to });
  });

  it("security and transactional (must-arrive) mail get neither header", () => {
    for (const cls of SYSTEM_MAIL_CLASSES.filter((c) => c !== "marketing")) {
      assert.deepEqual(systemMailUnsubHeaders(cls, ws, to), [], cls);
    }
  });

  it("a tampered token does not verify", () => {
    const url = new URL(/^<([^>]+)>$/.exec(systemMailUnsubHeaders("marketing", ws, to)[0].value)![1]);
    const [body, sig] = url.searchParams.get("token")!.split(".");
    const forged = Buffer.from(JSON.stringify({ w: ws, e: "someone-else@example.test" })).toString("base64url");
    assert.equal(verifyUnsubscribeToken(`${forged}.${sig}`), null);
    assert.ok(verifyUnsubscribeToken(`${body}.${sig}`));
  });
});

describe("SES wire payload", () => {
  const inputs: Record<string, any>[] = [];
  mock.method(SESv2Client.prototype, "send", async (command: { input: Record<string, any> }) => {
    inputs.push(command.input);
    return { MessageId: "ses-test" };
  });
  after(() => mock.restoreAll());
  const base = { messageId: "msg_test", from: { email: "no-reply@rootmail.dev", name: "rootmail" }, to, subject: "s", html: "<p>h</p>", text: "h" };

  it("Simple path: both headers are in Content.Simple.Headers", async () => {
    const headers = systemMailUnsubHeaders("marketing", ws, to);
    await new SesProvider().send({ ...base, headers });
    const sent = inputs.at(-1)!.Content.Simple.Headers as { Name: string; Value: string }[];
    assert.deepEqual(sent, headers.map((h) => ({ Name: h.name, Value: h.value })));
  });

  it("Raw path (attachments): both headers are in the MIME header block", async () => {
    const headers = systemMailUnsubHeaders("marketing", ws, to);
    await new SesProvider().send({ ...base, headers, attachments: [{ filename: "a.txt", contentType: "text/plain", content: Buffer.from("x") }] });
    const raw = Buffer.from(inputs.at(-1)!.Content.Raw.Data).toString("utf8");
    const head = raw.split(/\r\n\r\n/)[0];
    assert.ok(head.includes(`List-Unsubscribe: ${headers[0].value}`), head);
    assert.ok(head.includes("List-Unsubscribe-Post: List-Unsubscribe=One-Click"), head);
  });

  it("no headers → no Headers field (must-arrive mail unchanged on the wire)", async () => {
    await new SesProvider().send({ ...base, headers: systemMailUnsubHeaders("security", ws, to) });
    assert.equal(inputs.at(-1)!.Content.Simple.Headers, undefined);
  });
});
