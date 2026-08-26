import { env } from "@rootmail/core";
import type { MailProvider, OutboundEmail, SendResult } from "./types";

/**
 * Mailgun.
 *
 * A second provider, and deliberately a PEER of SES rather than a fallback.
 * rootmail is email infrastructure whose entire product can be switched off by
 * one vendor's approval queue — that is a single point of failure at the centre
 * of the thing we sell. Two providers is architecture, not expedience.
 *
 * Mailgun runs its own MTA fleet and IP ranges; it is not built on SES, so the
 * two fail independently, which is the whole point.
 *
 * ── Differences from SES that shaped this file ──────────────────────────────
 *
 *  - The sending domain is part of the URL, not a header. Mailgun rejects a From
 *    whose domain is not the domain being posted to, so the From address decides
 *    the endpoint — which maps cleanly onto per-client sending domains.
 *  - Custom headers go through an `h:` prefix rather than a structured field, and
 *    unlike SES, Mailgun does NOT reserve Message-ID: `h:Message-Id` is honoured.
 *    So the threading id we generate actually survives here, where SES replaces
 *    it. `sesSafeHeaders` must NOT be applied to this provider.
 *  - The response `id` IS the RFC Message-ID, angle brackets included. Stored as
 *    `providerMessageId` like SES's, so the inbound matcher can resolve it.
 */
/** A customer's own Mailgun credentials. */
export interface MailgunCredentials {
  apiKey: string;
  domain?: string;
  region?: "us" | "eu";
}

export class MailgunProvider implements MailProvider {
  readonly name = "mailgun";
  private readonly creds: MailgunCredentials | undefined;

  /** No argument = the platform's own account; credentials = the customer's. */
  constructor(creds?: MailgunCredentials) {
    this.creds = creds;
  }

  private key(): string | undefined {
    return this.creds?.apiKey ?? env.MAILGUN_API_KEY;
  }

  private baseUrl(): string {
    // EU-hosted accounts are a different hostname entirely; posting to the US
    // one with EU credentials fails in a way that reads as a bad API key.
    const region = this.creds?.region ?? env.MAILGUN_REGION;
    return region === "eu" ? "https://api.eu.mailgun.net/v3" : "https://api.mailgun.net/v3";
  }

  /** Which Mailgun domain sends this — the From domain, else the configured default. */
  private sendingDomain(fromEmail: string): string {
    const domain = fromEmail.split("@")[1]?.toLowerCase();
    return domain || this.creds?.domain || env.MAILGUN_DOMAIN || "";
  }

  async send(email: OutboundEmail): Promise<SendResult> {
    const key = this.key();
    if (!key) throw new Error("No Mailgun API key — connect an account or set MAILGUN_API_KEY");

    const domain = this.sendingDomain(email.from.email);
    if (!domain) throw new Error("No Mailgun sending domain — set MAILGUN_DOMAIN or send from a verified domain");

    const form = new FormData();
    form.set("from", email.from.name ? `${email.from.name} <${email.from.email}>` : email.from.email);
    form.set("to", email.to);
    form.set("subject", email.subject);
    if (email.html) form.set("html", email.html);
    if (email.text) form.set("text", email.text);
    if (email.replyTo) form.set("h:Reply-To", email.replyTo);

    // Every header we build — including Message-ID, which Mailgun honours.
    for (const h of email.headers ?? []) form.set(`h:${h.name}`, h.value);

    // Our own click/open tracking is what the product reports on; letting the
    // provider rewrite links as well would double-count and change the URLs the
    // proof bundle hashed.
    form.set("o:tracking", "no");

    for (const a of email.attachments ?? []) {
      form.append(
        "attachment",
        new Blob([new Uint8Array(a.content)], { type: a.contentType }),
        a.filename,
      );
    }

    const res = await fetch(`${this.baseUrl()}/${encodeURIComponent(domain)}/messages`, {
      method: "POST",
      headers: { authorization: `Basic ${Buffer.from(`api:${key}`).toString("base64")}` },
      body: form,
    });

    if (!res.ok) {
      // Mailgun's errors are a plain `message` field; surfacing it verbatim is
      // what makes "domain not verified" legible instead of "HTTP 400".
      const body = await res.text().catch(() => "");
      let detail = body.slice(0, 300);
      try {
        detail = (JSON.parse(body) as { message?: string }).message ?? detail;
      } catch {
        // Not JSON — the raw body is the best we have.
      }
      throw new Error(`Mailgun refused this message (${res.status}): ${detail}`);
    }

    const json = (await res.json()) as { id?: string };
    return {
      provider: this.name,
      // Angle brackets included, exactly as Mailgun returns it — this IS the
      // Message-ID, so a reply quoting it resolves without transformation.
      providerMessageId: json.id ?? "",
    };
  }
}
