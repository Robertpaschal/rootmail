import {
  CreateReceiptRuleCommand,
  DescribeActiveReceiptRuleSetCommand,
  SESClient,
} from "@aws-sdk/client-ses";
import {
  CreateEmailIdentityCommand,
  GetEmailIdentityCommand,
  CreateConfigurationSetCommand,
  CreateConfigurationSetEventDestinationCommand,
  CreateDedicatedIpPoolCommand,
  GetConfigurationSetEventDestinationsCommand,
  SESv2Client,
} from "@aws-sdk/client-sesv2";
import { env } from "@rootmail/core";

/**
 * The AWS side of provisioning — the work a staff member used to do by hand in
 * the SES console while a paying customer waited.
 *
 * Everything here returns a typed result instead of throwing. A provisioning
 * failure must leave the customer's state untouched and legible ("still
 * setting up") rather than half-done: a half-provisioned dedicated IP is worse
 * than none, because billing says active while mail says otherwise.
 */

export type ProvisionResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string; retryable: boolean };

function sesv2(): SESv2Client {
  return new SESv2Client(env.AWS_REGION ? { region: env.AWS_REGION } : {});
}
function ses(): SESClient {
  return new SESClient(env.AWS_REGION ? { region: env.AWS_REGION } : {});
}

/** AWS names allow a narrow charset; an org slug can contain anything. */
function safeName(prefix: string, raw: string): string {
  const slug = raw.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 40);
  return `${prefix}${slug}`.replace(/-$/, "");
}

/** True when the failure is an IAM/permission problem rather than a real error. */
function isAccessDenied(e: unknown): boolean {
  const name = (e as { name?: string })?.name ?? "";
  return name === "AccessDeniedException" || name === "AccessDenied" || name === "NotAuthorized";
}

function described(e: unknown): string {
  const err = e as { name?: string; message?: string };
  return `${err?.name ?? "Error"}: ${err?.message ?? String(e)}`;
}

// ---------------------------------------------------------------------------
// Dedicated IP
// ---------------------------------------------------------------------------

export interface DedicatedIpProvision {
  poolName: string;
  configSet: string;
}

/**
 * Stand up a dedicated IP pool and the configuration set that routes through it.
 *
 * `ScalingMode: MANAGED` is the reason this can be automated at all: SES
 * provisions and warms the addresses itself, so there is no support ticket and
 * no human deciding when the IP is ready.
 *
 * THE EVENT DESTINATION IS NOT OPTIONAL. Our entire delivery pipeline — bounce
 * handling, auto-suppression, opens, clicks, per-campaign analytics — is fed by
 * SNS notifications attached to a CONFIGURATION SET. A new config set starts
 * with none. Route a customer onto one without copying the destination across
 * and their events stop arriving: no error, no alarm, just a customer paying
 * extra for a silent downgrade. So a pool whose events we could not wire is
 * torn down rather than handed over.
 */
export async function provisionDedicatedIp(orgSlug: string): Promise<ProvisionResult<DedicatedIpProvision>> {
  const poolName = safeName("rm-pool-", orgSlug);
  const configSet = safeName("rm-cs-", orgSlug);
  const client = sesv2();

  // Read the template destination FIRST. If we cannot reproduce it, we must not
  // create anything at all.
  let template;
  try {
    const existing = await client.send(
      new GetConfigurationSetEventDestinationsCommand({
        ConfigurationSetName: env.SES_CONFIGURATION_SET ?? "rootmail-events",
      }),
    );
    template = existing.EventDestinations?.[0];
  } catch (e) {
    return { ok: false, reason: `Could not read the base event destination — ${described(e)}`, retryable: !isAccessDenied(e) };
  }
  if (!template?.SnsDestination?.TopicArn || !template.MatchingEventTypes?.length) {
    return {
      ok: false,
      reason:
        "The base configuration set has no SNS event destination to copy. Provisioning would silence this customer's delivery events.",
      retryable: false,
    };
  }

  try {
    await client.send(new CreateDedicatedIpPoolCommand({ PoolName: poolName, ScalingMode: "MANAGED" }));
  } catch (e) {
    if ((e as { name?: string })?.name !== "AlreadyExistsException") {
      return { ok: false, reason: `Pool creation failed — ${described(e)}`, retryable: !isAccessDenied(e) };
    }
  }

  try {
    await client.send(
      new CreateConfigurationSetCommand({
        ConfigurationSetName: configSet,
        DeliveryOptions: { SendingPoolName: poolName },
      }),
    );
  } catch (e) {
    if ((e as { name?: string })?.name !== "AlreadyExistsException") {
      return { ok: false, reason: `Configuration set failed — ${described(e)}`, retryable: !isAccessDenied(e) };
    }
  }

  try {
    await client.send(
      new CreateConfigurationSetEventDestinationCommand({
        ConfigurationSetName: configSet,
        EventDestinationName: template.Name ?? "sns-all",
        EventDestination: {
          Enabled: true,
          MatchingEventTypes: template.MatchingEventTypes,
          SnsDestination: { TopicArn: template.SnsDestination.TopicArn },
        },
      }),
    );
  } catch (e) {
    if ((e as { name?: string })?.name !== "AlreadyExistsException") {
      // The pool and config set exist but events would be lost. Refuse to hand
      // it over — the caller leaves the org on its previous state.
      return {
        ok: false,
        reason: `Event destination failed, so this pool would swallow delivery events — ${described(e)}`,
        retryable: !isAccessDenied(e),
      };
    }
  }

  return { ok: true, value: { poolName, configSet } };
}

// ---------------------------------------------------------------------------
// Reply domain
// ---------------------------------------------------------------------------

/**
 * Create the SES receipt rule that routes a customer's own reply subdomain into
 * our inbound pipeline.
 *
 * This is the step a staff member did by hand while the customer's branded
 * reply address sat "pending". It is pure mechanism — the DNS check already
 * proved they own the domain — so a human in the loop only ever added delay.
 *
 * Receipt rules live in the CLASSIC SES API; SESv2 has no equivalent, which is
 * why this file talks to both clients.
 */
export async function provisionReplyReceiptRule(
  domain: string,
  opts: { s3Bucket?: string; s3Prefix?: string; snsTopicArn?: string } = {},
): Promise<ProvisionResult<{ ruleName: string; ruleSet: string }>> {
  const client = ses();
  const ruleName = safeName("rm-inbound-", domain.replace(/\./g, "-"));

  let ruleSet: string | undefined;
  try {
    const active = await client.send(new DescribeActiveReceiptRuleSetCommand({}));
    ruleSet = active.Metadata?.Name;
  } catch (e) {
    return { ok: false, reason: `Could not read the active receipt rule set — ${described(e)}`, retryable: !isAccessDenied(e) };
  }
  if (!ruleSet) {
    return {
      ok: false,
      // Actionable rather than vague: this is a one-time account setup, not a
      // per-customer problem, and it needs a person.
      reason:
        "No active SES receipt rule set exists in this account. Create one and make it active before branded reply domains can be provisioned.",
      retryable: false,
    };
  }

  /*
   * Storing the message and being TOLD about it are two different things, and
   * an S3 action alone only does the first.
   *
   * I built exactly that rule by hand for our own reply domain: mail landed in
   * the bucket and nothing ever notified the API, so replies would have sat
   * there until the 30-day lifecycle deleted them — no error, no bounce, no
   * trace of what went missing. A customer's branded reply address would have
   * looked like a black hole.
   *
   * So the S3 action carries the topic (SES notifies AFTER the write, which is
   * the ordering we need — a notification we could not yet fetch would be
   * worse), and a configuration that cannot notify is refused outright. There
   * is no half-working version of this worth creating.
   */
  const actions: NonNullable<ConstructorParameters<typeof CreateReceiptRuleCommand>[0]["Rule"]>["Actions"] = [];

  if (opts.s3Bucket) {
    if (!opts.snsTopicArn) {
      return {
        ok: false,
        reason:
          "INBOUND_S3_BUCKET is set but INBOUND_SNS_TOPIC_ARN is not. An S3-only receipt rule stores replies where nothing reads them; refusing rather than creating a silent black hole.",
        retryable: false,
      };
    }
    actions.push({
      S3Action: {
        BucketName: opts.s3Bucket,
        ObjectKeyPrefix: opts.s3Prefix,
        // The notification that makes the stored message reachable.
        TopicArn: opts.snsTopicArn,
      },
    });
  } else if (opts.snsTopicArn) {
    // SNS-only: SES inlines the raw MIME, which is simpler but caps at ~150KB.
    // Supported because a rule can legitimately be either, but S3 is preferred
    // — the reply that exceeds the cap is the one carrying a screenshot.
    actions.push({ SNSAction: { TopicArn: opts.snsTopicArn, Encoding: "UTF-8" } });
  }

  if (actions.length === 0) {
    return {
      ok: false,
      reason: "No inbound delivery target configured (set INBOUND_S3_BUCKET + INBOUND_SNS_TOPIC_ARN).",
      retryable: false,
    };
  }

  try {
    await client.send(
      new CreateReceiptRuleCommand({
        RuleSetName: ruleSet,
        Rule: {
          Name: ruleName,
          Enabled: true,
          // Scoped to this customer's subdomain only — a rule without
          // Recipients would capture mail for every domain we receive.
          Recipients: [domain],
          TlsPolicy: "Optional",
          ScanEnabled: true,
          Actions: actions,
        },
      }),
    );
  } catch (e) {
    if ((e as { name?: string })?.name !== "AlreadyExistsException") {
      return { ok: false, reason: `Receipt rule creation failed — ${described(e)}`, retryable: !isAccessDenied(e) };
    }
  }

  return { ok: true, value: { ruleName, ruleSet } };
}

// ---------------------------------------------------------------------------
// Beta tester addresses
// ---------------------------------------------------------------------------

/**
 * Ask SES to verify a tester's own address.
 *
 * While the account is sandboxed we may only send to verified identities, so a
 * beta tester whose address SES has never heard of simply cannot receive their
 * invite — or anything else we send them. Verifying each tester individually is
 * the supported way through that, and it costs them one click in an email.
 *
 * Idempotent: an address already verified, or already pending, is left alone.
 */
export async function ensureTesterIdentity(email: string): Promise<ProvisionResult<{ status: string }>> {
  const client = sesv2();
  const addr = email.trim().toLowerCase();

  // Already known? Then the verification mail has been sent (or completed) and
  // asking again would send them a duplicate.
  try {
    const got = await client.send(new GetEmailIdentityCommand({ EmailIdentity: addr }));
    return { ok: true, value: { status: got.VerifiedForSendingStatus ? "verified" : "pending" } };
  } catch (e) {
    if ((e as { name?: string })?.name !== "NotFoundException") {
      return { ok: false, reason: `Could not read identity — ${described(e)}`, retryable: !isAccessDenied(e) };
    }
  }

  try {
    await client.send(new CreateEmailIdentityCommand({ EmailIdentity: addr }));
  } catch (e) {
    if ((e as { name?: string })?.name !== "AlreadyExistsException") {
      return { ok: false, reason: `Could not request verification — ${described(e)}`, retryable: !isAccessDenied(e) };
    }
  }
  return { ok: true, value: { status: "pending" } };
}

/** Has the tester clicked the link yet? Drives when their invite may be sent. */
export async function isTesterVerified(email: string): Promise<boolean> {
  try {
    const got = await sesv2().send(new GetEmailIdentityCommand({ EmailIdentity: email.trim().toLowerCase() }));
    return Boolean(got.VerifiedForSendingStatus);
  } catch {
    // Unknown or unreadable ⇒ treat as not verified. Sending to an address SES
    // will refuse is worse than making someone wait.
    return false;
  }
}
