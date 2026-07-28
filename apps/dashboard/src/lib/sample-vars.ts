/**
 * Values for a template's {{variables}}.
 *
 * The old studio asked which variables it had detected and left the preview full
 * of raw `{{name}}` braces. That's backwards — we already know the company, the
 * signed-in user, and (once there's an audience) the actual recipient.
 *
 * But there's a trap on the other side, and this module exists to avoid it: a
 * preview that invents a plausible value for something the SEND path won't
 * substitute is a lie. It shows a finished email and ships `{{order_number}}`.
 * So the two ideas are kept strictly apart:
 *
 *  • `certainVariables` — only what genuinely gets substituted at send time
 *    (the contact's own fields; the unsubscribe URL the API injects). Anything
 *    missing from this map is a real gap the sender must close.
 *  • `suggestFor` — a plausible value we can OFFER for a gap. It never fills a
 *    preview silently; it prefills the field the sender confirms, and that
 *    confirmed value then travels with the send. What you see is what goes.
 */

/** The identity a preview is rendered "as" — a real contact, or a stand-in. */
export interface PreviewPerson {
  email: string;
  name: string | null;
  /** Extra per-contact fields (custom metadata) that templates can reference. */
  extra?: Record<string, unknown>;
  /** True when this is a real contact from the audience, not a placeholder. */
  real: boolean;
}

export interface SampleContext {
  /** The org / product name — the suggestion for {{product}}, {{company}}. */
  product: string | null;
  person: PreviewPerson;
}

/** Split a display name the same way the send path does. */
function nameParts(name: string | null): Record<string, string> {
  const trimmed = name?.trim();
  if (!trimmed) return {};
  const [first, ...rest] = trimmed.split(/\s+/);
  return rest.length > 0
    ? { name: trimmed, first_name: first, last_name: rest.join(" ") }
    : { name: trimmed, first_name: first };
}

/**
 * What the send path REALLY substitutes for this person — mirrors
 * `contactVariables` in @rootmail/core, plus the unsubscribe URL the API
 * injects on every send. Nothing speculative.
 */
export function certainVariables(person: PreviewPerson): Record<string, unknown> {
  return {
    email: person.email,
    ...nameParts(person.name),
    ...(person.extra ?? {}),
    // Injected server-side on every send — never something to ask about.
    unsubscribe_url: "https://rootmail.example/unsubscribe",
  };
}

/**
 * A plausible value to OFFER for a gap — used to prefill the field the sender
 * confirms, and to make the template studio's design preview read like a
 * finished email (there's no recipient there, so nothing can be promised).
 */
export function suggestFor(key: string, ctx: { product?: string | null } = {}): string {
  const brand = ctx.product ?? "Your Company";
  const map: Record<string, string> = {
    product: brand,
    company: brand,
    brand,
    company_name: brand,
    action_url: "https://example.com/get-started",
    url: "https://example.com",
    link: "https://example.com",
    reset_url: "https://example.com/reset?token=demo",
    verify_url: "https://example.com/verify?token=demo",
    login_url: "https://example.com/sign-in",
    order_number: "A-10428",
    invoice_number: "INV-2043",
    amount: "$49.00",
    total: "$49.00",
    price: "$49.00",
    discount: "20%",
    promo_code: "SPRING20",
    expiry: "in 30 minutes",
    event_title: "Your account was updated",
    headline: "What's new this month",
    feature: "Scheduled sends",
  };
  if (map[key]) return map[key];
  if (/date|day|when/i.test(key)) {
    return new Date().toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  }
  return "";
}

/**
 * Certain values PLUS suggestions for everything else — for the template
 * studio, where the job is "does this design look right?" and there is no
 * recipient to be honest or dishonest about.
 */
export function suggestedVariables(ctx: SampleContext, keys: string[]): Record<string, unknown> {
  const out = certainVariables(ctx.person);
  for (const k of keys) {
    if (out[k] == null || out[k] === "") {
      const s = suggestFor(k, { product: ctx.product });
      if (s) out[k] = s;
    }
  }
  return out;
}

/**
 * Substitute `{{variables}}`, leaving anything we have no value for visibly
 * marked rather than silently blank — an unfilled variable is a bug the user
 * should be able to SEE before they send.
 */
export function fillTemplate(source: string, vars: Record<string, unknown>): string {
  return source.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (whole, key: string) => {
    const v = vars[key];
    if (v == null || v === "") return whole;
    return String(v);
  });
}

/** Every `{{variable}}` used in this source, in order of first appearance. */
export function usedVariables(...sources: string[]): string[] {
  const out = new Set<string>();
  const re = /\{\{\s*([\w.]+)\s*\}\}/g;
  for (const s of sources) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(s)) !== null) out.add(m[1]);
  }
  return [...out];
}

/** Which `{{variables}}` in this source have no value yet. */
export function missingVariables(source: string, vars: Record<string, unknown>): string[] {
  return usedVariables(source).filter((k) => vars[k] == null || vars[k] === "");
}

/** A stand-in recipient for when the audience is still empty. */
export function placeholderPerson(fallbackEmail?: string | null): PreviewPerson {
  return { email: fallbackEmail || "ada@example.com", name: "Ada Lovelace", real: false };
}
