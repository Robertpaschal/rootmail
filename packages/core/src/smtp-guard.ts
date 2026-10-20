import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

/**
 * SSRF guard for a tenant-supplied SMTP server (bring-your-own-provider).
 *
 * The host is chosen by a customer and connected to from OUR network, so it must
 * never reach anything internal: the VPC, the instance metadata service, Valkey,
 * Postgres, or a neighbour on a carrier NAT. The rule:
 *
 *  1. Only ports 465 (implicit TLS), 587 and 2525 (mandatory STARTTLS).
 *  2. Resolve the host (with a timeout). EVERY returned address must be public —
 *     one private answer rejects the host, so a mixed record set can't be used to
 *     win a race.
 *  3. The caller connects to the vetted IP itself (never the name), with
 *     SNI/servername set to the hostname so the certificate is still checked
 *     against the name the tenant gave us.
 *
 * Run at connect (credential check) AND before every send: a name that was
 * public when it was saved can be re-pointed at 169.254.169.254 later (DNS
 * rebinding), so a stored vetting is never trusted.
 */

export const SMTP_ALLOWED_PORTS = [465, 587, 2525] as const;
export type SmtpPort = (typeof SMTP_ALLOWED_PORTS)[number];

/** Every network step gets a bound. Milliseconds. */
export const SMTP_TIMEOUTS = {
  dns: 5_000,
  connection: 10_000,
  greeting: 10_000,
  socket: 30_000,
} as const;

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, incl. 169.254.169.254 metadata
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments (incl. 192.0.0.192 Oracle metadata)
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.88.99.0", 24], // 6to4 relay anycast
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
blocked.addAddress("168.63.129.16", "ipv4"); // Azure wire server / metadata
for (const [net, prefix] of [
  ["::", 128], // unspecified
  ["::1", 128], // loopback
  ["100::", 64], // discard-only
  ["2001:db8::", 32], // documentation
  ["fc00::", 7], // unique-local (incl. AWS fd00:ec2::254 metadata)
  ["fe80::", 10], // link-local
  ["fec0::", 10], // deprecated site-local
  ["ff00::", 8], // multicast
] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

/** Expand an IPv6 literal to its 8 hextets (numbers). Returns null if malformed. */
function hextets(ip: string): number[] | null {
  let s = ip.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0]!;
  // Trailing dotted quad (::ffff:1.2.3.4) → two hextets.
  const dotted = s.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const p = dotted[2]!.split(".").map(Number);
    s = `${dotted[1]}${((p[0]! << 8) | p[1]!).toString(16)}:${((p[2]! << 8) | p[3]!).toString(16)}`;
  }
  const [head, tail] = s.split("::") as [string, string | undefined];
  const h = head ? head.split(":") : [];
  const t = tail !== undefined && tail !== "" ? tail.split(":") : [];
  const fill = s.includes("::") ? 8 - h.length - t.length : 0;
  const parts = [...h, ...Array(fill).fill("0"), ...t];
  if (parts.length !== 8) return null;
  const nums = parts.map((x) => parseInt(x, 16));
  return nums.some((n) => Number.isNaN(n) || n < 0 || n > 0xffff) ? null : nums;
}

const v4From = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

/** IPv4 embedded in an IPv6 address that would route to it (mapped, compat, NAT64, 6to4). */
function embeddedV4(ip: string): string | null {
  const h = hextets(ip);
  if (!h) return null;
  const zeros = (from: number, to: number) => h.slice(from, to).every((x) => x === 0);
  if (zeros(0, 5) && h[5] === 0xffff) return v4From(h[6]!, h[7]!); // ::ffff:a.b.c.d
  if (zeros(0, 6) && (h[6] !== 0 || h[7]! > 1)) return v4From(h[6]!, h[7]!); // ::a.b.c.d (compat)
  if (h[0] === 0x64 && h[1] === 0xff9b && zeros(2, 6)) return v4From(h[6]!, h[7]!); // 64:ff9b::/96 NAT64
  if (h[0] === 0x2002) return v4From(h[1]!, h[2]!); // 2002::/16 6to4
  return null;
}

/** True when an SMTP connection to this IP literal must be refused. Non-IPs are refused too. */
export function isBlockedSmtpAddress(ip: string): boolean {
  const bare = ip.replace(/^\[|\]$/g, "");
  const family = isIP(bare);
  if (family === 4) return blocked.check(bare, "ipv4");
  if (family === 6) {
    const v4 = embeddedV4(bare);
    if (v4 !== null) return blocked.check(v4, "ipv4");
    if (hextets(bare) === null) return true;
    return blocked.check(bare.split("%")[0]!, "ipv6");
  }
  return true;
}

export class SmtpGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SmtpGuardError";
  }
}

export interface SmtpTarget {
  /** The vetted address to connect to. Never re-resolved. */
  ip: string;
  port: SmtpPort;
  /** SNI + certificate name. */
  servername: string;
  /** true = implicit TLS (465); false = plain connect then mandatory STARTTLS. */
  secure: boolean;
}

export type HostLookup = (host: string) => Promise<{ address: string; family: number }[]>;

/**
 * Seams for tests ONLY (a local test server lives on loopback with a test CA).
 * Production code never passes these; every field defaults to the real thing.
 */
export interface SmtpTestHooks {
  resolve?: HostLookup;
  isBlocked?: (ip: string) => boolean;
  testCa?: string;
}

const defaultLookup: HostLookup = (host) => lookup(host, { all: true, verbatim: true });

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    p,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new SmtpGuardError(`${what} timed out after ${ms / 1000}s`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** A hostname the tenant may give us: a DNS name, not an IP literal and not an internal-only name. */
export function normalizeSmtpHost(host: string): string {
  const h = host.trim().toLowerCase().replace(/\.$/, "");
  if (!h || h.length > 253) throw new SmtpGuardError("enter your SMTP server's hostname");
  if (isIP(h.replace(/^\[|\]$/g, ""))) {
    throw new SmtpGuardError("use your SMTP server's hostname, not an IP address — TLS needs a name to check the certificate against");
  }
  if (!/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(h)) {
    throw new SmtpGuardError(`"${host}" isn't a valid hostname`);
  }
  if (h === "localhost" || /\.(localhost|local|internal|localdomain|home\.arpa|arpa)$/.test(h)) {
    throw new SmtpGuardError(`"${host}" is an internal name, not a public SMTP server`);
  }
  return h;
}

export function assertSmtpPort(port: number): SmtpPort {
  if (!(SMTP_ALLOWED_PORTS as readonly number[]).includes(port)) {
    throw new SmtpGuardError(`port ${port} isn't allowed — use 587 or 465 (2525 also works)`);
  }
  return port as SmtpPort;
}

/**
 * Resolve and vet. Throws SmtpGuardError (message safe to show the tenant) on
 * any violation. `hooks` are for tests only.
 */
export async function resolveSmtpTarget(
  host: string,
  port: number,
  hooks: Pick<SmtpTestHooks, "resolve" | "isBlocked"> = {},
): Promise<SmtpTarget> {
  const resolve = hooks.resolve ?? defaultLookup;
  const isBlocked = hooks.isBlocked ?? isBlockedSmtpAddress;
  const servername = normalizeSmtpHost(host);
  const p = assertSmtpPort(port);
  let records: { address: string }[];
  try {
    records = await withTimeout(resolve(servername), SMTP_TIMEOUTS.dns, `looking up ${servername}`);
  } catch (e) {
    if (e instanceof SmtpGuardError) throw e;
    throw new SmtpGuardError(`${servername} doesn't resolve`);
  }
  if (records.length === 0) throw new SmtpGuardError(`${servername} doesn't resolve`);
  if (records.some((r) => isBlocked(r.address))) {
    throw new SmtpGuardError(`${servername} resolves to a private or reserved address, which Rootmail won't connect to`);
  }
  return { ip: records[0]!.address, port: p, servername, secure: p === 465 };
}

/** What nodemailer needs to talk to a vetted target. Pure: no secrets beyond what's passed. */
export function smtpTransportOptions(
  target: SmtpTarget,
  auth: { user: string; pass: string },
  /** Tests only: a CA to trust in addition to the system store. Production passes nothing. */
  testCa?: string,
) {
  return {
    host: target.ip, // an IP, so nodemailer does no lookup of its own
    port: target.port,
    secure: target.secure,
    requireTLS: !target.secure, // STARTTLS is mandatory; a server that doesn't offer it fails
    ignoreTLS: false,
    servername: target.servername,
    tls: {
      servername: target.servername,
      rejectUnauthorized: true,
      minVersion: "TLSv1.2" as const,
      ...(testCa ? { ca: testCa } : {}),
    },
    auth,
    connectionTimeout: SMTP_TIMEOUTS.connection,
    greetingTimeout: SMTP_TIMEOUTS.greeting,
    socketTimeout: SMTP_TIMEOUTS.socket,
    dnsTimeout: SMTP_TIMEOUTS.dns,
    pool: false,
    logger: false,
    debug: false,
  };
}

/** A short, credential-free reason from a nodemailer / guard error. */
export function smtpErrorReason(e: unknown): string {
  const err = e as { name?: string; code?: string; responseCode?: number; response?: string; message?: string };
  if (err?.name === "SmtpGuardError") return err.message ?? "the SMTP server was refused";
  if (err?.code === "EAUTH") return `the server rejected the username or password${err.responseCode ? ` (${err.responseCode})` : ""}`;
  if (err?.code === "ETLS" || /STARTTLS/i.test(err?.message ?? "")) return "the server didn't offer a secure (TLS) connection";
  if (err?.code === "ETIMEDOUT" || err?.code === "ECONNECTION" || err?.code === "ESOCKET") {
    return `couldn't connect to the server (${err.code === "ETIMEDOUT" ? "timed out" : (err.message ?? err.code).slice(0, 120)})`;
  }
  if (err?.response) return `the server said: ${err.response.slice(0, 200)}`;
  return (err?.message ?? "the SMTP server refused the message").slice(0, 200);
}

/** SMTP has no event API: bounces (DSNs) go back to the tenant's own MAIL FROM mailbox. */
export const SMTP_FEEDBACK_LIMITATION =
  "SMTP has no event feed, so bounces go back to your own mailbox, not to Rootmail. We can't add them to your suppression list automatically; unsubscribes and anything we do see are still suppressed.";

/** A tenant SMTP connection gets no feedback loop, so it keeps a conservative daily ceiling. */
export const BYO_SMTP_DAILY_CAP = 500;
