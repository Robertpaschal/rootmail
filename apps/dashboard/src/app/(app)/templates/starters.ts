// The template "design studio" starting points. Each starter is a real editable
// document (the same DocNode the writing editor speaks), so picking one drops a
// designed, on-message email onto the canvas that you then edit endlessly — not a
// blank box. Layouts are grouped by wing to match how the product is organized.
//
// IMPORTANT: marketing/sales sends get a CAN-SPAM footer (postal address +
// unsubscribe) appended automatically at send time (packages/core/compliance.ts).
// So NO starter footer here sets an address or an in-body unsubscribe — that would
// double it. Footers use { showUnsubscribe: false } and carry only brand/social.

import type { DocNode } from "@/lib/email-doc";

export type StarterWing = "transactional" | "marketing";

export interface Starter {
  id: string;
  /** Pre-fills the template Name field. */
  name: string;
  /** Card title in the gallery. */
  title: string;
  wing: StarterWing;
  /** One-line description of when to reach for it. */
  blurb: string;
  subject: string;
  doc: DocNode;
}

// --- tiny DocNode builders (keep the catalog below readable) ----------------
const h = (level: 1 | 2 | 3, text: string): DocNode => ({
  type: "heading",
  attrs: { level },
  content: [{ type: "text", text }],
});
const p = (text?: string): DocNode => ({
  type: "paragraph",
  content: text ? [{ type: "text", text }] : [],
});
// bg is omitted → docToHtml falls back to the brand color.
const btn = (label: string, href: string): DocNode => ({ type: "button", attrs: { label, href } });
const hr = (): DocNode => ({ type: "horizontalRule" });
const header = (brandName: string): DocNode => ({ type: "header", attrs: { brandName, align: "center" } });
const embed = (title: string, url: string): DocNode => ({ type: "embed", attrs: { title, url } });
const footer = (attrs: Record<string, unknown>): DocNode => ({
  type: "footer",
  attrs: { showUnsubscribe: false, ...attrs },
});
const doc = (...content: DocNode[]): DocNode => ({ type: "doc", content });

export const STARTERS: Starter[] = [
  // --- Transactional ---------------------------------------------------------
  {
    id: "welcome",
    name: "Welcome",
    title: "Welcome",
    wing: "transactional",
    blurb: "Greet a new signup and point them at their first step.",
    subject: "Welcome to {{product}}, {{name}} 🎉",
    doc: doc(
      header("Your Company"),
      h(1, "Welcome, {{name}} 👋"),
      p("Thanks for joining {{product}} — we're so glad you're here. Let's get you set up in a couple of minutes."),
      btn("Get started", "{{action_url}}"),
      p("Questions? Just reply to this email — a real person will read it."),
      footer({ text: "You're receiving this because you signed up for {{product}}." }),
    ),
  },
  {
    id: "password-reset",
    name: "Password reset",
    title: "Password reset",
    wing: "transactional",
    blurb: "A secure, single-purpose email with one clear action.",
    subject: "Reset your {{product}} password",
    doc: doc(
      h(1, "Reset your password"),
      p("We got a request to reset the password for your account. Choose a new one below — this link expires in 30 minutes."),
      btn("Reset password", "{{reset_url}}"),
      p("Didn't request this? You can safely ignore this email and your password won't change."),
      footer({ text: "For your security, this link can only be used once." }),
    ),
  },
  {
    id: "receipt",
    name: "Order receipt",
    title: "Receipt",
    wing: "transactional",
    blurb: "Confirm an order or payment with the details laid out.",
    subject: "Your receipt from Your Company · {{order_number}}",
    doc: doc(
      header("Your Company"),
      h(2, "Thanks for your order, {{name}}"),
      p("Order {{order_number}} · {{order_date}}"),
      hr(),
      p("{{item_name}}"),
      p("Total paid: {{order_total}}"),
      btn("View receipt", "{{receipt_url}}"),
      footer({ text: "A copy of this receipt is saved to your account." }),
    ),
  },
  {
    id: "notification",
    name: "Notification",
    title: "Notification",
    wing: "transactional",
    blurb: "A short heads-up about something that just happened.",
    subject: "{{event_title}}",
    doc: doc(
      h(2, "{{event_title}}"),
      p("{{event_summary}}"),
      btn("View details", "{{action_url}}"),
      footer({ text: "You're getting this because of your notification settings." }),
    ),
  },

  // --- Marketing -------------------------------------------------------------
  {
    id: "newsletter",
    name: "Newsletter",
    title: "Newsletter",
    wing: "marketing",
    blurb: "A skimmable monthly update with room for a few stories.",
    subject: "{{headline}}",
    doc: doc(
      header("Your Company"),
      h(1, "{{headline}}"),
      p("Hi {{name}}, here's what's new this month."),
      h(2, "A section title"),
      p("Share an update, a story, or a tip your readers will love. Keep it short and skimmable — one idea per section."),
      btn("Read more", "{{article_url}}"),
      hr(),
      h(2, "One more thing"),
      p("Close with a lighter note, a community shout-out, or what's coming next."),
      footer({
        text: "Thanks for reading 💌",
        social: [
          { platform: "x", url: "{{x_url}}" },
          { platform: "instagram", url: "{{instagram_url}}" },
        ],
      }),
    ),
  },
  {
    id: "announcement",
    name: "Announcement",
    title: "Announcement",
    wing: "marketing",
    blurb: "Launch a feature or news with a lead visual and one CTA.",
    subject: "Introducing {{feature}} ✨",
    doc: doc(
      header("Your Company"),
      h(1, "Introducing {{feature}}"),
      p("We've been working on something we think you'll love. Here's the short version."),
      embed("Watch the 60-second tour", "{{video_url}}"),
      p("It's live today for everyone on {{product}} — no setup required."),
      btn("Take a look", "{{learn_url}}"),
      footer({ text: "You're on the list because you use {{product}}." }),
    ),
  },
  {
    id: "promo",
    name: "Promotion",
    title: "Promotion",
    wing: "marketing",
    blurb: "Drive a limited-time offer with urgency and a bold CTA.",
    subject: "{{discount}} off everything — code {{promo_code}} 🎉",
    doc: doc(
      header("Your Company"),
      h(1, "{{discount}} off — this week only"),
      p("Our biggest sale of the season is here. Use code {{promo_code}} at checkout for {{discount}} off your order."),
      btn("Shop the sale", "{{shop_url}}"),
      p("Hurry — the offer ends {{end_date}}."),
      footer({ social: [{ platform: "instagram", url: "{{instagram_url}}" }] }),
    ),
  },
];

export function startersForWing(wing: StarterWing): Starter[] {
  return STARTERS.filter((s) => s.wing === wing);
}
