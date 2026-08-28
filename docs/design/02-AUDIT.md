# rootmail — product design audit

**Status: diagnosis. Written 2026-08-27 against `main` @ `77c4fe2`.**
Companion to `00-PHILOSOPHY.md`. This file fixes nothing; it establishes what is
actually on screen, with computed values, quoted copy and file paths, so that the
redesign argues with evidence instead of taste.

Method: the marketing site was run locally (`preview_start` → `apps/marketing`)
and interrogated through `getComputedStyle` and DOM extraction rather than
screenshots (screenshots were not compositing reliably in this environment, and
computed values are harder evidence anyway). The dashboard was read as source —
running it needs Postgres, Redis, a seed and a minted session, which is out of
scope for a design audit.

---

## 0. The one-sentence diagnosis

> **rootmail reads as blank because it spends its entire visual budget on
> sameness — ten consecutive homepage sections with identical 30px/700 centered
> headings and 62 bordered cards, 114 more cards across 57 dashboard pages — so
> nothing on any screen is emphasised, and a product whose only claim is
> "we can tell you exactly what happened" ends up looking like a product with
> nothing in particular to say.**

The corollary, and the reason this is fixable: **the judgement is all there, it
is just in the comments instead of the pixels.** `promises.tsx` cites the route
that makes each claim true. `carousel.tsx` explains why it uses a CSS transition
instead of rAF. `messages/page.tsx` argues, in a comment nobody will ever read,
that offering a fake send first "teaches you not to trust what you see here."
`message-flow.tsx` computes the real furthest-known state from engagement
timestamps because the stored status would lie. Every one of those is a design
decision of the exact kind `00-PHILOSOPHY.md` asks for, and not one of them is
visible on screen.

---
## 1. The marketing site, walked

Run locally at `http://localhost:3000` (`apps/marketing`), measured at 1280×800
and 375×812, in both themes.

### 1.1 The core failure: ten sections, one layout

`apps/marketing/src/app/page.tsx` renders twelve children of `<main>`. Here is
what `getComputedStyle` says about them, at 1280px, light:

| # | Component | Heading | py | bg | container | bordered cards |
|---|---|---|---|---|---|---|
| 0 | `hero.tsx` | "All your email in one place. Every client's, kept apart." | 80 / 112 | transparent | 1280 | 1 |
| 1 | `marquee.tsx` | — | 16 / 16 | `secondary/20` | — | 0 |
| 2 | `layer.tsx` | "Keep what delivers your mail…" | 80 / 80 | `secondary/30` | 1200 | 2 |
| 3 | `product-show.tsx` | "This is what a Tuesday looks like" | 80 / 80 | `secondary/20` | 1200 | 13 |
| 4 | `who-its-for.tsx` | "Made for people. Loved by developers." | 80 / 80 | transparent | 1200 | 4 |
| 5 | `layer-model.tsx` | "Send. Converse. Prove." | 80 / 80 | `secondary/30` | 1200 | 3 |
| 6 | `features.tsx` | "Everything your email needs to just work" | 80 / 80 | transparent | 1200 | 12 |
| 7 | `subtenancy.tsx` | "Send for every client — from their own name" | 80 / 80 | transparent | 1200 | 1 |
| 8 | `promises.tsx` | "A few things we decided on your behalf" | 80 / 80 | `muted/30` | 1200 | 5 |
| 9 | `pricing.tsx` | "Two products. Each priced by what it actually uses." | 80 / 80 | `secondary/30` | 1200 | 20 |
| 10 | `faq.tsx` | "Questions, answered" | 80 / 80 | transparent | 768 | 1 |
| 11 | `cta.tsx` | "Send your first email in minutes" | 80 / 80 | transparent | 1200 | 0 |

**Ten of twelve sections have identical vertical padding (80px top, 80px bottom).
Ten of twelve share the identical 1200px container. Nine of eleven headings
compute to exactly the same type: `font-size: 30px`, `font-weight: 700`,
`letter-spacing: -0.75px`.** Eight of them are `text-align: center`. Eight open
with an eyebrow `<Badge>` above the heading and close it with a muted
`text-lg` paragraph below.

That is not a rhythm. That is one section repeated ten times with the nouns
swapped. There is **no typographic signal anywhere on the page that any section
matters more than any other** — the pricing table and "Who it's for" are set in
the same size, weight, tracking, alignment, width and colour.

**Count of "bordered card grid on a muted ground":** sections 2, 3, 4, 5, 6, 8
and 9 are all *background tint + centered heading block + grid of rounded,
bordered cards*. That is **seven consecutive instances** (positions 2–9, with
only `subtenancy` at 7 breaking to a left-aligned two-column layout). Total
bordered, radius ≥ 8px boxes on the homepage: **62**. Total tinted icon chips
(`bg-primary/10 text-primary` squares, the single most recognisable shadcn
demo tell): **29**.

The alternation of `bg-secondary/20` → transparent → `bg-secondary/30` is doing
the work that typography, measure and density should be doing. It is the
cheapest available differentiator and it reads as exactly that.

### 1.2 The page is 12,753px tall. On mobile it is 22,347px.

`document.documentElement.scrollHeight` = **12,753px** at 1280×800 — sixteen
viewport-heights for one landing page. At 375×812 it is **22,347px**, i.e.
**27.5 phone screens**. The pricing section alone is 2,508px tall at desktop.

The mobile figure is the more damning one, because the padding does not adapt:
`py-20 md:py-28` means a phone still gets 80px above and 80px below every
section. Ten sections × 160px = **1,600px of the mobile page is empty padding**,
roughly two full screens of nothing, spent separating sections that already look
identical.

### 1.3 Where the page is indistinguishable from any other shadcn site

Concrete, computed tells:

- `--primary: 243 75% 59%` (light) / `243 75% 66%` (dark) — literally the
  shadcn default indigo, unchanged. `--radius: 0.65rem`.
  (`apps/marketing/src/app/globals.css`)
- `font-family` on every heading resolves to
  `ui-sans-serif, system-ui, -apple-system, "Segoe UI"…`. **No typeface is
  loaded.** `next/font` appears nowhere in the repo. The single highest-signal
  brand surface — the letterforms — is the OS default.
- The h1's second clause is a violet gradient:
  `bg-gradient-to-r from-primary to-violet-500 bg-clip-text text-transparent`
  (`hero.tsx:79`). Indigo→violet gradient text is the single most reproduced
  visual gesture in 2020s SaaS.
- Two `blur-[130px]` / `blur-[100px]` aurora blobs behind the hero
  (`hero.tsx:52-64`), plus a third `blur-[120px]` glow inside the closing
  `bg-zinc-950` slab (`cta.tsx:10`). Hero aurora + dark closing slab is the
  default template.
- 29 `bg-primary/10 text-primary` icon chips. 12 of them are in one
  three-column grid (`features.tsx`).
- The FAQ is a `<details>` list with a `ChevronDown`. The persona section is
  four equal cards with an icon, a title, an uppercase micro-label and a
  paragraph.

None of these are individually wrong. Together they are a costume. A reader who
has seen five developer-tool landing pages this year has seen this exact page,
and will assign it the credibility of the median one — which, for a product
whose entire pitch is *"do not trust dashboards, trust our record"*, is the most
expensive possible outcome.

### 1.4 Copy that says nothing

Quoted verbatim, with locations:

- **`features.tsx:75`** — "Everything your email needs to **just work**". Uses a
  banned word from `00-PHILOSOPHY.md §4`, promises the absence of effort ("Effort
  is not the problem. Not knowing is."), and is a sentence Mailgun, Postmark,
  Resend and Loops could all run unchanged.
- **`features.tsx:79`** — "Use what you need today; the rest is there the day you
  want it. No plugins, no add-on tools, no 'talk to IT'." Three negations and no
  claim.
- **`who-its-for.tsx:52`** — "**Made for people. Loved by developers.**" This is
  an aphorism with no content. Both halves are unfalsifiable, "Loved by" is
  borrowed traction we do not have (closed beta, no named customers), and the
  section it titles exists to tell readers they are the audience — which,
  per the philosophy, is a section only non-buyers need.
- **`who-its-for.tsx:56`** — "Whatever you sell, publish, or build, it's the same
  email platform underneath." True of every email platform.
- **`layer-model.tsx:64`** — "Start with a single welcome email. Grow into
  conversations with your audience, and records you can stand behind — without
  ever moving to another tool." Growth-arc boilerplate; no mechanism, no number.
- **`cta.tsx:16`** — "**Send your first email in minutes**" / "all in one
  sitting. Nothing to install, no credit card to start." The closing argument is
  a speed claim. Speed is not the thing this product is better at, and it is the
  same sentence as every competitor's closing slab.
- **`hero.tsx:88`** — the hero body is one 5-sentence, 66-word paragraph carrying
  receipts, newsletters, replies, sub-tenancy, BYO-provider *and* "If you can
  write an email, you can run rootmail." Nothing in it is wrong; nothing in it is
  load-bearing either, because six claims at equal weight is zero claims.
- **`hero.tsx:37`** eyebrow — "Your email, and every client's — kept apart" — is
  the same sentence as the h1 directly beneath it. The badge is decoration.
- **`faq.tsx`, "Is my data safe?"** — "Your data is strictly isolated to your
  organization — **no other customer can ever see it.**" Given
  `docs/BRIEF-2026-08-18-positioning-gaps.md` P1.4 (`getScopedMessage()` scopes
  on `workspaceId` only), an absolute "can ever" is a claim the code has not
  earned the right to state in that form. Flagging as a design-of-claims issue,
  not re-litigating the brief.

By contrast — and this is the tell — `promises.tsx` is written in a completely
different, much better voice: "Unsubscribing stops the newsletter, not the
password reset", "The sandbox doesn't lie to you", "A sandbox that flatters you
is worse than no sandbox, because you only find out on the day it matters."
That is a product with a spine. It sits at **position 8 of 12**, behind twelve
feature cards, styled identically to everything around it.

### 1.5 Contrast, measured

Computed with proper alpha compositing against the effective background stack,
over all 410 (light) / 420 (dark) text-bearing elements in `header`/`main`/`footer`.

**Light theme — 5 failures**, all marginal:
| Text | Colour | On | Ratio | Needs |
|---|---|---|---|---|
| hero eyebrow badge | `rgb(113,113,122)` 12px | `rgb(244,244,245)` | **4.40** | 4.5 |
| pricing "up to 100,000" | `rgb(113,113,122)` 12px | `rgb(246,246,254)` | **4.49** | 4.5 |
| pricing "/mo · $900/yr" | `rgb(113,113,122)` 10px | `rgb(246,246,254)` | **4.49** | 4.5 |
| product-show "customer" chip | `rgb(113,113,122)` 10px | `rgb(244,244,245)` | **4.40** | 4.5 |

`--muted-foreground` in light is `240 3.8% 46.1%` → `rgb(113,113,122)`, which is
4.61:1 on pure white and drops below AA the moment it lands on any tinted
surface. Given that six of the twelve sections *are* tinted surfaces, this is
systemic, not incidental.

**Dark theme — 9 failures, and 8 of the 9 are the indigo:**
| Text | Colour | On | Ratio |
|---|---|---|---|
| "Sending for other people?" eyebrow | `rgb(110,103,233)` 12px | `rgb(27,27,42)` | **3.88** |
| "A look inside" eyebrow | same | `rgb(25,24,39)` | **3.99** |
| "Who it's for" eyebrow | same | `rgb(19,18,33)` | **4.20** |
| "What you stop building" | same 14px | `rgb(13,13,15)` | **4.42** |
| "None of this is required" link | same 14px | `rgb(18,18,20)` | **4.26** |
| "customer" tag, product-show | same 12px | `rgb(23,22,37)` | **4.06** |
| "Re: Your order is on…" | same 10px | `rgb(23,22,37)` | **4.06** |
| "Talk to us" footer link | same 12px | `rgb(13,13,15)` | **4.42** |

Every single dark-mode contrast failure on the homepage is `text-primary` — the
indigo. The default `--primary` is not merely anonymous; at 12px on a dark tint
it is **unreadable to spec**. `00-PHILOSOPHY.md §5.2`'s "kill indigo" is not only
an aesthetic argument; it is also the accessibility fix.

The h1 gradient span is unmeasurable by definition (`color: rgba(0,0,0,0)`,
painted by `background-clip`). If the background image fails to paint — forced
colours, high-contrast mode, some print paths — half the headline is invisible.

### 1.6 375px

No horizontal overflow (the marquee track at 2,304px is correctly clipped by an
`overflow-hidden` parent). But:

- **40 `<a>`/`<button>` elements are under 32px tall** at 375px, well under the
  44px touch guidance. Sample: "Ask for an invite" (20px), "building a product?"
  (20px), "None of this is required" (17px), the product-show tab controls
  "Design"/"Audience"/"Delivery"/"Replies"/"Assistant" (28px each), the pricing
  contact-count chips "500" (26px × 45px).
- Section padding does not shrink (§1.2).
- The five product-show carousel tabs sit in a row at 375px as 68–82px wide,
  28px tall pills — the primary navigation of the only section that shows the
  actual product is the hardest thing on the page to hit with a thumb.

### 1.7 Motion: the site violates its own stated rule

`apps/marketing/tailwind.config.ts:62-66` states the policy correctly: *"every
one of these animates a decorative property on an element that is ALREADY at its
resting, readable state — never opacity 0 → 1."*

`apps/marketing/src/components/site/motion.tsx:41` does exactly the forbidden
thing, for the whole page:

```
initial={{ opacity: 0, y }}
```

There are **41 `motion.div` wrappers with an inline opacity** on the homepage.
Server-rendered, every one of them ships at `opacity: 0`. The only escape hatch
is a mount-time `document.visibilityState === "hidden"` check
(`motion.tsx:31-36`), which fires once and covers the background-tab case only.
Any condition that stops rAF *after* mount — and the preview pane is one, but so
is a throttled low-power device or a framer-motion chunk that fails to
load — leaves whole sections at `opacity: 0` with no CSS or `<noscript>`
fallback. Content that is invisible until an animation runs is content that
sometimes does not exist. Per `00-PHILOSOPHY.md §6` this is a refusal, and the
codebase already knows it.

(The `Carousel` in `carousel.tsx`, by contrast, is *correctly* built for this —
CSS transition on `transform` plus a `setInterval`, explicitly so it arrives at
its end state when frames don't tick. That reasoning should be ported to
`Reveal`, not deleted.)

---
### 1.8 `/pricing` is a homepage section with a URL

`apps/marketing/src/app/pricing/page.tsx` renders exactly two children:
`<Pricing />` and `<Cta />` — the *same two components* that occupy positions 9
and 11 of the homepage.

Consequences, measured:

- **`document.querySelectorAll('h1').length === 0`.** The page's top heading is
  an `<h2>` ("Two products. Each priced by what it actually uses.") because the
  component was written to live inside a page that already had an h1. The
  dedicated pricing page — one of exactly two pages a considering buyer will
  visit — has no first-level heading at all.
- It opens with the eyebrow badge "Pricing" above a heading, which is the same
  opening gesture as the nine sections the reader just scrolled past.
- 20 bordered cards; 3,758px tall.
- The closing section is the identical `bg-zinc-950` + `blur-[120px]` slab with
  "Send your first email in minutes", so the reader sees the same closing
  argument twice in one session.

There is no pricing-specific framing anywhere: no "what will this cost me at my
volume" opening, no comparison to the $90/month sub-account gate that
`00-PHILOSOPHY.md §7.7` identifies as the actual pricing argument, no statement
of what happens when you exceed. (The overage sentence *is* good and buried:
"past your blocks it's just $0.4/1,000 — sending never stops.")

### 1.9 `/beta` is the best page on the site

Worth saying plainly, because the redesign should copy it rather than flatten it:

- Real `<h1>` at 48px/600 — "Help us finish rootmail" — and it is a *position*,
  not a category label.
- **Zero bordered cards.** 1,576px tall. The whole page fits in two screens.
- The copy takes the philosophy's voice without having been told to: "It works
  today, and it's early enough that what you say still changes it." / "We can't
  learn what's worth paying for from someone standing behind a paywall." /
  "Sending is capped while our email provider lifts the limits every new sender
  starts under — **that's our constraint, not the product's**."

One defect: it renders **"0 of 0 places left in this round."** A naked
zero-of-zero reads as *the beta is closed and the page is broken*. Per
`00-PHILOSOPHY.md §4`, a number without a window is not a number, and a number
that renders as `0 of 0` is worse than no number — it is a dotted state being
drawn as a solid one.

---
## 2. The dashboard, read as source

Not run (needs Postgres + Redis + a seed + a minted session). Everything below is
from the JSX.

### 2.1 The shape of the thing, in counts

| Measure | Count |
|---|---|
| `page.tsx` files under `apps/dashboard/src/app` | 57 |
| Files using `<PageHeader>` | 38 |
| `<Card …>` instances | 114 |
| `<CardTitle>` instances | 43 |
| `bg-primary/10` tinted chips | 54 |
| `<EmptyState>` call sites | 12 |

114 cards across 57 pages. The dominant unit of the dashboard is *a bordered box
with a 16px semibold title in its top-left corner*. `CardTitle` is used 43 times
and in `app/(app)/page.tsx` every single one is `className="text-base"` — the
same size as the body text beside it. There is no size hierarchy inside a page
either.

### 2.2 What an operator sees first

`apps/dashboard/src/app/(app)/page.tsx` is 626 lines and renders, top to bottom:

1. `<Greeting>` — "Good morning, {firstName}" + "Here's how {workspace} is doing
   this period." (line 154)
2. `<OnboardingChecklist>` — 8 steps
3. A 3-column row: **Deliverability** card (a letter grade in a coloured circle
   and a `/100` score) + **"Everything you send · 30 days"** funnel card
4. Two `WingCard`s: Transactional (violet) and Marketing (amber)
5. **"Quick actions"** — 4 identical link tiles: Import contacts, Design a
   template, View analytics, Ask the assistant
6. **"Recent messages"** — a 10-row table
7. A workspace/billing card

That is seven rows of boxes. Every one of them **reports**. Not one of them
**acts, decides, or tells the operator what to do about anything**.

Specifics:

- **"Here's how {workspace} is doing this period."** — "this period" is not a
  window. The card below it says "30 days"; the billing meters below *that* are
  a calendar month. Three different periods, one undefined word.
- The **funnel card** presents `Sent → Delivered → Opened → Clicked` as four
  equal figures with equal weight (line 96-105). "Delivered" is a provider
  confirmation. "Opened" is a tracking pixel. They are rendered identically, with
  `pct(analytics.rates.open)` labelled flatly as "open rate". This is precisely
  the thing `00-PHILOSOPHY.md §1` names as the industry's founding lie, shipped
  on our own overview.
- **`gradeTone()`** (lines 37-53) maps A/B/C/D/E to five different hardcoded
  palettes (`bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 …`). A letter
  grade in a coloured circle is the exact "aggregate with no method attached"
  gesture the philosophy rejects — and there is no window, no threshold, and no
  statement of what moves it, anywhere on the card.
- **Empty score copy**: `"Send a few emails to earn a reputation score."` (line
  200). "A few" is the wrong number and there is a right one (~50 delivered).
- The **two `WingCard`s are colour-coded violet and amber** (`accent="text-violet-600"`,
  `accent="text-amber-600"`). Under the philosophy's colour law those are the
  *state* colours — amber is `--acted`, i.e. "we intervened". Using amber to mean
  "this is the marketing product" permanently spends the alarm colour on a noun.
- **"Quick actions"** is four verbs with no reason attached. It is the section a
  dashboard grows when nobody decided what the page is for.

**Nothing on this page is doing work for the operator.** The closest thing is
`OnboardingChecklist`, which computes real completion from real data — and it is
the only component here that isn't just a read-out. Compare `00-PHILOSOPHY.md §8`
("Day 30… the default view is not a grid of metrics; it is what changed and what
we did about it"): the system *does* throttle, pause, detect DNS drift and sweep
reputation hourly, and **none of it appears on this screen**. The product acts
and then declines to mention it.

### 2.3 The empty states — 8 of 12 are the absence of a thing

`00-PHILOSOPHY.md §4` says "No headline is the absence of a thing… we currently
ship four of them." The real number is **eight**:

| File | Title | Verdict |
|---|---|---|
| `messages/page.tsx:100` | "Nothing sent yet" | absence |
| `contacts/page.tsx:565` | "No audiences yet" | absence |
| `api-keys/api-keys-manager.tsx:135` | "No API keys yet" | absence |
| `sub-tenants/page.tsx:118` | "No client domains yet" | absence |
| `members/roles-section.tsx:63` | "No custom roles yet" | absence |
| `webhooks/webhook-console.tsx:81` | "No endpoints yet" | absence |
| `templates/page.tsx:61` | "No templates yet" | absence |
| `sequences/page.tsx:58` | "No sequences yet" | absence |
| `contacts/page.tsx:517` | "Nobody matches" | absence, but correct for a search result |
| `deliverability/page.tsx:231` | "Your deliverability picture builds as you send" | **good** — a claim |
| `campaigns/page.tsx:103` | "Your first campaign starts here" | **good** |
| `members/page.tsx:122` | "It's just you so far" | **good** — has a voice |

The *descriptions* are wildly uneven in effort, and the unevenness maps exactly
onto how much the writer cared:

- Best: `sub-tenants` — "let each client send under their own domain, verified,
  with their bounces and complaints scored separately **so you can see which
  client is going wrong**." That last clause is the product's actual thesis and
  it appears in an empty state and essentially nowhere else.
- Best: `api-keys` — "**You don't need one to send from the dashboard** — keys
  are for integrating the REST API…" Answers the question the user actually has.
- Worst: `templates` — "Create a reusable email once, then use it in sends,
  campaigns, and sequences." A definition of the noun in the title.
- Worst: `sequences` — "Create one to drip a welcome series, onboarding, or
  re-engagement flow." Three category nouns; no claim; no number; no time.

And every one of them renders inside `<Card className="… p-12 text-center">`
with a `bg-secondary` icon chip (`components/app/empty-state.tsx`) — i.e. the
identical bordered-card-with-an-icon-chip as the marketing site's feature grid.
The moment a rootmail user has no data, the product looks exactly like its own
landing page.

### 2.4 Lists say "here is your data"; they do not say "here is what to do"

`messages/page.tsx`:
- `PageHeader title="Messages"` — a category noun.
- Then nine round filter pills (all / delivered / sent / queued / sending /
  bounced / complained / failed / suppressed), all rendered identically. **A
  bounce and a delivery are the same visual object.** The one filter an operator
  urgently needs — "what went wrong" — is the sixth pill from the left and looks
  like the other eight.
- Then a table.

The page has a real opinion buried in a code comment (lines 90-94: *"a product
that opens by suggesting you fake it teaches you not to trust what you see
here"*) — genuinely good thinking, entirely invisible to the user.

`messages/[id]/page.tsx` is better and is the strongest page in the dashboard:
`PageHeader` → an optional sky-tinted "Test send" explainer → `<LiveStatus>` (a
tracker that advances on its own) → `<MessageCard>`, which deliberately layers
depth behind a chevron *"rather than spread across four boxes in a side rail"*.
That is a real design decision, correctly made.

### 2.5 `MessageFlow` — the spine exists, and it currently lies

`components/app/message-flow.tsx` is the component `00-PHILOSOPHY.md §3` builds
the whole system on. Two defects, both fatal to the honesty claim:

1. **The `Opened` node is filled solid `bg-emerald-500`, exactly like
   `Delivered`.** `landed = stage >= 3`, and every dot at `i <= stage` gets the
   same fill. A tracking-pixel inference and a provider confirmation are drawn
   identically. Under §3's rendering law, `Opened` and `Clicked` must be hollow.
2. **When the line matters most, it vanishes.** `if (BAD.has(message.status))
   return <MessageStatusBadge …>` — a bounce, a complaint, a failure or a
   suppression drops the five dots entirely and renders a badge instead. The
   severed state is not drawn; it is substituted with a chip that carries no
   position, no reason, and no indication of *where* the line stopped.

So the flow renders four of the five interesting cases wrongly. It is still the
right idea and the right data — this is a rendering fix, not a rethink.

### 2.6 Navigation and chrome

`components/app/nav.tsx` (366 lines) is the most considered file in the app and
its reasoning is sound: one sidebar grouped by *what things are for*, the
transactional/marketing split deliberately kept as a pricing dimension rather
than a navigation wall, live-only sections hidden in sandbox, Developers folded
away last. **Keep this.**

The one structural problem: the grouping is by **noun** (Email / Insights /
Workspace / Developers), and 13 of the 15 destinations are object types. There is
no destination anywhere in the nav for *"what happened and what did we do about
it"* — the thing §8 says the day-30 product is. Deliverability is the closest and
it is filed under "Insights", i.e. as a number to look at.

`components/app/topbar.tsx` carries five separate switchers in the right cluster
(QuickCreate, CommandTrigger, WorkspaceSwitcher, ClientSwitcher, ThemeToggle,
AccountSwitcher). At `h-16` with `bg-card/80 backdrop-blur`, that is six controls
competing at the same visual weight, above a page whose own content is 114
equal-weight cards.

`components/app/page-header.tsx` renders `text-2xl font-bold tracking-tight` —
the same 24px/700 on all 38 pages that use it, with no variant for a page that
matters more.

### 2.7 Onboarding

`app/onboarding/page.tsx` is a 45-line shell around `<OnboardingWizard>`, and
`OnboardingChecklist` (193 lines) computes eight steps from live data with a
`crucial` flag and per-step `minutes`. The mechanics are good — real completion
detection, honest blocking, `sub` hints under the blocking step, hides itself
when done.

The problem is the **ordering and the framing**. The eight steps are:

1. Verify your email · 2. Complete your business profile · 3. **Verify a sending
address** *(crucial)* · 4. Build your audience · 5. Turn on audience growth ·
6. Design an email · 7. Send your first email · 8. Set up your Replies inbox

"Send your first email" is **step 7 of 8**, behind a business profile, a postal
address, an audience import, a growth widget and a template design — roughly 21
minutes of configuration by the checklist's own estimates. §8 of the philosophy
says the job of hour one is to make the line real: *send one real email to
yourself and watch it move*. Right now the operator's first witnessed delivery is
the second-to-last thing they are asked to do, and everything they are asked to
do first is an act of faith.

---
## 3. Spot-checks on the token analysis (with one correction)

Confirmed:

- `--primary: 243 75% 59%` (light) / `243 75% 66%` (dark), `--radius: 0.65rem` in
  `apps/marketing/src/app/globals.css` — stock shadcn indigo, unchanged.
- **903** hardcoded Tailwind palette occurrences across `apps/*/src` +
  `packages/*/src` (the earlier count of 887 has drifted up, not down). Top
  offenders unchanged: `text-emerald-600` (92), `bg-amber-500` (74),
  `bg-emerald-500` (65), `text-amber-400` (61), `text-emerald-400` (51),
  `text-amber-600` (49).
- 43 `bg-{hue}-{50|100|200}` light tints in `apps/*/src` (the 120 figure counts
  every light-tint utility class, not just backgrounds — both are true at
  different scopes).

**Correction — the typeface finding is stale.** `next/font` now appears in two
files:

- `apps/dashboard/src/app/layout.tsx:2` — `Inter_Tight, IBM_Plex_Mono`, with a
  comment that reads like it was written against `00-PHILOSOPHY.md §5.2`: *"a
  product with no typeface cannot have a voice… Plex Mono is not here for code."*
- `apps/developers/src/app/layout.tsx`

`apps/marketing` and `apps/admin` still load nothing; the marketing site's
headings compute to `ui-sans-serif, system-ui, …` (§1.3).

This is exactly backwards. **The typographic identity has shipped to the two
surfaces you only see after you have already decided to trust us, and not to the
one surface that has to earn that decision.** A visitor sees system-stack Helvetica
on rootmail.io, signs up, and only then meets Inter Tight. Porting the two font
imports to `apps/marketing/src/app/layout.tsx` + `globals.css` is a
twenty-minute change and it is the single largest visual delta available.

---

## 4. Verdict

### 4.1 Ten highest-leverage fixes, ranked by visual impact ÷ effort

**1. Load the typeface on `apps/marketing` (and `apps/admin`).**
Copy the `Inter_Tight` + `IBM_Plex_Mono` imports from
`apps/dashboard/src/app/layout.tsx:2` into `apps/marketing/src/app/layout.tsx`
and wire `--font-sans` / `--font-mono` in `apps/marketing/src/app/globals.css:7`.
*Why first:* the work is already done and tested one directory over; nothing
changes more of the page's character per line of diff, and it removes the single
loudest "this is a template" signal.

**2. Break the ten-identical-sections rhythm on the homepage.**
`apps/marketing/src/app/page.tsx` + each `components/site/*.tsx`. Today: 10/12
sections at `py-20 md:py-28`, 9/11 headings at 30px/700/-0.75px, 8 centered, 8
with an eyebrow badge. Give three sections — hero, the wedge, the close — a
distinctly larger scale and a full-bleed treatment, and demote the rest to a
tighter measure. *Why:* this is the core failure mode and it is pure CSS.

**3. Kill the gradient h1 and the three aurora blurs.**
`hero.tsx:79` (`bg-gradient-to-r from-primary to-violet-500 bg-clip-text`),
`hero.tsx:52-64` (`blur-[130px]` / `blur-[100px]`), `cta.tsx:8-11`
(`bg-zinc-950` + `blur-[120px]`). *Why:* four lines of deletion each; removes the
most-copied gesture in the category and fixes an unmeasurable-contrast headline.

**4. Fix `MessageFlow`'s two rendering lies.**
`components/app/message-flow.tsx`. Draw `Opened`/`Clicked` hollow (stroke, no
fill); on a `BAD` status, keep the line and sever it at the stage it reached with
the reason beside it, instead of replacing the whole component with a badge.
*Why:* it is ~15 lines, it is the spine of the entire design system, and it is
currently the clearest counter-example to the product's own thesis, shipped in
every list row.

**5. Rewrite the eight absence-headline empty states.**
`templates/page.tsx:61`, `sequences/page.tsx:58`, `messages/page.tsx:100`,
`webhooks/webhook-console.tsx:81`, `api-keys/api-keys-manager.tsx:135`,
`sub-tenants/page.tsx:118`, `members/roles-section.tsx:63`,
`contacts/page.tsx:565`. `00-PHILOSOPHY.md §4` already contains the replacement
copy for three of them. *Why:* pure text; empty states are the first thing every
new operator sees on every page they open, and eight of twelve currently say
nothing.

**6. Retire the eyebrow `<Badge>` above every section heading.**
Eight instances across `layer.tsx`, `product-show.tsx`, `who-its-for.tsx`,
`layer-model.tsx`, `features.tsx`, `subtenancy.tsx`, `pricing.tsx`, `faq.tsx`.
They fail AA in dark (3.88–4.42:1, §1.5), they are the site's most template-ish
component, and in the hero the badge repeats the h1 verbatim. *Why:* deletion
fixes a repetition problem and an accessibility problem at once.

**7. Give `/pricing` an `<h1>` and its own argument.**
`apps/marketing/src/app/pricing/page.tsx` currently renders zero `h1` elements
because it is two homepage sections stacked. Open with the comparison the
philosophy names — the $90/month sub-account gate — rather than the same eyebrow
badge the reader just scrolled past nine times.

**8. Reorder the homepage per `00-PHILOSOPHY.md §7`, starting with `Promises`.**
Move `promises.tsx` from position 8 to position 5 and collapse the duplicated
layer explanation (`layer.tsx` at position 2 *and* `layer-model.tsx` at position
5 teach the same three-layer model twice). *Why:* the best writing on the site is
buried; the reorder is a re-ordering of imports in `page.tsx`.

**9. Replace the marketing site's 29 `bg-primary/10` icon chips and the
dashboard's 54.** Under §5.2 colour asserts state or it is ink. Most of these
sit on nouns (a feature title, a persona, a quick action). *Why:* find-and-replace
scale, and it is what makes a screen recognisably ours from six feet.

**10. Halve mobile section padding and fix the 40 sub-32px tap targets.**
`py-20 md:py-28` → `py-12 md:py-28` across `components/site/*`; raise the five
product-show carousel tabs (currently 28px tall) and the pricing contact chips
(26px) to 44px. *Why:* removes ~800px of empty scroll from a 22,347px mobile page
and fixes the only genuinely broken-feeling thing on a phone.

### 4.2 Three structural problems no restyling fixes

**A. The site sells a category; the product sells a position — and they are
different products.**
`features.tsx` says "Everything your email needs to just work". `promises.tsx`
says "A sandbox that flatters you is worse than no sandbox, because you only find
out on the day it matters." Those are two different companies. The first is a
consolidation pitch (one tool instead of Mailchimp + Postmark); the second is a
trust pitch (we keep an honest account). Every layout decision on the homepage
serves the first — twelve equal feature cards, four personas, a marquee of
fourteen email types, a "Who it's for" section — because breadth-as-value is what
a grid of equal cards *means*. You cannot restyle your way from breadth to
position; the sections themselves have to be different sections. `00-PHILOSOPHY.md
§7` is right about this and the fix is editorial, not visual.

**B. The dashboard is a reporting surface for a product that acts.**
The system throttles clients, pauses senders, re-checks DNS hourly with a
six-hour grace, sweeps reputation, and detects abnormal suppression growth. **None
of that appears on `app/(app)/page.tsx`.** The overview is seven rows of
read-outs — a grade, a funnel, two meters, four shortcuts, a table. There is no
route anywhere in `nav.tsx` for "what changed and what we did about it": the
closest is `/deliverability`, filed under "Insights", i.e. as a number to look at.
Restyling the cards produces prettier read-outs. The IA needs a destination that
does not exist, and the overview needs to become a reverse-chronological feed of
system actions with numbers and doors, per §8.

**C. Onboarding is ordered for the company's data model, not the operator's
confidence.**
`onboarding-checklist.tsx` puts "Send your first email" at step **7 of 8**,
behind a business profile, a postal address, a contacts import, a signup widget
and a template design — ~21 minutes of configuration before a single witnessed
delivery. Meanwhile the DNS cliff (documented as the place this product loses
people, `docs/BRIEF-2026-08-18b-next-tranche.md`) is step 3 and rendered as a
checkbox with two sub-bullets. No amount of card styling changes the fact that
the sequence asks for faith first and gives evidence last. This is the reordering
`00-PHILOSOPHY.md §8` describes, and it is a product decision.

### 4.3 What is actually good here and must survive

This is not a codebase without taste. It is a codebase whose taste is invisible
because it is expressed in comments and mechanics rather than in what you can
see. Specifically:

- **`components/app/message-flow.tsx`** — five stations, computed from real
  engagement timestamps rather than the stored status (which caps at
  "delivered"). The data model *is* the line. Fix the two rendering states; do
  not rebuild it.
- **`components/site/carousel.tsx`** — CSS transition on `transform` plus a
  `setInterval`, chosen explicitly because *"a CSS transition still ARRIVES at
  its end state when it can't be animated."* Pauses on hover, focus and touch;
  never autoplays under `prefers-reduced-motion`. This is the honest-motion
  policy correctly implemented, and `Reveal` should be rewritten to match it, not
  the other way round.
- **`components/site/promises.tsx`** — the best writing anywhere in the repo,
  with a source comment under every claim naming the route or file that makes it
  true. That commenting discipline is the visual system's §5.3 "sourcing line"
  already existing in the source; it just needs to reach the screen.
- **`components/site/product-show.tsx`** — the product drawn in the DOM rather
  than screenshotted, *"so they stay honest as the app changes"*, with sample
  data that is obviously sample data and no invented traction. This is exactly
  §6's "our illustrations are diagrams of our own mechanics."
- **`components/app/nav.tsx`** — grouped by what things are *for*; the
  transactional/marketing split deliberately kept as a pricing dimension rather
  than a navigation wall; live-only sections hidden in sandbox so the nav always
  reflects what can actually function.
- **`messages/[id]/message-card.tsx`** — depth layered behind one chevron
  *"rather than spread across four boxes in a side rail."* The single best
  anti-card decision in the app.
- **`components/app/onboarding-checklist.tsx`** — real completion computed from
  live data, a `crucial` flag, honest per-step minute estimates, hides itself
  when finished, fails quiet. The mechanics are right; only the order is wrong.
- **`pricing-calculators.tsx`** and the pricing copy's honesty about overage
  ("past your blocks it's just $0.4/1,000 — sending never stops").
- **`/beta`** — no cards, a real h1, and copy that already speaks in the
  philosophy's voice without having been asked to: *"that's our constraint, not
  the product's."* This page is the proof the voice exists; the rest of the site
  should be brought up to it.
- The `InlineReveal` / view-first pattern and the staged-journey `StageRail` /
  `StageScene` components, which solve a real problem (progressive disclosure
  without a modal) in a way the philosophy explicitly wants kept.

None of the above should be bulldozed. The redesign's job is to make the
judgement already present in this codebase's *comments* visible in its *pixels*.

---

## 5. Where the philosophy needs adjusting

Three notes back to `00-PHILOSOPHY.md`, from what the audit found:

1. **§4 says "we currently ship four" absence-headlines. It is eight.** The
   rewrite table covers three of them; five more need copy (`webhooks`,
   `api-keys`, `sub-tenants`, `members/roles`, `contacts` audiences).
2. **§5.2's type recommendation has already shipped, to the wrong two apps.**
   Inter Tight + IBM Plex Mono are live in `apps/dashboard` and
   `apps/developers`; `apps/marketing` and `apps/admin` are still on the system
   stack. The doc should record this as partially done and name marketing as the
   priority, since it is the surface that has to earn trust before anyone sees
   the other two.
3. **§5.2's colour law collides with a shipped product decision.** The two wings
   are colour-coded violet (Transactional) and amber (Marketing) in
   `app/(app)/page.tsx:262,308`, and `bg-amber-500` / `text-amber-400` account
   for 135 of the 903 hardcoded palette uses. Reserving amber for `--acted`
   means the wings lose their colour identity across the whole dashboard. That is
   probably the right call — a product wing is a noun, and §5.2 says nouns get
   ink — but the doc should say so explicitly, because it is a visible,
   contentious change to a surface people already navigate by colour, and someone
   will otherwise reintroduce it.
