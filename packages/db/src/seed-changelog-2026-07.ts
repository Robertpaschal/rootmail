import type { ChangeItem } from "@rootmail/core";
import { newId } from "@rootmail/core";
import { closeDb, db } from "./client";
import { changelogEntries } from "./schema";

// Prod-safe, idempotent: publishes the early-July release notes that shipped after
// the 2026-06-29 entries. Dedupes by title, so re-running is a no-op. Run it like
// the pricing/cms seeds (e.g. on the api host:
//   docker compose run --rm --no-deps api pnpm db:seed:changelog
// ), then revalidate the marketing changelog tag.

// NOTE: the Python/Go SDK changelog entry is intentionally held until they're
// published to PyPI / pkg.go.dev (otherwise "pip install rootmail" would 404).
// Add it back here as part of the publish step.
const ENTRIES: { title: string; date: string; changes: ChangeItem[] }[] = [
  {
    title: "Your campaigns now send from your own address",
    date: "2026-07-17",
    changes: [
      {
        kind: "Improved",
        text: "Once you verify a sending address under Settings → Sending, your campaigns and quick composes go out from it by default — not a rootmail no-reply. Pick which verified address is your default; the campaign composer shows exactly who mail will come from before you send.",
      },
    ],
  },
  {
    title: "One roof for your audience — people, imports, and audiences together",
    date: "2026-07-17",
    changes: [
      {
        kind: "New",
        text: "Contacts, Import, and Audiences merged into one Audience section: browse and search everyone you email, filter by tag, and add people by hand or from a file — the separate Import page is gone.",
      },
      {
        kind: "New",
        text: "Tags now work as subsets: click one to see just those people, then turn it into an audience in one click — or start a new audience from a tag when you create it.",
      },
      {
        kind: "New",
        text: "For developers: GET /v1/contacts (paged browse with search, tag, and status filters) and GET /v1/contacts/tags; POST /v1/lists accepts from_tag to seed a new audience.",
      },
      {
        kind: "Improved",
        text: "Suppression imports moved to Deliverability, where list hygiene lives — bring your old provider's suppression list from there.",
      },
    ],
  },
  {
    title: "Campaigns, rebuilt end-to-end — audiences, A/B by tags, and a guided composer",
    date: "2026-07-17",
    changes: [
      {
        kind: "New",
        text: "The campaign composer is now one guided flow: pick your audience (or just the contacts carrying a tag), pick a studio-designed template, and optionally A/B it — differently-tagged contacts get different versions, and the analytics show how each landed.",
      },
      {
        kind: "New",
        text: "A media library lives inside the template studio: picking an image now offers everything you've uploaded before — reuse, upload new, or delete — without leaving the canvas. The standalone Assets page is retired.",
      },
      {
        kind: "Improved",
        text: "Deliverability now tells a story: a plain-English verdict on your reputation, the four levers of inbox placement with links to act on each, and a teaching page (not a wall of zeros) before your first send.",
      },
      {
        kind: "Improved",
        text: "Webhooks, API keys, Team, and Client domains follow a view-first pattern: see what exists (or an empty state that teaches), and reveal the create form only when you ask — with how-to guides living in the docs.",
      },
    ],
  },
  {
    title: "Watch your email's whole journey — sent, delivered, opened, clicked",
    date: "2026-07-16",
    changes: [
      {
        kind: "New",
        text: "Every send now reports back in real time: the message page advances on its own from Queued to Sent to Delivered — and shows Opened and Clicked the moment they happen. No refreshing, no guessing.",
      },
      {
        kind: "New",
        text: "Your messages list shows how far each email actually got with a compact progress trail, and the overview turns your last 30 days into a connected funnel — sent → delivered → opened → clicked, with every rate and a bounce-health check alongside.",
      },
      {
        kind: "Improved",
        text: "Test sends are clearly separated from live mail (with their own lifecycle simulator), times everywhere show in your local timezone, and message details read plainly — developer identifiers now live in their own collapsed section.",
      },
    ],
  },
  {
    title: "A design studio for your emails — and a composer anyone can use",
    date: "2026-07-15",
    changes: [
      {
        kind: "New",
        text: "Templates are now a full design studio. Start from scratch, a basic layout, a ready-made template, or your own HTML — then build with a blocks palette (headings, text, images, buttons, video, dividers, spacers, headers and footers), arrange and restyle each block in an inspector, and set the whole email's look — brand color, backgrounds, fonts, corners, width — with no code. What you design is exactly what sends.",
      },
      {
        kind: "Improved",
        text: "Writing a message now feels like a normal email composer: rich formatting, a live preview of what your recipient sees, and attachments — add a PDF, image, or short video right from the composer. Press / to have AI draft the whole email from a sentence, or start from any of your templates.",
      },
      {
        kind: "Improved",
        text: "We took the developer-only controls out of the composer (the raw-HTML toggle and the idempotency-key field). Your sends are still protected from accidental double-clicks automatically, and the key is shown in each message's details when you need it.",
      },
    ],
  },
  {
    title: "Full developer docs — one reference, two places",
    date: "2026-07-14",
    changes: [
      {
        kind: "New",
        text: "A complete developer reference now lives at developers.gateml.io/docs: getting started, core concepts (idempotency, pagination, errors, sandbox, rate limits), and a page for every resource — messages, templates, contacts, audiences, campaigns, sequences, replies, client domains, webhooks (with signature verification), deliverability, proof, and the assistant — plus the SDK, CLI, and a migration guide.",
      },
      {
        kind: "Improved",
        text: "The same docs are built into the dashboard under Docs, so you can read the exact reference without leaving your workspace — one source of truth, never out of sync.",
      },
    ],
  },
  {
    title: "A living homepage that speaks your language",
    date: "2026-07-14",
    changes: [
      {
        kind: "Improved",
        text: "The whole marketing site was rewritten in plain, outcome-first language — no jargon, no code — with every feature framed as what you actually get. Sections rise into view as you scroll, cards react to your cursor, and buttons feel alive.",
      },
      {
        kind: "Improved",
        text: "Everything developer-focused — docs, install commands, the API tour — now lives entirely on developers.gateml.io, so the main site stays about the product, not the plumbing.",
      },
    ],
  },
  {
    title: "A site for everyone — and a new home for developers",
    date: "2026-07-14",
    changes: [
      {
        kind: "New",
        text: "Developers get their own site at developers.gateml.io: the full technical pitch — integrate once, change email behavior without redeploying, and everything the dashboard does, the API does.",
      },
      {
        kind: "Improved",
        text: "The main site now speaks to everyone: rootmail is a no-code product first — design emails visually, send campaigns, read replies — whether you're a clothing brand, a news desk, or a two-person startup.",
      },
      {
        kind: "Improved",
        text: "A new “Who it's for” section says it plainly: made for people, loved by developers — the same product from the dashboard, the API, or both.",
      },
    ],
  },
  {
    title: "The website now shows real, live pricing — with calculators",
    date: "2026-07-13",
    changes: [
      {
        kind: "New",
        text: "The public pricing page mirrors how rootmail actually bills: size your transactional volume in blocks or pick your audience size, and see the exact monthly and yearly price before you ever sign up.",
      },
      {
        kind: "Improved",
        text: "Every number on the pricing page is live — the same catalog the product bills from, sales included — so the website and your checkout can never disagree.",
      },
      {
        kind: "New",
        text: "All nine add-ons are listed publicly with per-one prices, and the billing promises are in writing: one bill, never billed twice, yearly is two months free.",
      },
    ],
  },
  {
    title: "A smoother dashboard: fluid navigation and one-click actions",
    date: "2026-07-13",
    changes: [
      {
        kind: "Improved",
        text: "The whole dashboard moves fluidly now — pages ease in as you navigate, the highlight glides to the section you open, and switching between Transactional and Marketing slides as one motion.",
      },
      {
        kind: "Improved",
        text: "The sidebar is wider, so Transactional, Marketing, and every section name show in full — no more cut-off labels on laptops.",
      },
      {
        kind: "New",
        text: "A “New” button in the top bar puts the six most common actions one click away from anywhere: send an email, start a campaign, design a template, import contacts, invite a teammate, create an API key.",
      },
    ],
  },
  {
    title: "One bill at checkout, and a clearer way to buy send blocks",
    date: "2026-07-13",
    changes: [
      {
        kind: "New",
        text: "Add-ons picked while buying a plan now appear inside the Stripe checkout itself — plan and add-ons together, one bill, monthly or yearly.",
      },
      {
        kind: "Improved",
        text: "Changing plans never double-charges: what you already own carries over automatically, and the unused time on your current plan is credited at checkout.",
      },
      {
        kind: "Improved",
        text: "The transactional page now shows how many blocks you're paying for versus what you're choosing (\"2 now → 4 after checkout\"), the full volume rate table, and what every plan includes.",
      },
      {
        kind: "Improved",
        text: "Add-on counters everywhere now count what you're adding — starting at zero — with \"you have N\" and \"you'll have N+X\" alongside.",
      },
      {
        kind: "New",
        text: "The sizing quiz got its own pop-up: type your monthly volume and it picks your blocks and shows the price before you commit.",
      },
    ],
  },
  {
    title: "Buying add-ons: a real checkout, charged immediately — only for what you add",
    date: "2026-07-13",
    changes: [
      {
        kind: "Fixed",
        text: "Buying an add-on now always opens the in-app Stripe checkout and charges your card right away — no more silent “you're all set” with the bill arriving later by email.",
      },
      {
        kind: "Improved",
        text: "Buying more of an add-on you already own credits everything you have on the invoice, so the charge is exactly the new part — you're never billed twice.",
      },
      {
        kind: "Improved",
        text: "The add-ons cart expands into a full order summary: what you have, what you'll have, each line's price, and what's due today.",
      },
      {
        kind: "New",
        text: "Every pricing surface is now its own page you can link to — transactional, marketing, and add-ons — and upgrade prompts across the app land you on the exact thing to buy, card highlighted.",
      },
    ],
  },
  {
    title: "Add-ons on their own, clearer marketing plans",
    date: "2026-07-11",
    changes: [
      {
        kind: "New",
        text: "Add-ons now have their own tab in Compare plans — browse them as proper product cards (what it does, the price, and how many you want) and buy them on their own, no plan required. They show what you already have, too.",
      },
      {
        kind: "Improved",
        text: "The Marketing plans are now an honest, side-by-side comparison: for your chosen contact size, each plan shows the real monthly emails, daily limit, number of audiences, and exactly which features it unlocks — with the plan names and prices staying pinned as you scroll. No vague wording.",
      },
      {
        kind: "Improved",
        text: "Audiences are now a real part of each Marketing plan (1, 3, 10, 50) instead of a vague 'unlimited' — you always know what your plan includes.",
      },
      {
        kind: "Fixed",
        text: "The Change plan button on Plan & usage now works, the plan tabs animate smoothly, and configuring add-ons during a Marketing purchase carries them into the same checkout.",
      },
    ],
  },
  {
    title: "One cart, one checkout",
    date: "2026-07-11",
    changes: [
      {
        kind: "Improved",
        text: "Building your plan now works like a normal cart: choose your send blocks, add a dedicated IP or client domains, and see an order summary on the right that adds everything up — then pay for it all in a single checkout, on one subscription.",
      },
      {
        kind: "Fixed",
        text: "Add-ons you choose while building a plan now stay part of that plan and show in your bill, instead of being a separate purchase that disappeared afterwards.",
      },
    ],
  },
  {
    title: "Checkout without leaving the page",
    date: "2026-07-11",
    changes: [
      {
        kind: "New",
        text: "Upgrading now happens right inside rootmail — pick your blocks, contact size, or add-ons and pay in an in-app checkout, no redirect to a separate page. Change your mind and edit your selection freely before you pay.",
      },
      {
        kind: "New",
        text: "Add-ons now flow through checkout: build your set, see the running monthly total, and pay for them together — no more silent changes.",
      },
      {
        kind: "Fixed",
        text: "Cancelling a checkout no longer leaves your plan looking upgraded. Your plan reflects only what you've actually paid for, and Plan & usage refreshes itself — you never have to reload to see the real status.",
      },
    ],
  },
  {
    title: "Pricing you can actually reason about",
    date: "2026-07-11",
    changes: [
      {
        kind: "New",
        text: "Marketing is now sized by your contact list: pick your audience size and each plan shows exactly what it gives you at that size — the monthly emails, the daily limit, and the price. 500 contacts and 5,000 contacts are genuinely different, so you never overpay for room you don't use.",
      },
      {
        kind: "New",
        text: "Plan & usage is now a proper billing dashboard: this month's estimated bill, live meters for transactional sends, marketing audience, and AI credits, an itemized breakdown of every charge, and your past invoices — each downloadable as a PDF.",
      },
      {
        kind: "Improved",
        text: "The separate Platform plan is gone. Seats, workspaces, custom roles, SSO, proof exports, residency, and AI credits are now simple add-ons priced per one — added wherever you need them, never a 'contact us'.",
      },
      {
        kind: "Improved",
        text: "Buying send blocks is clearer and friendlier: an emphasized yearly saving, transactional extras (dedicated IP, client domains) folded right in with plain-English explanations, and a 'not sure how many?' helper that sizes the blocks for you — only when you want it.",
      },
    ],
  },
  {
    title: "Each wing has its own pricing page now",
    date: "2026-07-09",
    changes: [
      {
        kind: "New",
        text: "Transactional, Marketing, and Platform each have a dedicated pricing page — its own meter, its own sizing question, its own plans and add-ons, and a plain-English tour of exactly what that side includes. No more one giant page for everything.",
      },
      {
        kind: "Improved",
        text: "Plan & usage now follows the wing you're working in: in Transactional you see send volume against your blocks; in Marketing you see your audience against its bracket — each side stands cleanly on its own.",
      },
      {
        kind: "Improved",
        text: "Every upgrade path lands on the right page: hit a send limit and you're taken to Transactional pricing, hit your contact bracket and you're taken to Marketing — with the other wings one deliberate click away, never mixed in.",
      },
    ],
  },
  {
    title: "Billing that reads like the product — per wing",
    date: "2026-07-09",
    changes: [
      {
        kind: "New",
        text: "Yearly billing is now available per wing — pay for send blocks, your Marketing bracket, or Platform yearly (2 months free), each side on its own schedule.",
      },
      {
        kind: "Improved",
        text: "Your bill now reads exactly like the product: a Transactional line (your blocks), a Marketing line (your bracket), and a Platform line — plus any overage, all itemized honestly.",
      },
      {
        kind: "Improved",
        text: "Add-ons now belong to their wing: dedicated IPs and client-domain packs extend Transactional, seats and workspace packs extend Platform — each billed on that wing's own subscription.",
      },
      {
        kind: "Improved",
        text: "Send past your blocks and the overage now bills automatically through a metered line — sending never stops, and you only pay for what actually went out.",
      },
    ],
  },
  {
    title: "Scaling is never punished — blocks and brackets",
    date: "2026-07-08",
    changes: [
      {
        kind: "New",
        text: "Transactional email is now bought in blocks of 25,000 sends at volume rates that drop as you grow ($8 → $7 → $6 per block). Estimate your volume, buy exactly that, change it any time — your first 3,000 sends each month stay free.",
      },
      {
        kind: "New",
        text: "Marketing email never counts against your send blocks. You pay for audience size, and a campaign to your whole audience is always included — a million contacts can receive a full promo round without touching transactional volume.",
      },
      {
        kind: "Improved",
        text: "Onboarding now sizes your account: tell us your monthly sends, contacts, and team, and the pricing page opens with your per-wing recommendation ready. Plan & usage shows each wing's real meter — sends against blocks, audience against its bracket.",
      },
      {
        kind: "Improved",
        text: "The old one-size plans (Free/Pro/Scale) are gone. Everything is per wing now — clearer, honest, and each side billed on its own.",
      },
    ],
  },
  {
    title: "Pay per wing — pricing you can actually choose",
    date: "2026-07-08",
    changes: [
      {
        kind: "New",
        text: "Per-wing pricing is live: Transactional is sized by send volume, Marketing by contacts, and Platform by your team — each on its own plan, billed on its own. Be Free on one side and scale the other; you only pay for what you use.",
      },
      {
        kind: "New",
        text: "Pick a tier right from Plan & usage → Pricing by wing: paid tiers check out through Stripe, Free tiers apply instantly, and wings you haven't chosen start on Free.",
      },
      {
        kind: "New",
        text: "Not sure what fits? Answer three questions — emails per month, contacts, team size — and we'll recommend a tier per wing with a combined monthly total.",
      },
    ],
  },
  {
    title: "Lists are now Audiences",
    date: "2026-07-07",
    changes: [
      {
        kind: "Improved",
        text: "The marketing side now speaks in audiences — the distinct groups of people you communicate with (customers, subscribers, beta users). Create one, then send a campaign or sequence to exactly the right audience.",
      },
      {
        kind: "Improved",
        text: "The Audiences page shows how many audiences you have and your total memberships, and explains that a contact in more than one audience is counted in each — how contact-based marketing plans are sized.",
      },
    ],
  },
  {
    title: "Know exactly what's left to set up",
    date: "2026-07-07",
    changes: [
      {
        kind: "Improved",
        text: "The Overview now tracks your setup progress — how many steps are left and roughly how long — and calls out the ones that actually block sending, like verifying a sending address, broken into clear sub-steps.",
      },
      {
        kind: "Improved",
        text: "Composing an email now reminds you to verify a sending address if you haven't yet, so mail can go out from your own domain instead of a rootmail one.",
      },
      {
        kind: "Improved",
        text: "The ⌘K search is refreshed and context-aware: grouped by the wing you're working in, with billing, add-ons, and settings all reachable — and it understands synonyms, so “domains”, “spf”, or “upgrade” find the right place.",
      },
    ],
  },
  {
    title: "Clearer wings, honest unlock pricing",
    date: "2026-07-07",
    changes: [
      {
        kind: "Improved",
        text: "The Transactional and Marketing wings now explain themselves in plain English — a one-line description under the switcher and a tooltip on hover, so you always know what each side is for without any prior knowledge.",
      },
      {
        kind: "Fixed",
        text: "Locked sections were showing the unlocking plan's price far too small (a formatting bug — e.g. $0.80 instead of $80). They now show the plan's real price and make clear it unlocks the whole plan, not just that one feature.",
      },
      {
        kind: "Improved",
        text: "“Domains” is now “Client domains” — clearly distinct from your own from-address (which lives in Settings → Sending), so the two are never confused.",
      },
    ],
  },
  {
    title: "A design studio for your templates",
    date: "2026-07-07",
    changes: [
      {
        kind: "New",
        text: "Creating a template now opens a design gallery: pick a ready-made layout — Welcome, Password reset, Receipt or Notification for transactional; Newsletter, Announcement or Promotion for marketing — see it rendered as a real email, and edit it endlessly. No blank page to stare at.",
      },
      {
        kind: "Improved",
        text: "Template setup speaks plainly: choose “what's this for?” (Transactional or Marketing) instead of a raw type field, and the API slug is generated for you and tucked under Developer details.",
      },
    ],
  },
  {
    title: "Plans and templates, in the two wings",
    date: "2026-07-07",
    changes: [
      {
        kind: "Improved",
        text: "The plan comparison now groups everything by what it's for — Transactional, Marketing, and Platform — and takes the time to explain, in plain words, what each feature actually does for you.",
      },
      {
        kind: "Improved",
        text: "Your templates shelve by purpose: Transactional blocks for product email, Marketing designs for your audience — opening on the shelf that matches where you're working.",
      },
    ],
  },
  {
    title: "Send as yourself — your own from-address",
    date: "2026-07-07",
    changes: [
      {
        kind: "New",
        text: "Add your own from-addresses under Settings → Sending: we email that inbox a confirmation link, and once clicked it appears in compose's From menu — hello@yourcompany.com instead of a rootmail address.",
      },
      {
        kind: "New",
        text: "Replies follow your business: mail sent from your address returns to your real inbox, no forwarding setup needed.",
      },
      {
        kind: "Improved",
        text: "If a send uses an unverified From, we now tell you plainly and point you to the fix — instead of a cryptic provider error.",
      },
      {
        kind: "Improved",
        text: "Templates now shelve by what they're for — Transactional blocks vs Marketing designs — and open on the shelf matching the wing you're working in.",
      },
      {
        kind: "Improved",
        text: "The plan comparison takes the time to explain what each feature actually does, in plain words under every line.",
      },
    ],
  },
  {
    title: "Compose that looks like email",
    date: "2026-07-06",
    changes: [
      {
        kind: "New",
        text: "Composing is now a real email surface: From, To, Subject, your message — with a live preview of exactly what your recipient gets, updating as you type.",
      },
      {
        kind: "New",
        text: "Templates are woven into writing: pick one under “Start from” and the preview fills in; add personalization and watch the placeholders resolve.",
      },
      {
        kind: "Improved",
        text: "No more jargon in the way — technical fields are gone or tucked behind Advanced, page descriptions across the dashboard now say what each section does in plain words, and upgrade buttons go straight to checkout.",
      },
    ],
  },
  {
    title: "Two dashboards: Transactional and Marketing",
    date: "2026-07-06",
    changes: [
      {
        kind: "New",
        text: "The dashboard now has two clear wings, because they're two different jobs: Transactional (the send API, templates & blocks, message log, domains, deliverability) and Marketing (campaigns, sequences, replies, audience, engagement). Switch with one click — rootmail remembers where you work.",
      },
      {
        kind: "Improved",
        text: "The primary action follows the wing: “Send email” in Transactional, “New campaign” in Marketing.",
      },
    ],
  },
  {
    title: "A proper welcome — onboarding that sets you up right",
    date: "2026-07-06",
    changes: [
      {
        kind: "New",
        text: "New accounts get a short guided setup: your business details (the postal address anti-spam law requires — added to your marketing footers automatically), what you do, and how you send today. Each step says why we ask.",
      },
      {
        kind: "New",
        text: "Setup ends with a plan recommendation matched to your answers — prices stay pinned while you compare what each tier actually does, and continuing on Free is always one click.",
      },
      {
        kind: "Improved",
        text: "Coming from SendGrid, Mailgun, Postmark, or Mailchimp? Telling us during setup points the migration importer at the right export from day one.",
      },
      {
        kind: "Improved",
        text: "Locked sections now show what they'd do for you — the concrete capabilities and the live price of the plan that unlocks them — instead of just a lock icon.",
      },
    ],
  },
  {
    title: "Single sign-on (SAML) for your team",
    date: "2026-07-04",
    changes: [
      {
        kind: "New",
        text: "Enterprise workspaces can now connect a SAML identity provider — Okta, Microsoft Entra ID, Google Workspace, or any SAML 2.0 IdP. Set it up in Settings → Single sign-on.",
      },
      {
        kind: "New",
        text: "Members sign in with “Log in with SSO”: enter your work email and you're routed to your company's identity provider. New teammates are provisioned automatically on first login.",
      },
      {
        kind: "New",
        text: "Optional enforcement turns off password login for your domain, so everyone signs in through your IdP.",
      },
      {
        kind: "New",
        text: "SCIM 2.0 provisioning: connect it in your identity provider and members are created, updated, and deactivated automatically — deprovisioned people lose access immediately.",
      },
    ],
  },
  {
    title: "Clearer settings, enterprise foundations",
    date: "2026-07-04",
    changes: [
      {
        kind: "Improved",
        text: "Settings is reorganized into clear tabs — Profile, Security & login, and Sender address — so each is a real page you can open directly, instead of a hub that led with your profile.",
      },
      {
        kind: "New",
        text: "Your Compliance page now shows data residency — exactly where this organization's data is stored and processed.",
      },
      {
        kind: "New",
        text: "We've mapped rootmail's security controls to the SOC 2 criteria as part of becoming enterprise-ready.",
      },
    ],
  },
  {
    title: "Send like a real business — compliance & migration",
    date: "2026-07-03",
    changes: [
      {
        kind: "New",
        text: "Set your business's postal address in Settings → Sender address; it's added automatically to marketing and sales footers to meet anti-spam law, with a live preview as you type.",
      },
      {
        kind: "New",
        text: "Bulk mail now carries one-click unsubscribe headers (RFC 8058), so Gmail and Yahoo show their native unsubscribe button — which keeps you on the right side of their bulk-sender rules.",
      },
      {
        kind: "New",
        text: "Import a template — upload or paste HTML from any provider, preview it, and save it as a rootmail template. SendGrid's Handlebars placeholders carry over unchanged.",
      },
      {
        kind: "New",
        text: "A hosted test inbox: every sandbox send appears in the dashboard with its full rendered content — no real mailbox needed, and it never touches your reputation.",
      },
      {
        kind: "Improved",
        text: "Contact and suppression import now takes a drag-in CSV file, not just paste — bring your SendGrid, Postmark, or Mailgun export straight in.",
      },
    ],
  },
  {
    title: "Upgrade where you hit the limit",
    date: "2026-07-01",
    changes: [
      {
        kind: "New",
        text: "Plan & usage is now two tabs — your current plan and usage on one, a full plan comparison with checkout on the other.",
      },
      {
        kind: "New",
        text: "Every limit you meet — send quota, workspaces, AI credits, a locked feature — links straight to the plan comparison, with a recommendation matched to your actual usage.",
      },
      {
        kind: "Improved",
        text: "Yearly prices show exactly what you save, each tier lists what it adds over the previous one, and the promo-code entry point is clearer.",
      },
    ],
  },
  {
    title: "See how every campaign lands",
    date: "2026-07-02",
    changes: [
      {
        kind: "New",
        text: "Campaigns and sequences now have engagement analytics — the sent → delivered → opened → clicked funnel per campaign, and per-step drop-off for sequences.",
      },
      {
        kind: "New",
        text: "Lifecycle email, done for you: payment receipts, password-change notices, a heads-up as you approach your monthly quota, and a nudge if you've been away a while.",
      },
      {
        kind: "Improved",
        text: "The AI assistant plans multi-step work — it discovers what exists, reuses it instead of duplicating, builds the rest, and ends with a checklist of everything it did.",
      },
      {
        kind: "Improved",
        text: "Messages in the dashboard are searchable and paged, so big send histories stay navigable.",
      },
    ],
  },
];

async function main(): Promise<void> {
  const existing = new Set(
    (await db.select({ title: changelogEntries.title }).from(changelogEntries)).map((r) => r.title),
  );
  let inserted = 0;
  for (const e of ENTRIES) {
    if (existing.has(e.title)) continue;
    await db.insert(changelogEntries).values({
      id: newId("changelogEntry"),
      title: e.title,
      entryDate: new Date(`${e.date}T12:00:00Z`),
      changes: e.changes,
      status: "published",
      publishedAt: new Date(),
      createdBy: null,
    });
    inserted++;
  }
  console.log(`changelog seed: ${inserted} inserted, ${ENTRIES.length - inserted} already present`);
}

main()
  .then(() => closeDb())
  .catch(async (err) => {
    console.error(err);
    await closeDb();
    process.exit(1);
  });
