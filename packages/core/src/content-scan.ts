/**
 * Refusing mail we should not be putting on the wire.
 *
 * There was no inspection of any kind: subject, body and attachments went
 * straight through. A platform that sends on behalf of other people is judged on
 * what its customers send, so "we did not look" is not a position — but neither
 * is a heuristic that guesses. Everything here is a RULE with a definite answer,
 * not a score:
 *
 *  - an attachment whose extension executes on the recipient's machine
 *  - a link to a host an operator has explicitly blocked
 *
 * Deliberately NOT included: the classic "link text says one domain, href points
 * at another" phishing tell. It is mechanically detectable and it would fire on
 * our own click tracking, on every ESP's click tracking, and on any newsletter
 * that writes "example.com" over a tracked link — a control that refuses honest
 * mail teaches people to route around it. Catching that properly needs
 * reputation data we do not have; pretending otherwise would be worse than the
 * gap.
 */

/**
 * Extensions that execute, or that carry something that does, on a normal
 * desktop. Mail providers reject most of these outright — sending them makes us
 * look like a malware relay whether or not the file is malicious.
 */
export const BLOCKED_ATTACHMENT_EXTENSIONS = [
  "ade", "adp", "app", "asp", "bat", "cer", "chm", "cmd", "com", "cpl", "csh",
  "der", "exe", "fxp", "gadget", "hlp", "hta", "inf", "ins", "isp", "its", "jar",
  "job", "js", "jse", "ksh", "lib", "lnk", "mad", "maf", "mag", "mam", "maq",
  "mar", "mas", "mat", "mau", "mav", "maw", "mda", "mdb", "mde", "mdt", "mdw",
  "mdz", "msc", "msh", "msh1", "msh2", "mshxml", "msi", "msp", "mst", "ops",
  "pcd", "pif", "plg", "prf", "prg", "ps1", "ps1xml", "ps2", "ps2xml", "psc1",
  "psc2", "reg", "scf", "scr", "sct", "shb", "shs", "sys", "vb", "vbe", "vbs",
  "vxd", "ws", "wsc", "wsf", "wsh", "xnk",
] as const;

export interface ContentFinding {
  kind: "attachment_type" | "blocked_link";
  /** Said to the SENDER, so it names what to change. */
  detail: string;
}

export interface ContentScanInput {
  html?: string | null;
  text?: string | null;
  attachments?: readonly { filename: string }[];
  /** Hosts an operator has blocked, lowercased. Subdomains match. */
  blockedHosts?: readonly string[];
}

/** The extension of a filename, lowercased, without the dot. */
function extensionOf(filename: string): string {
  const clean = filename.trim().replace(/[\s.]+$/, "");
  const dot = clean.lastIndexOf(".");
  return dot === -1 ? "" : clean.slice(dot + 1).toLowerCase();
}

/** Every http(s) host referenced by an href in the body. */
export function linkHosts(html: string | null | undefined): string[] {
  if (!html) return [];
  const out = new Set<string>();
  for (const m of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    try {
      const u = new URL(m[1]);
      if (u.protocol === "http:" || u.protocol === "https:") out.add(u.hostname.toLowerCase());
    } catch {
      // Not a URL we can parse is not a link we can judge.
    }
  }
  return [...out];
}

/** A host matches a blocked entry exactly, or as a subdomain of it. */
function hostBlocked(host: string, blocked: readonly string[]): string | null {
  for (const b of blocked) {
    const t = b.trim().toLowerCase().replace(/^\.+/, "");
    if (!t) continue;
    if (host === t || host.endsWith(`.${t}`)) return t;
  }
  return null;
}

/** Everything wrong with this message. Empty means send it. */
export function scanContent(input: ContentScanInput): ContentFinding[] {
  const findings: ContentFinding[] = [];

  for (const a of input.attachments ?? []) {
    const ext = extensionOf(a.filename);
    if (!ext) continue;
    if ((BLOCKED_ATTACHMENT_EXTENSIONS as readonly string[]).includes(ext)) {
      findings.push({
        kind: "attachment_type",
        detail: `"${a.filename}" is a .${ext} file. Executable attachments are refused — most mailbox providers reject them anyway, and sending them puts every customer's deliverability at risk. Send a link to the file instead.`,
      });
    }
  }

  const blocked = input.blockedHosts ?? [];
  if (blocked.length) {
    for (const host of linkHosts(input.html)) {
      const hit = hostBlocked(host, blocked);
      if (hit) {
        findings.push({
          kind: "blocked_link",
          detail: `This message links to ${host}, which is blocked on this platform.`,
        });
      }
    }
  }

  return findings;
}
