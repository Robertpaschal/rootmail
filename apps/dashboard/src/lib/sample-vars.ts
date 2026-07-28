/**
 * Sample values for a template's {{variables}}.
 *
 * The old studio asked the user which variables it had detected, and left the
 * preview full of raw `{{name}}` braces. That's backwards: we already know the
 * company, the signed-in user, and — once there's an audience — a real contact.
 * So we fill the preview in with the truth we hold, and only invent a value for
 * the handful of things that genuinely vary per send (an order number, a reset
 * link). What you see is what that person receives.
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
  /** The org / product name — fills {{product}}, {{company}}, {{brand}}. */
  product: string | null;
  person: PreviewPerson;
}

/**
 * Values a template can't know from our data — a receipt number, a magic link.
 * Chosen to look plausible so the preview reads like a finished email rather
 * than a form with holes in it.
 */
const INVENTED: Record<string, string> = {
  action_url: "https://example.com/get-started",
  url: "https://example.com",
  link: "https://example.com",
  reset_url: "https://example.com/reset?token=demo",
  verify_url: "https://example.com/verify?token=demo",
  login_url: "https://example.com/sign-in",
  unsubscribe_url: "https://example.com/unsubscribe",
  order_number: "A-10428",
  invoice_number: "INV-2043",
  amount: "$49.00",
  total: "$49.00",
  price: "$49.00",
  discount: "20%",
  promo_code: "SPRING20",
  expiry: "in 30 minutes",
  date: new Date().toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }),
  event_title: "Your account was updated",
  headline: "What's new this month",
  feature: "Scheduled sends",
  city: "Lagos",
  country: "Nigeria",
};

/** Split a display name the same way the send path does. */
function nameParts(name: string | null): Record<string, string> {
  const trimmed = name?.trim();
  if (!trimmed) return {};
  const [first, ...rest] = trimmed.split(/\s+/);
  return rest.length > 0 ? { name: trimmed, first_name: first, last_name: rest.join(" ") } : { name: trimmed, first_name: first };
}

/**
 * Build the variable map used to render a preview. Mirrors the real send path
 * (`contactVariables` in @rootmail/core) so the preview can't drift from it.
 */
export function sampleVariables(ctx: SampleContext): Record<string, unknown> {
  const { product, person } = ctx;
  const brand = product ?? "Your Company";
  return {
    ...INVENTED,
    product: brand,
    company: brand,
    brand,
    company_name: brand,
    email: person.email,
    ...nameParts(person.name),
    // A contact's own fields win over anything we guessed.
    ...(person.extra ?? {}),
  };
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

/** Which `{{variables}}` in this source have no value yet. */
export function missingVariables(source: string, vars: Record<string, unknown>): string[] {
  const out = new Set<string>();
  const re = /\{\{\s*([\w.]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const v = vars[m[1]];
    if (v == null || v === "") out.add(m[1]);
  }
  return [...out];
}

/** A stand-in recipient for when the audience is still empty. */
export function placeholderPerson(fallbackEmail?: string | null): PreviewPerson {
  return { email: fallbackEmail || "ada@example.com", name: "Ada Lovelace", real: false };
}
