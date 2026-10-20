import type { SmtpTestHooks } from "@rootmail/core";
import { smtpClient, type SmtpLogin } from "@rootmail/core/smtp-client";
import { awsAssume } from "@rootmail/core/aws-assume";
import { GetAccountCommand, ListEmailIdentitiesCommand, SESv2Client } from "@aws-sdk/client-sesv2";

/**
 * Do these credentials actually work, before we store them?
 *
 * Storing an untested credential means the customer finds out mid-campaign, with
 * a queue of failed messages and no idea which of the two accounts was at fault.
 * The check is deliberately a READ — we are not going to send a message from
 * someone's account to prove they own it.
 */
export type CredentialCheck =
  | { ok: true; domain?: string | null; note?: string }
  | { ok: false; reason: string };

export async function checkSendingCredentials(
  input:
    | { provider: "ses"; access_key_id: string; secret_access_key: string; region: string }
    | { provider: "mailgun"; api_key: string; domain: string; region: "us" | "eu" },
): Promise<CredentialCheck> {
  if (input.provider === "ses") {
    return checkSesAccount(new SESv2Client({
      region: input.region,
      credentials: { accessKeyId: input.access_key_id, secretAccessKey: input.secret_access_key },
    }));
  }

  const base = input.region === "eu" ? "https://api.eu.mailgun.net/v3" : "https://api.mailgun.net/v3";
  try {
    const res = await fetch(`${base}/domains/${encodeURIComponent(input.domain)}`, {
      headers: { authorization: `Basic ${Buffer.from(`api:${input.api_key}`).toString("base64")}` },
    });
    if (res.status === 401) return { ok: false, reason: "Mailgun rejected that API key." };
    if (res.status === 404) {
      return {
        ok: false,
        reason: `Mailgun has no domain called "${input.domain}" on that account. Check the spelling, and that you picked the right region.`,
      };
    }
    if (!res.ok) return { ok: false, reason: `Mailgun returned HTTP ${res.status}.` };

    const json = (await res.json()) as { domain?: { state?: string } };
    if (json.domain?.state && json.domain.state !== "active") {
      return {
        ok: false,
        reason: `that domain is "${json.domain.state}" at Mailgun, not active — finish its DNS setup there first.`,
      };
    }
    return { ok: true, domain: input.domain, note: "Mailgun domain verified." };
  } catch (e) {
    return { ok: false, reason: (e as Error)?.message ?? "couldn't reach Mailgun." };
  }
}

/** GetAccount on a tenant's SES account: reachable, permitted, and out of the sandbox. */
async function checkSesAccount(client: SESv2Client): Promise<CredentialCheck> {
  try {
    const acct = await client.send(new GetAccountCommand({}));
    // Their sandbox is their problem, but they should hear it from us NOW
    // rather than from a failed send — it is the single most likely reason a
    // connected account cannot mail their customers.
    if (acct.ProductionAccessEnabled === false) {
      return {
        ok: false,
        reason:
          "that AWS account is still in the SES sandbox, so it can only send to addresses it has verified. Request production access in the SES console, then connect it here.",
      };
    }
    return { ok: true, note: "SES account verified." };
  } catch (e) {
    const name = (e as { name?: string })?.name ?? "";
    if (name.includes("UnrecognizedClient") || name.includes("InvalidClientTokenId")) {
      return { ok: false, reason: "the access key wasn't recognised by AWS." };
    }
    if (name.includes("AccessDenied")) {
      return {
        ok: false,
        reason: "those keys work but lack SES permission — they need ses:SendEmail and ses:GetAccount.",
      };
    }
    return { ok: false, reason: (e as Error)?.message ?? "AWS rejected them." };
  }
}

/**
 * The identities (domains and addresses) the tenant's SES account has verified
 * AND may send from. The From of every BYO send must be one of these.
 * Needs ses:ListEmailIdentities; a READ, like the check above.
 */
export async function listSesVerifiedIdentities(input: {
  access_key_id: string;
  secret_access_key: string;
  region: string;
}): Promise<{ ok: true; identities: string[] } | { ok: false; reason: string }> {
  return listIdentities(new SESv2Client({
    region: input.region,
    credentials: { accessKeyId: input.access_key_id, secretAccessKey: input.secret_access_key },
  }));
}

async function listIdentities(client: SESv2Client): Promise<{ ok: true; identities: string[] } | { ok: false; reason: string }> {
  try {
    const out: string[] = [];
    let NextToken: string | undefined;
    for (let page = 0; page < 20; page++) {
      const res = await client.send(new ListEmailIdentitiesCommand({ NextToken, PageSize: 100 }));
      for (const id of res.EmailIdentities ?? []) {
        if (id.IdentityName && id.SendingEnabled && id.VerificationStatus === "SUCCESS") {
          out.push(id.IdentityName.toLowerCase());
        }
      }
      NextToken = res.NextToken;
      if (!NextToken) break;
    }
    return { ok: true, identities: out };
  } catch (e) {
    const name = (e as { name?: string })?.name ?? "";
    if (name.includes("AccessDenied")) {
      return { ok: false, reason: "those keys can't list your SES identities — add ses:ListEmailIdentities." };
    }
    return { ok: false, reason: (e as Error)?.message ?? "AWS rejected the identity lookup." };
  }
}

/**
 * A tenant's own SMTP server: vet the host (SSRF guard), connect to the vetted
 * IP with SNI, require TLS, authenticate, then QUIT. No message is sent.
 * `testHooks` exist for tests only.
 */
export async function checkSmtpCredentials(input: SmtpLogin, testHooks: SmtpTestHooks = {}): Promise<CredentialCheck> {
  const res = await smtpClient.verifySmtpLogin(input, testHooks);
  return res.ok ? { ok: true, note: "SMTP server accepted a secure login." } : res;
}

/**
 * A tenant's SES through an IAM role: assume it (our assumer role, then theirs
 * with our ExternalId), then the same READ checks as access keys. Sends nothing.
 */
export async function checkSesRole(
  input: { orgId: string; role_arn: string; external_id: string; region: string },
): Promise<{ ok: true; identities: string[] } | { ok: false; reason: string }> {
  let creds;
  try {
    creds = await awsAssume.assumeTenantRole({ orgId: input.orgId, roleArn: input.role_arn, externalId: input.external_id });
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
  const client = new SESv2Client({ region: input.region, credentials: creds });
  const account = await checkSesAccount(client);
  if (!account.ok) {
    return { ok: false, reason: account.reason.replace("those keys work but lack", "the role works but lacks").replace("they need", "it needs") };
  }
  return listIdentities(client);
}
