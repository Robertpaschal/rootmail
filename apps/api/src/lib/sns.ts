import { createVerify } from "node:crypto";

// ---------------------------------------------------------------------------
// Amazon SNS message authentication. Our SES webhook is a PUBLIC endpoint, so
// every message must be cryptographically verified as genuinely from SNS before
// we act on it. We validate the signing-cert URL host (SSRF guard), fetch the
// cert (cached), rebuild the canonical string per the SNS spec, and verify.
// ---------------------------------------------------------------------------

export interface SnsMessage {
  Type: string;
  MessageId: string;
  Token?: string;
  TopicArn: string;
  Subject?: string;
  Message: string;
  SubscribeURL?: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  [k: string]: string | undefined;
}

const certCache = new Map<string, string>();

/** Cert URL must be https on an SNS host — blocks fetching an attacker's cert. */
export function isValidCertUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && /^sns\.[a-z0-9-]+\.amazonaws\.com$/.test(u.hostname);
  } catch {
    return false;
  }
}

function isAwsHost(host: string): boolean {
  return /(^|\.)amazonaws\.com$/.test(host);
}

async function fetchCert(url: string): Promise<string> {
  const cached = certCache.get(url);
  if (cached) return cached;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`SNS cert fetch failed: ${res.status}`);
  const pem = await res.text();
  certCache.set(url, pem);
  return pem;
}

// Fields (in order) that make up the signed canonical string, per message type.
const SIGN_FIELDS: Record<string, string[]> = {
  Notification: ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"],
  SubscriptionConfirmation: ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"],
  UnsubscribeConfirmation: ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"],
};

function canonicalString(msg: SnsMessage): string {
  const fields = SIGN_FIELDS[msg.Type] ?? [];
  let out = "";
  for (const f of fields) {
    const v = msg[f];
    if (v === undefined) continue; // e.g. Subject is omitted when not present
    out += `${f}\n${v}\n`;
  }
  return out;
}

export async function verifySnsSignature(msg: SnsMessage): Promise<boolean> {
  if (!isValidCertUrl(msg.SigningCertURL)) return false;
  if (!msg.Signature || !SIGN_FIELDS[msg.Type]) return false;
  const algorithm = msg.SignatureVersion === "2" ? "RSA-SHA256" : "RSA-SHA1";
  const pem = await fetchCert(msg.SigningCertURL);
  const verifier = createVerify(algorithm);
  verifier.update(canonicalString(msg), "utf8");
  return verifier.verify(pem, msg.Signature, "base64");
}

/** Visit the SubscribeURL to confirm an SNS subscription (host-checked). */
export async function confirmSubscription(msg: SnsMessage): Promise<void> {
  if (!msg.SubscribeURL) return;
  const u = new URL(msg.SubscribeURL);
  if (u.protocol !== "https:" || !isAwsHost(u.hostname)) {
    throw new Error("refusing to confirm: SubscribeURL is not an AWS host");
  }
  const res = await fetch(msg.SubscribeURL);
  if (!res.ok) throw new Error(`SNS subscription confirmation failed: ${res.status}`);
}
