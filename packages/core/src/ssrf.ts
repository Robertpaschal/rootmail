import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { env } from "./env";

/** Is an IP literal in a private / loopback / link-local / reserved range? */
export function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fe80")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique-local
  if (lower.startsWith("::ffff:")) return isPrivateIp(lower.slice(7)); // v4-mapped
  return false;
}

/**
 * Assert a URL is safe to make an outbound request to: https (http only for a
 * dev-allowed loopback), a public host, and not resolving to a private address.
 * Resolves the host and validates every returned IP, defeating hostnames that
 * point at internal infrastructure. Throws on any violation.
 */
export async function assertPublicUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL");
  }

  const isHttps = url.protocol === "https:";
  const isHttp = url.protocol === "http:";
  if (!isHttps && !(isHttp && env.WEBHOOK_ALLOW_LOCAL)) {
    throw new Error("Webhook URL must use https");
  }

  const host = url.hostname.toLowerCase();

  // Direct IP literal — validate it straight away.
  if (isIP(host)) {
    if (isPrivateIp(host) && !env.WEBHOOK_ALLOW_LOCAL) {
      throw new Error("Webhook URL resolves to a private address");
    }
    return;
  }

  // Obvious internal names.
  if (
    !env.WEBHOOK_ALLOW_LOCAL &&
    (host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host.endsWith(".internal"))
  ) {
    throw new Error("Webhook URL host is not allowed");
  }

  const records = await lookup(host, { all: true });
  if (records.length === 0) throw new Error("Webhook URL host does not resolve");
  for (const r of records) {
    if (isPrivateIp(r.address) && !env.WEBHOOK_ALLOW_LOCAL) {
      throw new Error("Webhook URL resolves to a private address");
    }
  }
}
