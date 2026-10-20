import { createHmac } from "node:crypto";
import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";
import { env } from "./env";

/**
 * Bring-your-own-provider: Amazon SES through an IAM role the TENANT owns.
 *
 * Chain (no tenant secret is ever stored):
 *   1. our default credentials (the instance role rootmail-app, via IMDSv2);
 *   2. assume BYO_ASSUMER_ROLE_ARN (rootmail-byo-assumer), 15 min, session byo-<org>;
 *   3. assume the tenant's role with OUR per-connection ExternalId, 15 min,
 *      session rootmail-<org>.
 * The tenant's trust policy names only the assumer role and requires that
 * ExternalId (StringEquals sts:ExternalId), so no other AWS customer — and no
 * other Rootmail tenant — can make us act on their role (confused deputy).
 *
 * Kept out of the core index (import "@rootmail/core/aws-assume") so the
 * dashboard bundle never pulls in the STS client.
 */

export const ASSUME_ROLE_SECONDS = 900;
/** Refresh this long before expiry, so a send never starts on credentials about to lapse. */
// The AWS SDK itself treats credentials within 5 minutes of expiry as expired,
// so ours must refresh earlier than that or every send would re-ask.
export const ASSUME_ROLE_REFRESH_MS = 6 * 60_000;
const STS_TIMEOUT_MS = 10_000;

export interface AssumedCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: Date;
}

/** Assume-role is offered only when ops configured the assumer role. */
export function assumeRoleAvailable(assumer: string | undefined = env.BYO_ASSUMER_ROLE_ARN): boolean {
  return Boolean(assumer && /^arn:aws:iam::\d{12}:role\/[\w+=,.@\/-]{1,512}$/.test(assumer));
}

/** RoleSessionName allows [\w+=,.@-], 2–64 chars. Org ids fit; anything else is replaced. */
export function sessionName(prefix: string, orgId: string): string {
  return `${prefix}-${orgId}`.replace(/[^\w+=,.@-]/g, "-").slice(0, 64);
}

/**
 * The ExternalId for an org: derived (HMAC) from our credentials key, so it is
 * stable before the tenant has connected (they need it to write the trust
 * policy), unguessable, and different for every org. On connect it is ALSO
 * stored inside the sealed credentials, and the stored copy is what we use.
 */
export function externalIdFor(orgId: string, key: string | undefined = env.PROVIDER_CREDENTIALS_KEY): string | null {
  if (!key) return null;
  return `rm-${createHmac("sha256", key).update(`byo-external-id:${orgId}`).digest("base64url").slice(0, 32)}`;
}

/** Valid tenant role ARN (any account; not ours is checked by the caller). */
export const ROLE_ARN_RE = /^arn:aws:iam::(\d{12}):role\/[\w+=,.@\/-]{1,512}$/;

function credsOf(out: { Credentials?: { AccessKeyId?: string; SecretAccessKey?: string; SessionToken?: string; Expiration?: Date } }): AssumedCredentials {
  const c = out.Credentials;
  if (!c?.AccessKeyId || !c.SecretAccessKey || !c.SessionToken || !c.Expiration) {
    throw new Error("AWS returned no credentials for the role");
  }
  return { accessKeyId: c.AccessKeyId, secretAccessKey: c.SecretAccessKey, sessionToken: c.SessionToken, expiration: c.Expiration };
}

/** Seams for tests only. */
export interface AssumeHooks {
  stsFor?: (creds?: AssumedCredentials) => Pick<STSClient, "send">;
}

const defaultSts = (creds?: AssumedCredentials) =>
  new STSClient({
    region: env.AWS_REGION ?? "us-east-1",
    ...(creds ? { credentials: creds } : {}),
    requestHandler: { requestTimeout: STS_TIMEOUT_MS, connectionTimeout: STS_TIMEOUT_MS } as never,
  });

/** Run the two-hop chain. Throws an Error whose message is safe to show the tenant. */
export async function assumeTenantRole(
  input: { orgId: string; roleArn: string; externalId: string },
  hooks: AssumeHooks = {},
): Promise<AssumedCredentials> {
  const assumer = env.BYO_ASSUMER_ROLE_ARN;
  if (!assumeRoleAvailable(assumer)) throw new Error("connecting with an IAM role isn't available on this server");
  const stsFor = hooks.stsFor ?? defaultSts;
  let hop1: AssumedCredentials;
  try {
    hop1 = credsOf(await stsFor().send(new AssumeRoleCommand({
      RoleArn: assumer!,
      RoleSessionName: sessionName("byo", input.orgId),
      DurationSeconds: ASSUME_ROLE_SECONDS,
    })));
  } catch {
    // Our side, not theirs: never show the tenant our role or AWS's wording.
    throw new Error("Rootmail couldn't start a session for your role right now; try again shortly");
  }
  try {
    return credsOf(await stsFor(hop1).send(new AssumeRoleCommand({
      RoleArn: input.roleArn,
      RoleSessionName: sessionName("rootmail", input.orgId),
      ExternalId: input.externalId,
      DurationSeconds: ASSUME_ROLE_SECONDS,
    })));
  } catch (e) {
    const name = (e as { name?: string })?.name ?? "";
    if (name.includes("AccessDenied")) {
      throw new Error("AWS refused to let Rootmail assume that role. Check its trust policy names Rootmail's role and the external ID exactly");
    }
    throw new Error(`AWS couldn't assume that role (${name || "error"})`);
  }
}

/** What the tenant pastes into IAM. */
export function tenantPolicies(externalId: string, assumer: string | undefined = env.BYO_ASSUMER_ROLE_ARN) {
  return {
    trust: {
      Version: "2012-10-17",
      Statement: [{
        Effect: "Allow",
        Principal: { AWS: assumer ?? "" },
        Action: "sts:AssumeRole",
        Condition: { StringEquals: { "sts:ExternalId": externalId } },
      }],
    },
    permissions: {
      Version: "2012-10-17",
      Statement: [{
        Effect: "Allow",
        Action: ["ses:SendEmail", "ses:GetAccount", "ses:ListEmailIdentities"],
        Resource: "*",
      }],
    },
  };
}

/** Callers use this object, so DB-backed tests can stub STS with mock.method. */
export const awsAssume = { assumeTenantRole };
