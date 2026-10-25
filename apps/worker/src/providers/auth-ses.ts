import { GetConfigurationSetEventDestinationsCommand, SendEmailCommand, SESv2Client, type SendEmailCommandInput } from "@aws-sdk/client-sesv2";
import { AUTH_SUBJECT, assertAuthLifetime, env, type AuthContent } from "@rootmail/core";
import type { Message } from "@rootmail/db";
import { addSesNoTrack } from "../platform-mail";

type EventDestination = { Enabled?: boolean; MatchingEventTypes?: string[] };
export interface AuthSesTransport {
  settings: (configurationSet: string, signal: AbortSignal) => Promise<EventDestination[] | undefined>;
  send: (input: SendEmailCommandInput, signal: AbortSignal) => Promise<string | undefined>;
}
export function authTrackingSafe(destinations: EventDestination[] | undefined): boolean {
  const active = destinations?.filter(d => d.Enabled) ?? [];
  const events = active.flatMap(d => d.MatchingEventTypes ?? []);
  // An omitted Enabled is not evidence that engagement collection is disabled.
  const unsafe = destinations?.some(d => d.Enabled !== false && d.MatchingEventTypes?.some(e => e === "OPEN" || e === "CLICK"));
  return !unsafe &&
    ["DELIVERY", "BOUNCE", "COMPLAINT"].every(e => events.includes(e));
}

// Separate from the ordinary provider: one SDK attempt, no mock file sink,
// no BYO fallback, no shared/dedicated tracking set and no custom secret headers.
export async function sendAuthViaSes(message: Message, content: AuthContent): Promise<{ provider: string; providerMessageId: string }> {
  if (!env.AUTH_MESSAGES_ENABLED || env.MAIL_PROVIDER !== "ses" || !env.AUTH_SES_CONFIGURATION_SET || !message.authExpiresAt) {
    throw new Error("auth_provider_unavailable");
  }
  const client = new SESv2Client({ region: env.AWS_REGION ?? "us-east-1", maxAttempts: 1 });
  try {
    return await sendAuthWithTransport(message, content, env.AUTH_SES_CONFIGURATION_SET, {
      settings: async (configurationSet, abortSignal) => (await client.send(new GetConfigurationSetEventDestinationsCommand({ ConfigurationSetName: configurationSet }), { abortSignal })).EventDestinations,
      send: async (input, abortSignal) => (await client.send(new SendEmailCommand(input), { abortSignal })).MessageId,
    });
  } finally { client.destroy(); }
}

/** Injected transport is for local acceptance; the production wrapper above uses SES once. */
export async function sendAuthWithTransport(message: Message, content: AuthContent, configurationSet: string, transport: AuthSesTransport) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    if (!message.authExpiresAt || !configurationSet) throw new Error("auth_provider_unavailable");
    assertAuthLifetime(message.authExpiresAt);
    const settings = await transport.settings(configurationSet, controller.signal);
    if (!authTrackingSafe(settings)) throw new Error("auth_tracking_unsafe");
    // Configuration verification can take time. Recheck immediately before provider I/O.
    assertAuthLifetime(message.authExpiresAt);
    if (controller.signal.aborted) throw new Error("auth_provider_timeout");
    const messageId = await transport.send({
      FromEmailAddress: message.fromEmail,
      Destination: { ToAddresses: [message.toEmail] },
      ReplyToAddresses: message.replyTo ? [message.replyTo] : undefined,
      ConfigurationSetName: configurationSet,
      Content: { Simple: {
        Subject: { Data: AUTH_SUBJECT, Charset: "UTF-8" },
        Body: { Html: { Data: addSesNoTrack(content.html), Charset: "UTF-8" }, Text: { Data: content.text, Charset: "UTF-8" } },
      } },
    }, controller.signal);
    if (!messageId) throw new Error("auth_provider_unknown");
    return { provider: "ses", providerMessageId: messageId };
  } catch {
    // Neither BullMQ nor database diagnostics may receive an SDK error/request.
    throw new Error("auth_provider_outcome_unknown");
  } finally {
    clearTimeout(timer);
  }
}
