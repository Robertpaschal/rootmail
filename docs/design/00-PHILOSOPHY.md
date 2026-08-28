# rootmail — design philosophy

**Status: constitution. Written 2026-08-26. Everything else in `docs/design/` is
downstream of this file. If a design decision contradicts this document, the
document wins or the document changes — not quietly, and not both.**

---

## 1. What rootmail believes about email

**Email is not a broadcast. It is a chain of custody.**

The moment you press send, the thing you made leaves your hands. It passes to a
provider, then to a mailbox operator you have no relationship with, then to a
filter whose rules are not published, then — maybe — to a person. Every step is a
handoff, and every handoff is a place where the truth can quietly stop matching
the dashboard.

Our buyer lives at the worst point on that chain. They are a vertical SaaS
platform sending on behalf of their own customers, and their words are on file:
*"The moment you send email on behalf of your users, you inherit their behavior.
One customer sends spam. One customer imports a dirty list. Suddenly the
reputation of the entire platform collapses."* They did not choose to become
email-infrastructure operators. They became one because something broke and
nobody could tell them what.

**The enemy is the black box** — and specifically, the black box's aesthetic.
Every email tool on the market looks the same: a big open-rate number, a green
line trending up, an aggregate percentage with no window and no method attached.
That look is not neutral. It is the visual language of a company whose business
depends on you not asking where the number came from. An open rate is a tracking
pixel firing; roughly a third of them are a mail client prefetching an image and
we cannot tell which. Presenting that as a fact, in the same weight and the same
color as "the provider confirmed delivery," is the industry's founding lie, and
every product that repeats it inherits the lie's visual grammar.

So: **rootmail's job is to keep an honest account of what happened to every
message and every sender, and to act on that account before a human has to.**

That belief makes some things obviously right — an append-only audit trail, a
signed proof bundle, a per-tenant reputation score, a sandbox that refuses to
flatter you, an automatic pause with the number that caused it printed on the
door. It makes other things obviously forbidden — an inferred number displayed
as an observed one, a capability described in the present tense before it ships,
a status that reads "delivered" because we stopped looking.

Honesty is not a compliance constraint on this design. **It is the design.** The
whole product is a claim about what is true; the visual system's only job is to
show which claims we can back and which we can't.

---

## 2. The one-sentence identity

> **rootmail sends your email and can account for every piece of it — including
> the email you send on someone else's behalf.**

Three sentences rootmail would never say:

1. *"Effortless email at scale."* — Effort is not the problem. Not knowing is.
2. *"We'll make sure your email reaches the inbox."* — Nobody can promise that.
   The people who say it are the reason our buyer stopped believing dashboards.
3. *"Oops! Something went wrong."* — We know what went wrong. Saying so is the
   entire product.

---

## 3. The spine: **the line**

Every email is a line from a sender to a person. rootmail's whole job is to keep
that line unbroken, to draw it truthfully, and to tell you exactly where it
broke.

The line already exists in the code — `MessageFlow` draws five dots for
queued → sent → delivered → opened → clicked, the inbox calls its status chips
"lifeline" chips, the reputation sweep is a line going bad over time, sub-tenancy
is one trunk branching into many lines. We did not invent a metaphor; we found
the one the data model already is, and we are going to draw it everywhere.

**The line has exactly four states, and they are a rendering law:**

| State | Drawing | Means |
|---|---|---|
| **Solid** | 2px, ink | We witnessed this. A provider confirmed it, or we did it ourselves. |
| **Hollow** | 2px ink stroke, no fill, node unfilled | We inferred this. Opens, and anything else derived from a pixel or a heuristic. |
| **Dotted** | 2px dashed, 40% ink | We do not know. Also: not built yet. Also: in flight. |
| **Severed** | line stops, node becomes a short vertical bar | It ended here, on purpose, and the reason is printed beside it. |

That table is the honesty policy in executable form. **We never draw a solid line
through something we did not observe.** Which means the marketing site and the
dashboard obey one rule instead of two, and the rule that stops us shipping the
false isolation claim is the same rule that stops us filling an open-rate node.

The dotted state is the important invention. It lets us draw things we have not
built without claiming them: the roadmap is the same line, continuing, dashed. A
product confident enough to draw its own edge looks more credible than one that
pretends it has none — and it makes "never claim it before the code lands" a
design affordance rather than a lawyer's veto.

### Where the line shows up

1. **Message row** (`/messages`) — the five-station line, inline, replacing the
   dot cluster. Delivered nodes filled; the opened node hollow; a bounce severs
   the line with the provider's reason to the right.
2. **Message detail** — the line runs full width at the top of the page and *is*
   the audit trail. There is no separate "Timeline" card; the events hang off the
   stations. (See signature move 4.)
3. **Replies / threads** — a conversation is two lines facing each other, one per
   participant, with each message a station. A sequence exiting on reply is drawn
   as the outbound line stopping where the inbound one starts.
4. **Client domains** (`/sub-tenants`) — one trunk, one branch per client. The
   trunk is shared and drawn shared, because it *is* — sub-tenants share an IP
   pool and a provider account, and the diagram must not imply otherwise. When
   the sweep throttles a client, that branch narrows to 1px amber; a paused
   client's branch is severed with the metric that severed it. **The picture is
   the disclosure**: you can see that the trunk is common, and you can see that
   we pinch one branch so the others keep flowing. That is the true claim, drawn.
5. **Deliverability** — the score over time as a line, with the two published SES
   thresholds as horizontal rules across it. You do not read a grade; you see how
   close the line is to a rule, and how fast it's moving.
6. **Onboarding** — the setup checklist is a line with your account at one end
   and your first real delivered message at the other. DNS verification is a
   dotted segment that goes solid the hour the record resolves.
7. **Marketing hero** — one line, wide, ink on paper, with the three product
   layers as stations: Send · Converse · Prove. No gradient, no glow, no blur.
8. **Errors and refusals** — a refusal card carries a severed line with the exact
   stop point ("stopped here — complaint rate 0.52%, threshold 0.5%").
9. **Our own outbound mail** — the transactional footer on mail rootmail sends
   from `rootmail-hq` carries a three-station line and a link to that message's
   public proof. We are the first customer of our own record.

---

## 4. Voice and tone

The product is a **witness**. It speaks in the past tense about facts, the
present tense about state, and the future tense only about things it will
actually do. It never apologizes for something that isn't its fault and never
blames the user for something the system chose. Numbers arrive with their window
and their method. Refusals arrive with a quantity and a door.

Rules that decide real sentences:

- **No headline is the absence of a thing.** "No templates yet" is a sentence
  with no information in it, and we currently ship four of them.
- **A number without a window is not a number.** Never "1,204 sent." Always
  "1,204 sent · last 30 days."
- **Name the actor.** "rootmail paused this client," not "this client was
  paused." If we did something automatically, say we did it.
- **Banned words:** just, simply, seamless, effortless, powerful, robust,
  enterprise-grade, blazing, magic, unlock, supercharge, "Oops". No exclamation
  marks. No emoji, anywhere, ever.

### Rewrite table

| Where | Now | New |
|---|---|---|
| `site/hero.tsx` h1 | "All your email in one place. **Every client's, kept apart.**" (second half in an indigo→violet gradient) | "Every email you send, and a record of what happened to it." *(sub: "Including the email you send for somebody else.")* |
| `site/hero.tsx` body | 5-sentence paragraph covering receipts, newsletters, replies, sub-tenancy, BYO provider, and "if you can write an email, you can run rootmail" | "Receipts, campaigns, and the replies that come back — one system, one contact list, one reputation. If you send for your own customers, each of them gets their own domain and their own score, and we throttle the one going wrong before it costs the others." |
| `site/features.tsx` h2 | "Everything your email needs to just work" | "What we can account for" |
| `site/who-its-for.tsx` h2 | "Made for people. Loved by developers." | "One system, two front doors" |
| `site/layer-model.tsx` sub | "Start with a single welcome email. Grow into conversations… without ever moving to another tool." | "Send it, answer what comes back, and prove what went out. Same data model at every step — nothing to migrate when you need the next part." |
| `site/subtenancy.tsx` step 5 | "We keep checking. If their settings ever disappear, you hear about it the same hour — not weeks later from a customer." | Keep the promise, add the number: "We re-check every client's DNS hourly. If a record disappears, you hear it from us within the hour, with a six-hour grace before anything is suspended." *(true as of `51c80ed` + the drift interlock — do not ship the sentence without the latency in it.)* |
| `site/cta.tsx` | "Send your first email in minutes" | "Send one real email and watch the whole line." |
| `sequences/page.tsx` empty | "No sequences yet" / "Create one to drip a welcome series, onboarding, or re-engagement flow." | "A sequence sends itself over days" / "Set the steps once; it greets every new subscriber on schedule and stops the moment they write back." |
| `templates/page.tsx` empty | "No templates yet" / "Create a reusable email once, then use it in sends, campaigns, and sequences." | "Design an email once, send it a million times" / "A template is the design plus the blanks. Sends, campaigns and sequences all fill in the same one." |
| `messages/page.tsx` empty | "Nothing sent yet" | "Nothing has left yet" / "The first message you send appears here within seconds, and keeps its full record for as long as your retention window." |
| `connection-error.tsx` | "This didn't load" / "Nothing you've set up is affected — this is only about loading the page." | "We couldn't reach your data" / "Your sending is unaffected — the worker runs separately from this page. If this repeats, tell us and we'll say why." |
| `(app)/page.tsx` empty score | "Send a few emails to earn a reputation score." | "Not enough sending to score yet — we need about 50 delivered messages before a score means anything." |
| `(app)/page.tsx` greeting sub | "Here's how {workspace} is doing this period." | "{n} messages left {workspace} in the last 30 days. {m} of them need you." |

Note the pattern: every rewrite replaces a *category label* with a *claim about
what the thing does*, and every rewrite that involves a number acquires a window
or a threshold. That is the whole voice.

---

## 5. Signature moves

Five devices. A screen with the logo cropped out should still be identifiable by
any two of them.

### 5.1 The line
Geometry: 2px stroke; station nodes 8px circles centered on the stroke; minimum
24px station spacing inline, 64px at page scale, 120px at hero scale. Nodes are
the *only* circles in the product — every other radius is 4px. States per §3. It
appears wherever a thing has stages, and nowhere else; a line is a promise that
the stages are real and ordered, so it is never decoration.

### 5.2 Ink and signal
**Kill indigo.** `243 75% 59%` with a violet gradient is the single most anonymous
mark in software; it is the default shadcn demo and half of Y Combinator. Also
kill the cold gray ground (`240 5% 96%`) — every dashboard on earth is cold gray.

Ground is **warm paper**, foreground is **ink**, and saturated color is *reserved
for state*. Not accent. Not brand. State.

```
--paper       40 20% 97%      --ink          222 24% 10%
--rule       222 12% 88%      --ink-muted    222  8% 42%
--witnessed  152 55% 34%   (confirmed by a provider, or done by us)
--acted       35 90% 45%   (we intervened: throttled, drifting, grace period)
--stopped      2 70% 45%   (severed: bounced, paused, refused)
```

Dark mode inverts the ground to `222 24% 7%` with `40 12% 92%` text and lifts
each signal ~12% in lightness. Nothing else changes.

**The law:** if a color appears on screen, it is asserting something about state.
No tinted icon chips (`bg-primary/10 text-primary` — we ship 30+ of them), no
colored section badges, no gradient text, no decorative glow. The payoff is that
a screen which is 95% ink-on-paper with three green nodes on it is instantly,
correctly readable from six feet away — and instantly ours, because nobody else
has the discipline to spend their color budget on information.

Type: UI and headlines in a tight grotesque (**Inter Tight**, 600 for headlines,
-0.02em tracking; ship-now choice because it loads from Google Fonts). Facts in
mono (**IBM Plex Mono**): every id, address, domain, timestamp, threshold and
count. Mono is not for code here — it is the typographic marker for "this is a
recorded value, not prose." Radius drops from `0.6rem` to `0.25rem`; tables and
rules get square corners. Records have corners.

### 5.3 The sourcing line
Under or beside every number, a small mono line naming the window and the method:

```
   4,182                     0.31%
   sent · 30d · api+worker   complaints · 30d · provider feedback · warn at 0.1%
```

Where the source is an inference, it says so: `opened · 30d · tracking pixel ·
undercounts blocked images`. This one device does more for credibility than any
amount of copy, it makes the product legible to the platform buyer who has been
burned by numbers before, and it is trivially implementable as one component.
**No naked number ships.**

### 5.4 Pull the thread *(the interaction)*
On any surface carrying a line, the line is scrubbable. Hover — or arrow-key from
station to station — and a mono readout follows the cursor along the stroke,
naming the event and its exact timestamp, with the segment behind the cursor
drawn at full weight and the segment ahead at 40%. On a message detail this
*replaces* the audit-trail table: the trail is the line, and reading it is
dragging along it.

Constraints, non-negotiable: the full event list is rendered underneath as plain
readable rows at all times. Scrubbing is enhancement over content that is already
there. Nothing is revealed by motion, nothing waits on an animation, keyboard
reaches every station, and `prefers-reduced-motion` turns the follow into an
instant jump. (The preview pane freezes rAF; content gated behind an animation is
content that sometimes does not exist.)

### 5.5 The honest gap
Anything we cannot back is drawn, not hidden. On the dashboard: a metric we can't
compute yet shows a dotted segment and the sentence naming what it needs
("needs ~50 delivered messages"). On the marketing site: capabilities not yet
shipped appear as a dashed continuation of the same line, labeled with what they
will be, never in the present tense. On a limit: the boundary is drawn *before*
you hit it, with the number.

This is the move that turns the `CLAUDE.md` brief's "never claim until the code
lands" from a restriction into a house style. Dedicated per-tenant IPs are drawn
dashed. Automatic DKIM rotation is drawn dashed. "One client's mistake never
touches another's" is not drawn at all, because the trunk in §3.4 already tells
the truth about it.

---

## 6. What we refuse

- **No gradient text, no aurora blurs, no glowing dark CTA slab.** The
  `bg-zinc-950` + `blur-[120px]` block in `site/cta.tsx` is the closing argument
  of a product with nothing to say; it goes.
- **No decorative color.** See 5.2. If it isn't state, it's ink.
- **No open rate as a headline number.** It is an inference and we will draw it
  as one. We will lose a comparison-table checkmark and gain the one buyer who
  noticed.
- **No twelve-card feature grid.** Twelve equal cards is what you build when you
  have not decided which three matter. The features section becomes a ruled
  table: six rows, name and one sentence, mono for the fact.
- **No logos, no counts, no testimonials, no "trusted by."** Closed beta. If we
  cannot name a customer with permission, the space stays empty, and empty is
  better than borrowed.
- **No motion that reveals content.** Motion is ambient life on already-readable
  content. Never the mechanism by which content becomes readable.
- **No skeleton loaders that imply data we don't have.** A pending state says
  what it's waiting for.
- **No modal to explain a feature.** If it needs a tour, the screen is wrong.
- **No illustration of a person at a laptop.** No spot illustration at all. Our
  illustrations are diagrams of our own mechanics, drawn from real data shapes.
- **No two front doors that are different products.** The no-code operator and
  the API caller see the same nouns, the same words, and the same line. One of
  them uses a mouse.
- **No em-dash-free consultant prose.** Take positions in the copy. A sentence
  that could appear on a competitor's site is a sentence to cut.

---

## 7. The narrative arc of the marketing site

**The current order is wrong in three specific ways.** `page.tsx` runs Hero →
Marquee → LayerModelSection → ProductShow → WhoItsFor → LayerModel → Features →
SubTenancy → Promises → Pricing → FAQ → CTA. That is: (a) the three-layer model
is explained twice, by two different components (`layer.tsx` and
`layer-model.tsx`) — the reader is taught the same thing at position 3 and again
at position 6; (b) the wedge, `SubTenancy`, arrives at position 8, after twelve
feature cards, when the platform buyer has already decided; (c) `Promises` — by
some distance the best writing on the site, and the only section with an opinion
in it — is buried at position 9, where it reads as trivia rather than as the
reason to trust us.

The new order, and the question each section answers:

1. **Hero — "what is this?"** One line, three stations, one claim, two buttons.
   Both readers must find themselves in two sentences.
2. **The break — "why does this exist?"** Name the enemy. The failure in the
   buyer's own words, and the shape of the moment mail silently stops arriving.
   Nobody leads with the pain and it is the strongest section we could write.
3. **The line, end to end — "how does it work?"** *One* section replacing
   Marquee + LayerModelSection + ProductShow + LayerModel. Send · Converse ·
   Prove as stations on the same line, with the real product shown at each.
4. **When you send for other people — "is this for me?"** SubTenancy, moved up
   five places. Trunk-and-branches diagram, the honest shared trunk, the
   throttle drawn.
5. **What we decided on your behalf — "can I trust you?"** Promises, moved up
   four places. This is the authored section; it is where the product has a
   spine, and it belongs before the feature list, not after.
6. **What it can account for — "what's in it?"** Features, cut from twelve cards
   to six ruled rows.
7. **Pricing — "what does it cost?"** Unchanged in substance; sub-tenancy is in
   the data model, not the price list, and that line belongs *here* as much as
   in section 4, because it is a pricing claim about Mailgun's $90 gate.
8. **FAQ — "what am I still worried about?"**
9. **Close — "what do I do now?"** No slab. One line, one sentence, one button:
   send one real email and watch the whole line.

`WhoItsFor` folds into 4 and 6 as a single ruled strip; it does not deserve a
full section, because a reader who needs to be told they are the audience is not
the audience.

---

## 8. The narrative arc of the dashboard

**First login.** The operator has an account and no evidence. The job of hour one
is not configuration — it is to make the line real. The default state is a single
task: *send one real email to yourself and watch it move.* Not a sandbox
simulation; the real path, the real provider, the real record, with the line
completing live in front of them. They should end hour one having personally
witnessed a delivered node go green, and knowing that this is what the product
will look like forever after. Everything else — domains, contacts, templates — is
dotted line until then.

**Day 3.** The DNS cliff is where this product currently loses people, and it is
where the philosophy earns its keep. The operator is waiting on records they
pasted into somebody else's control panel. The product's posture here is *we are
doing the waiting.* Hourly re-checks, visible; the dotted segment showing what is
outstanding and exactly what value we expect to see; a message the hour it
resolves. Nobody should ever click "verify" twice. By day 3 they should have sent
from their own domain and have their first honest score — and the score should
arrive with the sentence explaining why it is not yet meaningful.

**Day 30.** The dashboard stops being a place you go to look at numbers and
becomes a thing that speaks first. The default view is not a grid of metrics; it
is **what changed and what we did about it** — a short reverse-chronological list
of things the system noticed and acted on, each with the quantity that triggered
it and a door to the fix. Numbers live one click behind that.

What the product must be doing unprompted by then, all of which already exists in
some form and only needs to be surfaced as *the product speaking*:

- The reputation sweep found a client crossing warn, and named the client, the
  metric, and the threshold.
- A throttle or a pause happened while they slept, with the reason and the
  two-step resume.
- A DNS record disappeared and we said so within the hour, inside the grace
  window, before anything got suspended.
- A suppression list grew unusually fast, which is what a dirty import looks
  like from the outside.
- Sending approached a quota, with the date it will be hit at the current rate.

The measure of success at day 30: **the operator has never once been surprised by
an email problem they learned about from their own customer.** That is the whole
product, and it is the only sentence in this document that both audiences read
the same way.

---

## Appendix — how to use this file

Before shipping a surface, three questions:

1. **What did we witness?** Anything else is hollow, dotted, or absent.
2. **Where's the line?** If the thing has stages and you didn't draw them, say
   why.
3. **Would a competitor ship this exact screen?** If yes, it isn't finished.

---

## 9. Amendments

This document said it would change out loud rather than quietly. These are the
changes, all made 2026-08-27 after the reference teardown
(`01-REFERENCES.md`) and the surface audit (`02-AUDIT.md`) came back with
measurements. Each is already implemented in `packages/design/`.

**9.1 — Ink is warm.** §5.2 specified `--ink 222 24% 10%` against
`--paper 40 20% 97%`: a 182° hue opposition, which is exactly what makes a light
page read as a spreadsheet. Four of five references set warm ink on warm ground.
Now `--ink 30 18% 11%`, `--rule 36 12% 86%`, with `--ink-muted` and `--line-dim`
warmed to match. **Signals are unchanged** — the three state colours were never
the problem.

**9.2 — Headline weight is 510, not 600.** Verified in-browser that Inter Tight
renders 510 as a genuinely distinct weight from both 500 and 600. 600 reads as
*emphasis*; this product is a witness giving an account, and a witness does not
shout. Where a heading needs more presence, it gets size and tighter tracking,
not weight.

**9.3 — Display leading ≤ 1.0, and tracking is per-size.** Measured across every
reference, sub-1.0 display leading is the most reliable single tell separating an
authored page from a generic one — and the one reference that reads corporate is
the only one above it. A single global `-0.02em` is also wrong: tracking is a
function of the face *and* the size. Tokens: `--track-display/-heading/-body`,
plus `leading-display` and `leading-tight`.

**9.4 — Two motion tiers, with an empty middle.** Interaction feedback at 100ms
(`--ease-interaction`), narrative movement at 700ms (`--ease-narrative`), and
nothing between. The 0.3s middle is every framework's default and appears in none
of the references. **`duration-300` should not survive review.** Note that
Linear animates `stroke` over 700ms — which is literally this system's dotted
segment going solid.

**9.5 — Surfaces are rings and hairlines, not drop shadows.** The dominant
surface treatment across the references is a 1px ring or a 0.5px hairline; the
one product leaning on soft drop shadows is the one that reads corporate.
`shadow-ring`, `shadow-hairline`, and `shadow-knockout` — the last being how a
station node sits on the stroke with no seam. It must use the **ground token**,
never white, or it breaks on any inverted section.

**9.6 — Warmth is not whimsy, and the distinction is load-bearing.** The ban on
whimsy stands and is now argued rather than asserted: whimsy is the register in
which the black box speaks — *"Oops! Something went wrong"* is a whimsical
sentence — so banning it is the **same rule** as banning the un-sourced number.
Measured: the maximalist reference overshoots its targets with a spring
coefficient of 2.5, and a control that springs 2.5× past where it is going cannot
be believed on the screen where it says it suspended a customer's domain. But
warmth is a colour-temperature and typeface decision, not a motion decision — and
§9.1 makes this product warmer, not colder.

**9.7 — Open acknowledgement: amber is now spoken for.** Reserving amber for
`--acted` strips the Marketing wing of the colour identity it currently carries
across the dashboard. This is judged correct — state outranks navigation — but it
is written down here because it is exactly the kind of unstated consequence
somebody quietly reverts in six weeks. If the wings need to be told apart, they
get told apart by something other than the colour that means *we intervened*.

**9.8 — Standing correction to §5.1.** The audit found `MessageFlow` renders
`Opened` filled and solid, identical to `Delivered`, and deletes the line
entirely on a bounce in favour of a badge. Under §3 those are not styling bugs,
they are **two false claims currently shipping**. `Opened` is `inferred` and
renders hollow; a bounce is `stopped` and severs the line *in place*, keeping
everything witnessed before it visible. `messageStations()` in
`packages/design/src/line.tsx` encodes this so a caller cannot get it wrong.

---

## 10. The austerity correction (2026-08-28)

The system in §5 and §9 was coherent, and the owner's verdict on the built
result was: *"flat and boring and square. There is no depth or layer to it, and
there is no motion to it."* They were right, and the cause is worth stating
precisely, because it is the kind of error that recurs.

**We conflated epistemic honesty with visual austerity.** "Never claim what we
did not observe" is a rule about *what the product asserts*. It was applied as a
rule about *how the product looks* — no colour, no depth, no movement — and
three separately-defensible decisions compounded into a grey page:

| §  | Rule | What it produced |
|---|---|---|
| 5.2 | radius `0.25rem`, "records have corners" | square |
| 9.5 | "rings and hairlines, never drop shadows" | flat |
| 5.2 | "saturated colour is reserved for state" | colourless |
| 9.4 | two motion tiers, most motion stripped | static |

Those two things are separable, and the proof is that **nothing in the honesty
policy changed here.** An inferred station still renders hollow. Every number
still carries its window and its method. Unbuilt capability is still drawn
dashed. The product simply stopped apologising for existing.

**10.1 — Type is three roles, not two.** `--font-display` (Fraunces, with
`opsz`/`SOFT`/`WONK`) carries headlines **and figures**; `--font-sans`
(Schibsted Grotesk) carries UI; `--font-mono` (JetBrains Mono) shrinks back to
ids, timestamps and sourcing lines. The rule that "mono marks every recorded
value" is **withdrawn**: it put the most important numbers on every page into
the least legible face on the page. Measured against a reference that sets its
figures in the display face at 166px, and against a four-way legibility test —
the display face won at every size. Figures use `tabular-nums lining`.

**10.2 — Brass is a brand accent, and colour is no longer only state.** §5.2's
"if a colour appears on screen it is asserting something about state" is
**withdrawn**; it is what left the product grey. The replacement is narrower and
survives the same test: **brass is for what *you* can act on** — buttons, links,
focus. `--witnessed` / `--acted` / `--stopped` remain reserved for what happened
to a message and **never appear on a control**. A coloured thing is therefore
still unambiguous: brass means press it, the others mean the system is telling
you something.

**10.3 — Curves.** `--radius` is `1rem`, with a real scale from `sm` to `3xl` so
a dense table and a marketing hero can differ. `borderRadius.DEFAULT` is set
explicitly, because bare `rounded` is used widely and silently kept Tailwind's
stock `0.25rem` — the very corner this amendment removes.

**10.4 — Depth is a token.** `--elev-1/2/3`. On light they are real shadows; on
dark they lead with an inset top highlight and a wide, dim brass glow, because a
drop shadow is invisible on a dark ground. §9.5's ban on shadows is withdrawn;
its actual insight — that a 1px ring often beats a soft drop — survives as
`shadow-ring`.

**10.5 — What did NOT change, and may not.** Motion still never makes content
visible: the preview pane freezes `requestAnimationFrame` *and* `setTimeout`,
observed repeatedly. The rendering law stands. No fake proof. Every number keeps
its window and method — `<Metric>` still requires both by type.
