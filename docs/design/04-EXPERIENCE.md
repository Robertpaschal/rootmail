# 04 — Experience: the sites as a sequence of demonstrations

**Status: specification. Written 2026-08-27 against `main` @ `77c4fe2`.**
Downstream of `00-PHILOSOPHY.md` (constitution), `01-REFERENCES.md` (craft
research) and `02-AUDIT.md` (diagnosis). Where this document specifies a
behaviour, an engineer should be able to build it without asking a question.
Where it names a paragraph, that paragraph is dead.

Scope: `apps/marketing` (homepage + `/pricing` + `/check`) and `apps/developers`.
Not the dashboard — that is `00-PHILOSOPHY.md §8` and a separate job.

---

## 0. The diagnosis, and the correction to it

The owner's verdict on the redesign that shipped:

> *"There's a lot of text on the screen, and it doesn't feel engaging enough to
> read through all that text. A good product should feel intuitive and fun to
> look at. People need to feel engaged… in a way such that they will want to try
> the product."*

Measured live at 1280×800 on 2026-08-27, `document.querySelector('main')`:

| | homepage |
|---|---|
| Words in `<main>` | **3,006** (~12 minutes of reading) |
| Paragraphs/list-items over 25 words | **34** |
| Over 40 words | **20** |
| Interactive elements in `<main>` | **30** — 16 of them inside `#pricing` |
| `<img>` / `<canvas>` / `<video>` | **0 / 0 / 0** |
| Page height | 11,177px |

Per section (`words` / `interactives`):

```
hero          139 / 3      the break     282 / 0      the line   542 / 7
sub-tenancy   394 / 1      promises      349 / 0      features   371 / 0
pricing       791 / 16     faq            81 / 0      close       57 / 2
```

`Promises` and `Features` — 720 words between them, 12% of the page's height —
contain **zero** visuals and **zero** interactive elements. They are pure prose.
`The Break` likewise: 282 words, one static SVG, nothing to touch.

### The correction: interaction count is the wrong target

I measured a reference for comparison. **wisprflow.ai's homepage has 17
interactive elements — fewer than ours — and 1,834 words.** It does not feel like
an essay. What it has that we do not is **64 inline SVGs and a canvas**: things
on that page have *state*, and most of that state changes without the visitor
touching anything.

So the metric to move is not clicks. It is this:

> **An artifact is a bounded region of the page that has state, where the state
> changes because the visitor acted on it or because it is running.**

Counted that way the current homepage has **three artifacts**: the product tour
carousel, and the two pricing calculators. The hero line, the severed line, the
trunk-and-branches diagram and every one of the 34 paragraphs are static ink.
Three artifacts, one of which is a slideshow and two of which are about money.
**The product story has zero.**

Target: **nine artifacts, one per section, no two asking the same thing of the
visitor, and 900 words of caption around them.**

### The governing idea is already ours

`01-REFERENCES.md §C` found the one thing all five authored references have that
rootmail does not: *a single running artifact that is the page's main visual,
showing the product's own mechanism operating on realistic data.* It also found
that rootmail has the strongest available version of it — **the line completing
on a real message** — and named it as hero, onboarding screen and message
detail at once.

We built the component (`packages/design/src/line.tsx`, `messageStations()`
enforcing the rendering law) and then used it as **wallpaper**. It is drawn on
the homepage five times and it never moves, never responds, and never tells you
anything you could not have read in the paragraph beside it.

This document's whole argument in one sentence: **the line is a mechanism, so
make it run, and let the prose become the caption under it.**

---

## 1. The three laws this specification obeys

Restated here because every section below is checked against them.

**Law 1 — Motion may never be what makes content visible.**
The preview pane freezes `requestAnimationFrame`; a background tab suspends
animation; a chunk fails to load. Every artifact below is specified with an
explicit **resting state**: the DOM as server-rendered, before any script runs,
which must be complete and readable. Two mechanics are permitted, both already
proven in this codebase:

- **CSS transitions on a class toggle** (`carousel.tsx`) — a transition that
  cannot animate still *arrives* at its end state.
- **`setTimeout` / `setInterval` state machines** (`carousel.tsx` autoplay) —
  timers keep firing when frames don't.

Banned: `initial={{ opacity: 0 }}`, JS-driven opacity, rAF tweens, any
`width: 0 → n`, and `duration-300`. The two tiers are 100ms
(`duration-interaction`) and 700ms (`duration-narrative`) with nothing between.

**Law 2 — `prefers-reduced-motion` reaches the same information by a non-animated
route.** Not "the animation is skipped" — *the information arrives*. Each
artifact below names its reduced-motion route. In every case it is the same one:
the state machine jumps to its terminal state in a single step, and every
intermediate value it would have passed through is present as a static row.

**Law 3 — Never invent proof.** Closed beta. No testimonials, no logos, no user
counts, no traction. Demo data is plausible and self-evidently a demonstration:
made-up client domains, no real addresses, and every artifact carries a mono
line saying so. The rendering law holds *inside* the toys — an `opened` station
renders hollow in a demo exactly as it does in production, and a competitor
cannot copy the toy without admitting what they cannot observe.

---

## 2. The first five seconds

What a stranger sees at 1280×800 before reading a word, in the order their eye
takes it:

1. **A horizontal line, 504px wide, five nodes on it, and one of the nodes is
   visibly hollow.** This is the shape they will remember. It is the only
   circle-bearing object above the fold and there is nothing else competing.
2. **A small local motion that ends.** The line completes once — Queued at t=0,
   Sent +400ms, Delivered +1,100ms, Opened +2,400ms — then stops. It does not
   loop. A page that loops forever is a page performing at you; a page that
   completes once and stops is a page that just showed you something.
3. **Ten words of headline** at `clamp(2.25rem, 5.6vw, 4.25rem)`, leading 0.95,
   weight 510. Two lines, reading as one drawn object at the same optical
   density as the line beside it.
4. **A column of monospace timestamps.** `09:14:02 / 09:14:03 / 09:14:07 /
   09:41:55 / —`. Before parsing a sentence, the visitor knows this product
   writes things down. The final `—` is the second-strongest tell on the screen:
   something is deliberately blank.
5. **Nothing else.** Zero badges, zero gradient text, zero blur, zero icons,
   zero tinted chips, zero logos, zero numbers claiming scale.

Negative spec for the fold: no paragraph over 28 words; no more than three
interactive controls; no section eyebrow; no `<Badge>`.

The five-second test, stated so it can be failed: **hide the headline and the
buttons. A stranger should still be able to say "it tracks what happens to
emails, and it admits when it doesn't know."** If the artifact alone does not
carry that, the artifact is wrong, not the copy.

---

## 3. The word budget

**Homepage total: 900 words maximum**, down from 3,006. That is a 70% cut and it
is not a stretch target — it is the number at which the page can be *looked at*
rather than read.

Counting rule, so nobody argues later: **a word counts if it is visible in the
resting state at 1280×800 without a click.** That includes every mono "fact"
line — those are the cheapest high-value words on the page and they are not
exempt. FAQ answers sit behind `<details>` and are exempt from the 900, but are
capped separately at 90 words each.

| # | Section | Now | Budget | Δ |
|---|---|---:|---:|---:|
| 1 | Hero | 139 | **85** | −54 |
| 2 | The Break | 282 | **110** | −172 |
| 3 | The Line (Send · Converse · Prove) | 542 | **120** | −422 |
| 4 | Sub-tenancy | 394 | **120** | −274 |
| 5 | Promises | 349 | **130** | −219 |
| 6 | Features | 371 | **90** | −281 |
| 7 | Pricing | 791 | **150** | −641 |
| 8 | FAQ (questions only) | 81 | **40** | −41 |
| 9 | Close / the domain check | 57 | **55** | −2 |
| | **Total** | **3,006** | **900** | **−2,106** |

Sub-budgets that make the section numbers buildable:

- A section heading is **≤ 11 words**. No exceptions; the current longest is 11
  ("Email fails quietly. The number on the screen keeps going up.") and it is
  the best one on the page.
- A section lead is **≤ 22 words**, and only sections 2, 3, 5 and 7 get one.
- A row caption is **≤ 14 words**.
- A mono fact line is **≤ 10 words** and must contain a number, a window, a
  route, or a threshold. A mono line with none of those is prose in disguise —
  delete it.
- **No paragraph anywhere on the page exceeds 35 words.** Today twenty do.

**The exchange rate**: every 40-word paragraph that dies is replaced by an
artifact state plus a ≤14-word caption. The information does not leave the page.
It moves from being *asserted in prose* to being *demonstrated and labelled* —
which is the only difference between this spec and "write less".

---

## 4. The interaction rhythm

`02-AUDIT.md` diagnosed sameness of layout; we fixed it and are now at risk of
sameness of interaction. Nine sections that each say "hover me" is the wall of
cards with a cursor on it.

So the verbs are assigned, and no two adjacent sections share one:

| # | Section | Verb | What the visitor's hand does |
|---|---|---|---|
| 1 | Hero | **watch** | nothing — it runs once and stops |
| 2 | The Break | **drag** | pulls a threshold handle across a scale |
| 3 | The Line | **switch** | two segmented controls, six states |
| 4 | Sub-tenancy | **break** | deliberately damages a client and watches |
| 5 | Promises | **flip** | five before/after comparisons |
| 6 | Features | **point** | hover/focus links a question to a field |
| 7 | Pricing | **compute** | the existing calculators |
| 8 | FAQ | **disclose** | `<details>` |
| 9 | Close | **type** | enters their own domain |

The two verbs that demand the most — *drag* at position 2 and *type* at position
9 — sit at the two ends, so the page opens by asking for a small commitment and
closes by asking for a real one, with four low-cost verbs in between. Position 1
asks for nothing at all, deliberately: the first thing the page does is give.

---

## 5. Section by section — the homepage

Each entry gives: **the one thing**, **the artifact** (data, states, controls,
what happens on input), **words**, **what dies**, **resting state**,
**reduced motion**.

---

### 5.1 Hero — *the line, completing*

**The one thing.** rootmail keeps a record of what happened to every message,
and draws the difference between what it saw and what it guessed.

**The artifact — `<LiveLine>`.** Today's `hero.tsx` figure, made to run.

*Data.* One message, the sample already in the file: `msg_01J9Q7F2XKB4M0RVTC8H`,
to `ana@sunsetvillas.com`, from `bookings@sunsetvillas.com`, subject "Your
booking is confirmed".

*States.* A single integer `stage: 0..5`, driven by `setTimeout`, never by rAF:

```
stage 0  Queued      t+0      witnessed   09:14:02
stage 1  Sent        t+400ms  witnessed   09:14:03      segment travels while in flight
stage 2  Delivered   t+1100ms witnessed   09:14:07
stage 3  Opened      t+2400ms INFERRED    09:41:55      node stays hollow, forever
stage 4  settle      t+3400ms Clicked segment resolves to dashed, label "—"
stage 5  complete    terminal
```

*What the visitor can touch.*

- **Hover or arrow-key any station.** The matching ledger row below is marked
  (2px left rule in ink, 100ms), and the segment behind the cursor draws at full
  weight while the segment ahead drops to 40%. This is `00-PHILOSOPHY.md §5.4`
  "pull the thread", and it is bidirectional: hovering a ledger row marks the
  station.
- **Click the `Opened` node.** A popover, ~24 words: *"A pixel loaded at
  09:41:55. Roughly a third of these are a mail client prefetching an image, so
  we draw it hollow. Always."* This single interaction is the product's entire
  differentiating claim, and it costs one click.
- **"Run it again"** — a text button under the ledger, `min-h-11`, replays from
  stage 0. Not a loop. Loops are ambient; this one completed and is offering.

*The ledger.* Five mono rows under the line, always present, always complete:

```
09:14:02  queued      accepted by the API
09:14:03  sent        handed to the provider
09:14:07  delivered   provider confirmed          ← --witnessed
09:41:55  opened      tracking pixel · undercounts blocked images
      —   clicked     no event · we do not know
```

**Words: 85.** h1 (10) + sub-line (8) + lead, cut to 26 + two button labels (7) +
free-tier line (13) + ledger (21).

**What dies.**
- The 47-word lead paragraph. New text, 26 words: *"Receipts, campaigns and the
  replies that come back — one system, one contact list, one reputation. Send
  for your own customers and each gets their own score."*
- The three-line prose sourcing block under the figure (`hero.tsx:130-142`). It
  duplicated the line's own labels; the ledger rows carry it now.
- `<LineLegend />` moves out of the hero and appears **once**, in the page
  footer, where a rendering law belongs. Four legend entries above the fold is
  four words of chrome competing with the artifact.

**Resting state.** `stage = 5`, server-rendered: all five stations at their final
drawing, all five ledger rows present, "Run it again" visible. With JavaScript
disabled the hero is exactly today's hero, which already reads correctly. The
run is a replay of something the visitor can already see.

**Reduced motion.** No auto-run on mount. "Run it again" becomes "Step through
it", advancing one stage per click with the stage index announced
`aria-live="polite"`. The travelling dash on the in-flight segment
(`animate-line-travel`) is already `motion-reduce:animate-none`.

**Handoff to §2.** The last thing the artifact does is settle the `Clicked`
segment to dashed and print *"we do not know"*. The next section opens by asking
what a number you cannot see is worth.

---

### 5.2 The Break — *the threshold scrubber*

**The one thing.** The numbers that end an email programme are small, published,
and you will cross them without anyone telling you.

**The artifact — `<ThresholdScrub>`.** A horizontal scale, 0.00% → 0.60%
complaint rate, with a draggable handle. This is the section's whole content.

*Data — real, from `packages/core/src/reputation.ts`:*

```
0.10%   rootmail warns you
0.30%   rootmail throttles that client to 60 sends/hour
0.50%   rootmail pauses that client
~0.50%  the provider suspends the ACCOUNT — everybody's mail
```

Four rules across the scale, each labelled with its number in mono. The
provider's rule is drawn in `--stopped`; ours in `--acted` and `--stopped`. The
visual argument is spatial and needs no sentence: **our three rules all sit to
the left of theirs.** That is the product, drawn.

*What happens on drag.* Three things update at 100ms, together:

1. **A branch** beside the scale — one client's line — changes drawing:
   2px `--witnessed` below 0.10; 2px `--acted` at 0.10–0.30; **1px** `--acted`
   at 0.30–0.50 (a throttled branch is literally thinner); severed with a bar
   at ≥0.50.
2. **A mono readout** states what rootmail did, with the actor named and a
   timestamp: `rootmail throttled harbourclinic.com to 60/hour · 04:12`.
3. **A second, dimmed readout** headed `the common default:` — at every position
   it says the same thing: `nothing. The open rate keeps going up.` It is not a
   competitor claim and names nobody; it is a statement about a category that
   does not measure per-sender. It goes dim-to-`--stopped` only at 0.50, where
   it reads `account suspended. You find out from your customer.`

*Controls.* Pointer drag, click-to-position, and arrow keys in 0.01 steps
(shift = 0.05). `role="slider"` with `aria-valuetext` reading the full sentence,
not the number.

**Words: 110.** h2 (11) + the surviving position paragraph, cut to 33 + scale
labels and rule captions (28) + the two readouts (24) + the window note (14):
*"7-day trailing window, never on fewer than 20 sends the provider ruled on."*

**What dies.**
- ¶1, "A domain stops authenticating and nothing announces it…" (58 words).
- ¶2, "It is worse if you send for other people…" (61 words).
  Both are describing, in prose, what the visitor's own hand is about to do.
- The static four-row `<dl>` of thresholds — it becomes the scale.
- The severed-message figure moves out of this section (the hero's replay and
  §5.4's break already carry a severed line; three on one page is wallpaper
  again).

**Resting state.** Handle at **0.31%** — inside the throttle band, so the
interesting state is what a visitor sees without acting. All four rules are
labelled with their numbers. Both readouts are populated. With no JS this
renders as a ruled table of four rows: *number · what rootmail does · what
happens otherwise* — the same four facts, no handle.

**Reduced motion.** The branch's weight change is a `stroke-width` swap with no
transition; the readouts swap text instantly. Nothing here animates over time
even at full motion — the scrubber responds, it does not play.

**Composition.** Keep `.ground-ink`. This is the one inverted band on the page
and inverting a *section* rather than offering a theme is the compositional
device measured on two of five references.

**Handoff to §3.** The scrubber ends on a severed branch. §3 opens on the same
message id, unbroken, and asks what else that record is good for.

---

### 5.3 The Line — *one message, three windows, two doors*

**The one thing.** It is one data model: the thing you sent, the conversation it
became, and the proof it leaves are the same record seen from three sides.

**The artifact — `<OneMessage>`.** Two segmented controls over one panel. This
replaces the five-tab `ProductTour` carousel.

*Axis A — the layer (three tabs):* **Send · Converse · Prove**

*Axis B — the door (two tabs):* **Point and click · Code**

Six states. **The message id is identical in all six and is pinned in the panel
header in mono.** That identity is the argument; nothing else in the section has
to make it.

| Layer | Point and click | Code |
|---|---|---|
| **Send** | The composer as it exists: subject, the template blocks, the recipient chip, and the five-station line under it | `mail.send({ to, template:"booking-confirmed", idempotencyKey })` → `201 { "id": "msg_01J9Q7…", "status": "queued" }` |
| **Converse** | The thread: our message, then the guest's reply at 11:47, threaded by contact + subject. Below it, the sequence's step 3 line **severed** — `stopped: contact replied 11:47` | `mail.threads.get(t)` → two entries, and the sequence event `sequence_exited_on_reply` |
| **Prove** | The proof bundle: recipient, subject, content hash, signature, and a **Verify** button that prints `signature valid (Ed25519) · content hash matches` | `mail.proof.get("msg_01J9Q7…")` → the bundle, and the one-line verify command |

*Why this is the section and not a tour.* Five tabs of five different screens is
a gallery — it says "we have a lot of screens." Three views of **one message**
says "there is one record and it follows you," which is the only structural
claim rootmail has that competitors do not. And the second axis is
`00-PHILOSOPHY.md §6`'s "two front doors" **drawn** — the same action, in a
mouse and in a call — rather than asserted in the 75-word paragraph that
currently ends `features.tsx`.

*Interaction detail.* Switching an axis does not move the panel: the panel's
height is locked to the tallest of the six states (measured once, set as a CSS
custom property at build time) so nothing below the fold jumps. The transition
is a 100ms crossfade of the panel body only — and because it is a class toggle,
a frozen frame lands on the destination state, not between two.

**Words: 120.** h2 (9) + lead (18) + three layer captions at ≤14 (38) + two door
captions (16) + the six panels' own mono labels (39). The panel *content* — a
subject line, a reply, a hash — is data, not prose, and is exempt in the same
way an id is.

**What dies.**
- The three stage bodies in `the-line.tsx` (135 words) → three ≤14-word captions.
- All five `ProductTour` scenes and their surrounding copy (~250 words), plus
  `carousel.tsx`'s use here. *Keep `carousel.tsx` itself* — the mechanic is
  right and §7's add-ons may still want it — but it is no longer on the
  homepage.
- `features.tsx`'s "One system, two front doors" paragraph (75 words), now the
  Door axis.

**Resting state.** `Send` × `Point and click`, fully rendered. The other five
panels are in the DOM and `inert`, so a no-JS visitor sees a complete first
panel and the tabs render as in-page anchors to the same content stacked.

**Reduced motion.** Panels swap with no transition. Because all six are already
in the DOM, reduced motion is the *complete* experience, not a degraded one.

**Handoff to §4.** `Prove` ends on a verified bundle for one message. §4 opens by
asking the question a platform asks next: whose message was it?

---

### 5.4 Sub-tenancy — *break a branch on purpose*

**The one thing.** Sub-tenants share one trunk; rootmail pinches the branch going
wrong so the others keep flowing — and the trunk carries some of the damage
before it does.

**The artifact — `<TrunkAndBranches>`, made operable.** Today's diagram plus one
control per branch: **"simulate a dirty list"**.

*Data.* The three sample client domains already in `subtenancy.tsx`
(`sunsetvillas.com` ok, `harbourclinic.com` throttled, `northlakegym.com`
paused), each with real-shaped 7-day figures.

*What happens on click.* A five-step `setInterval` at 700ms — a compressed
7-day window, labelled as compressed — on `sunsetvillas.com`, the healthy one:

```
step 0   bounces 0.4%   sending          2px --witnessed
step 1   bounces 3.1%   sending          2px --witnessed
step 2   bounces 6.0%   warned 03:58     2px --acted
step 3   bounces 8.4%   throttled 60/hr  1px --acted        ← the branch narrows
step 4   bounces 11.2%  paused 04:12     severed, bar
```

Three things must be true on screen throughout, and they are the section:

1. **The other two branches' throughput readouts do not change.** They are
   rendered as live mono counts and they keep counting. That is the claim.
2. **The trunk stays 2px and never changes colour.** It is shared and it
   survived.
3. **At step 4 a line appears on the trunk itself**, in `--ink-muted`:
   `the trunk carried 1,180 of this client's bounces before we stopped it.`

Point 3 is the whole design. It is the disclosure `00-PHILOSOPHY.md §5.5`
demands, delivered as a **consequence of the visitor's own action** rather than
as a hedging paragraph. No competitor will build a toy that shows you the damage
their own architecture lets through. That is exactly why we should.

*Reset.* "Put it back" restores step 0 and clears the trunk line.

**Words: 120.** h2 (11) + lead cut to 26 + the five step statuses and figures
(30) + the trunk line (13) + the four-item BYO-provider mono list (24) + its
16-word caption.

**What dies.**
- The 70-word "We draw the trunk because the trunk is real…" paragraph. The
  trunk readout says it, and says it about something you just did.
- The five-step "Setting one up" `<ol>` (61 words) → one link, *"The five DNS
  steps are in the docs"*. A five-step setup list on a marketing page is
  documentation that leaked.
- The 50-word "What stays exactly as it is" paragraph. The four mono lines
  (provider, IPs, domains, deliverability contacts) survive with a 16-word
  caption: *"Connect your own SES or Mailgun and the mail keeps leaving on your
  account. Disconnecting puts everything back."*

**Resting state.** Exactly today's diagram: three branches, one ok, one
throttled, one severed, every number present, the "simulate" buttons idle and
labelled. A visitor who never clicks sees the complete argument. Everything the
simulation shows is a state one of the three branches is already in.

**Reduced motion.** One click jumps straight to step 4, and the five steps
render as five static rows beneath the diagram with their figures — the same
information, as a table.

**Honesty guard.** The button says **"simulate a dirty list"** and the panel
carries `illustrative · sample client domains · compressed from a 7-day window`.
Nothing here may imply a real customer or a real incident.

**Handoff to §5.** The visitor has just watched the product make a decision on
its own. §5 is the list of the other decisions it already made for them.

---

### 5.5 Promises — *the default someone chose badly*

**The one thing.** Five defaults in this product were chosen against the
industry's, on purpose, and each one is checkable.

**The artifact — `<DefaultDiff>`.** Five rows. Each row carries a two-position
switch: **`the common default` / `here`**. Flipping it changes the **drawing**,
not the prose. Each drawing is a 2–3 station line at `inline` scale — the same
primitive as everywhere else, which is what makes five small toys read as one
system rather than five widgets.

| Row | `the common default` | `here` |
|---|---|---|
| Your provider | one line, severed at `migrate` | your provider's line continues, solid, with rootmail as a station on it |
| Unsubscribe scope | one list: `newsletter` **and** `password reset` both severed | `newsletter` severed, `password reset` running through solid |
| The sandbox | `Delivered` node solid, labelled `simulated` in `--stopped` | the real provider path, real stations, `test send · excluded from scoring` |
| A data request | `export` dotted, `erase` dotted — unknown | both solid, and the opt-out node survives past `erase` |
| Proof | a screenshot icon, dotted | signed bundle, solid, content hash beside it |

Row 3 is the sharpest. It draws a competitor's sandbox reporting a solid
`Delivered` for a message that never left, which is precisely
`00-PHILOSOPHY.md §1`'s founding lie, rendered under the rendering law. Row 2 is
the one people have been burned by.

*Interaction.* Each switch is an independent `role="switch"`, keyboard
reachable, 100ms. There is also one master control at the top of the section —
**"show me all five"** — which flips all five to `the common default`
simultaneously. That one press turns the whole section red-and-dotted for a
beat, and it is the single most screenshot-prone frame on the page after the
signature toy.

**Words: 130.** h2 (7) + lead cut to 20 + five titles (avg 7 = 35) + five ≤14
captions (avg 9 = 45) + the five `where` mono lines, kept **verbatim** (23).

**What dies.** All five 45-word bodies — **225 words**. They are replaced by a
drawing and a nine-word caption each. The `where` lines
(`enforced in the send pipeline · scoped by message type`) survive untouched:
they are the best writing in the file and they are the sourcing line
(`§5.3`) already working.

**Resting state.** All five switches at **`here`**, drawn complete, captions
present. `the common default` is entirely opt-in. Nothing on the page
disparages anybody by default.

**Reduced motion.** Switches change state with no transition. Nothing moves at
any setting; the drawing simply differs.

**Honesty guard.** `the common default` names nobody and must be a structural
claim, not a strawman: it describes what a *single, unscoped suppression list*
does, what a *simulated* sandbox reports, what a screenshot proves. If a row
cannot be stated as a structural fact about the mechanism, the row does not
ship.

**Handoff to §6.** Five decisions, five drawings. §6 asks what all of it adds up
to in one object.

---

### 5.6 Features — *one record, six questions*

**The one thing.** Six questions rootmail can answer three weeks later, and they
are all answered out of one record.

**The artifact — `<SpecimenRecord>`.** A two-column layout that is the inverse of
a feature grid.

*Right column:* **one message record**, rendered whole — the object, not a
picture of it. Id, from, to, subject, the five stations with timestamps, the
sender's 7-day score, the domain's DNS state, the thread it joined, the proof
hash. About 20 fields, ruled, mono where mono belongs.

*Left column:* six questions, one per row:

```
Every message                   what happened to it, and where it stopped
Every sender                    how a client's numbers are moving
Every opt-out                   who we will not mail, and why
Every domain                    whether the records still resolve
Every reply                     what came back, and what it stopped
Every claim we make             what a third party can check
```

*What happens on hover or focus of a row.* The matching field(s) of the record
get a 2px left rule in ink and their label goes to full ink; everything else in
the record drops to `--ink-muted`. A mono line appears under the row naming the
**actual source**: `messages.delivered_at`, `tenant_scores.complaint_rate_7d`,
`suppressions.scope`, `domains.last_checked_at`, `threads.entries`,
`proof.content_sha256`. Clicking pins the highlight so it survives the mouse
leaving.

That mono line is the section. A feature grid says "we do deliverability"; this
says "the answer lives in this column of this row, and here is the row."

**Words: 90.** h2 (4) + lead (20) + six titles (13) + six ≤10-word captions
(46). The record's own field values are data.

**What dies.** All six 40-word bodies — **240 words** — and the six `fact` lines,
which are replaced by the column names (a column name is a stronger fact than a
paraphrase of one). The "two front doors" paragraph already died in §5.3.

**Resting state.** The record fully rendered at full ink with nothing
highlighted, and all six rows readable. Hover is pure addition — the record
never starts dimmed, because a dimmed record is content made visible by
interaction, which is Law 1 with a mouse instead of a frame.

**Reduced motion.** The highlight is a border-weight and colour change with no
transition and no movement. This artifact is already fully reduced-motion
compatible.

**Handoff to §7.** The record is the thing being priced. §7 opens with what it
costs to keep one.

---

### 5.7 Pricing — *keep the calculators, cut everything around them*

**The one thing.** You can compute your own bill on this page, and nothing about
it changes at the edges.

**The artifact.** `pricing-calculators.tsx` — `BlocksCalculator` and
`ContactPricer` — **unchanged in mechanism**. They are 16 of the page's 30
interactive elements, they run the same block and per-contact maths the product
bills on, and they read the live catalog. They are the only thing on the current
homepage that already does what this whole document asks for. Do not touch the
maths, the brackets table, or the "← you" marker.

**Two additions, both small:**

1. **The bracket table gains a station line.** The five volume brackets are
   already an ordered progression with a "you are here" marker; draw them as
   five stations, with the ones you have passed `witnessed` and the ones ahead
   `unknown`/dashed. Same primitive, seventh appearance, and it costs one
   component swap. The price is the caption under it.
2. **The overage sentence gets the strongest position in the section**, not the
   smallest type. *"Past your blocks it's $0.4/1,000. Sending never stops."* —
   16 words, `display-s`, directly under the computed price. This is the only
   sentence in the section a considering buyer is actually worried about and it
   is currently 12px muted text at 4.49:1 contrast.

**On the competitive number.** `pricing-argument.tsx` already carries the claim
`00-PHILOSOPHY.md §7.7` names: *"Mailgun gates subaccounts behind its Scale plan
at $90 a month minimum."* It ships **undated and unsourced**, which is the one
thing this design system may never do. Either it gets a sourcing line —
`$90/mo · Mailgun Scale, lowest plan including subaccounts · list price, checked
2026-08-27` — with a documented quarterly re-check, or it does not ship. A page
whose entire argument is "numbers arrive with their window" cannot make its
sharpest competitive claim naked. **Owner's call; my recommendation is keep it
and date it.**

**Words: 150** (from 791).
- Each calculator: heading (2) + one 14-word caption + the computed strings.
- The four feature bullets under each calculator (8 lines, ~90 words) collapse
  to four mono lines of ≤6 words each.
- The 20 add-on cards **stay a grid** — they pass `01-REFERENCES.md §A.9`'s
  catalogue test: a reader can buy one row. But each description drops to **6
  words**. Twenty × 6 = 120 words currently spent on ~25 words each.
- "Every account includes" survives as a mono list.

**What dies.** The two 30-word intro paragraphs above the calculators; the
"One bill. Never billed twice." explainer paragraph (34 words); every add-on
description over 6 words.

**Resting state / reduced motion.** Already correct — the calculators are
`useState` + arithmetic with no animation at all. The station line for brackets
must be static, matching.

---

### 5.8 FAQ — *keep it, cap it, cut two*

**The one thing.** The objections have answers and we are not hiding them behind
a form.

**The artifact.** `<details>` — correct control, keep it. The 56px summary rows
and the `group-open:rotate-45` plus icon are right.

**Words: 40 visible** (eight questions). Answers behind disclosure, capped at
**90 words each**; four currently exceed that and get cut.

**What dies.** Two questions, because §5.3's Door axis now answers both by
demonstration:
- *"Is rootmail for non-technical people?"* (79-word answer)
- *"My team has developers — can they plug into this?"* (43-word answer)

Ten becomes eight.

**One content note.** "How is this different from Resend or Mailchimp?" is the
best answer in the file and its last clause — *"an open is a tracking pixel
firing, and we render it as an inference rather than at the same weight as a
delivery the provider confirmed"* — should be **promoted out of the FAQ into the
hero's `Opened` popover** (§5.1). An argument that good does not belong at
position 8 behind a chevron.

---

### 5.9 Close — *check your own domain*

This section is the signature toy. It gets its own chapter below.

**Words: 55.** h2 (9) + one 22-word lead + the input's label and helper (12) +
the button and the account link (12).

**What dies.** The 34-word "Make an account, send one message to yourself…"
paragraph. The four-station `<Line>` above the heading — the ninth line on the
page and the only one carrying no data — goes; the checker draws real lines.

---

## 6. The signature toy — **`/check`**

> **Type your domain. We look up what public DNS actually says about your email,
> draw it under the same rendering law we use in production, and tell you the
> time we looked. We do not send anything.**

### 6.1 Why this one, and not the other candidates

Three were on the table. The threshold scrubber (§5.2) and the trunk simulator
(§5.4) are both good and both become *section artifacts*. The domain checker is
the signature toy for four reasons the others cannot match:

1. **It is the only artifact on either site whose data is not ours.** Every
   other demo runs on data we chose. This one runs on whatever the visitor's DNS
   actually says, and we cannot curate it. That is the most credible thing a
   product built on "we tell you what is really there" can possibly do.
2. **It is shareable because the screenshot is about them.** Nobody screenshots
   your product tour. People screenshot a picture of their own domain with a
   dotted segment in it and send it to whoever owns the DNS.
3. **It demonstrates the rendering law on uncurated input.** When somebody's
   domain comes back half dotted, that is not a bug in the demo — it is the
   demo. The honest gap (`§5.5`) drawn on a stranger's data is a stronger proof
   of the whole philosophy than any curated line.
4. **It is the top of the funnel for the cliff we lose people at.** The DNS
   cliff is documented in `docs/BRIEF-2026-08-18b-next-tranche.md` as where this
   product loses onboarding. Meeting a visitor at that cliff *before* signup,
   with real information and nothing asked in return, is the product's posture
   ("we do the waiting") applied to a stranger.

### 6.2 The engine already exists

`packages/core/src/dns.ts` ships `auditEmailAuth()` and `dmarcPolicy()` today:

```ts
EmailAuthReport {
  domain, mode: "mock" | "live", dmarc_policy: "none"|"quarantine"|"reject"|null,
  items: EmailAuthItem[],       // mechanism: spf|dkim|dmarc|bimi
                                // status:    pass|weak|missing|blocked
  summary: { passing, total, enforced }
}
```

The four statuses map onto the four line states, and **one of the four mappings
is the whole reason to build this**:

| `EmailAuthStatus` | Line state | Drawing | Why |
|---|---|---|---|
| `pass` | **witnessed** | solid node, solid segment | we looked it up and it resolved |
| `weak` | **witnessed node, dashed continuation** | node solid, the segment *leaving* it dashed | see below |
| `missing` | **unknown** | dotted, dim | we looked and found nothing |
| `blocked` | **stopped** | severed, bar, reason printed | the lookup itself failed or is refused |

**The `weak` mapping is the argument.** A DMARC record of `p=none` is *published*
— we witnessed it — and it is *doing nothing*. Every other tool in this category
renders that as a green tick because a record exists. We draw the node solid
(the record is real) and the segment leaving it dashed (the protection is not).
One drawing, no sentence, and it is a distinction the visitor has probably never
had drawn for them before. Caption, 15 words: *"The record is published. Its
policy is `p=none`, so it asks receivers to do nothing."*

### 6.3 What is on screen

```
┌──────────────────────────────────────────────────────────────────┐
│  yourcompany.com                                    [ Check it ] │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  SPF ●────── DKIM ●╌╌╌╌╌╌ DMARC ●╌╌╌╌╌╌╌ enforced ○              │
│                                                                  │
│  SPF        pass      v=spf1 include:amazonses.com ~all          │
│  DKIM       missing   no selector resolves at rootmail._domainkey│
│  DMARC      weak      v=DMARC1; p=none; rua=mailto:…             │
│  BIMI       missing   requires DMARC at quarantine or reject     │
│                                                                  │
│  looked up 4 records · public DNS · 2026-08-27 14:02:11 UTC      │
│  we did not send anything, and we did not store your domain      │
└──────────────────────────────────────────────────────────────────┘
```

- **The line across the top** is the four mechanisms as four stations plus a
  terminal `enforced` station. It is the same `<Line scale="page">` component.
- **The four rows beneath it are the resting content** and they carry every fact
  the line carries. The line is enhancement; the rows are the answer.
- **The raw record value is shown in mono, verbatim.** Not "SPF configured" — the
  actual string we read. Showing the receipt is the product.
- **The sourcing line** names the method, the count and the exact UTC time. This
  is `§5.3` doing its job on the highest-stakes surface we have.
- **The second sourcing line is a refusal, and it matters.** A stranger typing
  their domain into an email company's input box wants to know we did not just
  mail them or add them to something. Say so, on screen, before they ask.

**For the platform buyer**, one optional second field, revealed by a text link
("sending for your own customers?"): *and one of your customers' domains*. Enter
both and the result draws a trunk with two branches — your platform domain and
theirs — which is §5.4's diagram on the visitor's own data. This is how the toy
stays first-class for both audiences instead of picking one.

**When a record is missing**, the row carries the exact record to publish, with
a copy button. Not a signup prompt. The visitor came for an answer; give them
the answer and let the product be the reason they come back.

### 6.4 Constraints, stated so this can be built safely

- **Endpoint:** `GET /v1/public/domain-check?domain=…` on the API,
  unauthenticated, `DNS_VERIFY_MODE=live`, wrapping `auditEmailAuth()`.
- **Rate limit:** 10/hour/IP, 200/hour global. `@fastify/rate-limit` is already
  registered.
- **Input validation:** hostname only, via the existing Zod `parse()` helper.
  Reject anything with a scheme, a path, a port, or an `@`. **Never accept an
  email address** — if one is pasted, take the part after the `@` and say so.
- **SSRF:** `packages/core/src/ssrf.ts` exists; DNS resolution is outbound to a
  resolver only, no HTTP fetch of any kind, no redirect following.
- **Do not persist the domain** against a session, a cookie, or an analytics
  event. The page says we don't; that has to be true. Aggregate counts only.
- **No permalink containing the domain.** `/check` is the shareable URL; the
  result is not addressable. A permalink would make us a public directory of
  other people's DNS posture, which is a different and worse product.
- **Failure state:** if the lookup times out (3s), every station renders
  `unknown`/dotted and the sourcing line reads `lookup timed out at 3s · we do
  not know`. It must never render `pass` on a failed lookup, and it must never
  render `missing` on a *failed* lookup either — "we did not find it" and "we
  could not look" are different claims and this product of all products has to
  distinguish them.

**Resting state.** `/check` server-renders with the input empty, the four
mechanism rows present as **empty ruled rows with their names and one-line
definitions**, and the line drawn entirely dotted with the caption *"nothing
checked yet."* Dotted-is-unknown is the correct empty state and it is the
rendering law doing the work of an empty-state illustration.

**Reduced motion.** The result replaces the empty rows in one step. There is no
"scanning" animation — a fake progress bar over a 400ms DNS lookup is theatre,
and theatre is what this product is against. If the lookup is slow the button
label changes to `looking…` and nothing else moves.

**On the homepage**, §5.9 embeds the same component with the input and one
result region. The navbar gains one link — `Check a domain` — which is the only
navbar addition this document proposes.

---

## 7. Scroll choreography

### 7.1 The spine

One 2px vertical rule in the container's left gutter, running the full length of
`<main>`, with an 8px node at each section boundary and the section's number in
mono beside it. **The page is a line and the sections are its stations** — the
same device the product uses for a message, applied to the document itself.

*Resting state:* fully drawn, `--line-dim`, all nine nodes present. It is a
static SVG in the DOM. Nothing about it is conditional on script.

*The enhancement:* the portion above the viewport's midline renders in `--ink`.
Implemented with `animation-timeline: scroll()` where supported (no JS, no
listeners, no rAF); where unsupported, the spine stays uniformly `--line-dim`,
which is a complete state, not a broken one. **Do not implement this with a
scroll listener.** A scroll listener on a 6,000px page is the one thing on this
site that would make it feel cheap on a laptop.

*Hidden below `lg`.* At 375px the gutter does not exist and the spine becomes
noise.

### 7.2 Vertical rhythm — one number, and one deliberate exception

`96px` desktop (`py-24`), `56px` mobile (`py-14`), on **eight of nine sections**.
Linear runs 128 on 11 of 11; Resend runs 96 on 11 of 11; nobody varies it. An
identical beat is what makes nine sections read as stations on one line rather
than nine pages stacked.

The exception is **§5.9, the close: `py-32` desktop.** The close is the only
section that asks the visitor to do something with their own data, and it gets
air on both sides so it reads as arrival rather than as a tenth station. One
exception, argued, in the document — which is how a system stays a system.

### 7.3 Horizontal measure — this is where the variety lives

Vertical rhythm is uniform, so **width is the variable**. Four measures:

| Measure | Sections | Why |
|---|---|---|
| Full bleed, no container | 2 (The Break), 4 (Sub-tenancy) | the inverted band and the trunk diagram are the two widest arguments; letting them touch the viewport edge is the strongest structural signal available and it costs nothing |
| `1200px` container | 1, 3, 6, 7 | the artifact-and-caption sections |
| `1200px`, asymmetric 4:8 | 5 (Promises), 8 (FAQ) | sticky heading left, rows right — already shipped and already right |
| `672px` centred | 9 (Close) | one input deserves one column |

That is four distinct page shapes across nine sections, achieved without a
single change to vertical padding.

### 7.4 The handoffs

Each section's last frame is the next section's first question. Stated as nine
sentences, because a page that hands off is a page you keep scrolling:

1. **Hero → Break.** The line settles with `clicked — we do not know`. *What is
   a number you cannot see worth?*
2. **Break → Line.** The scrubber ends on a severed branch. *What else does that
   record know?*
3. **Line → Sub-tenancy.** `Prove` ends on a verified bundle for one message.
   *Whose message was it?*
4. **Sub-tenancy → Promises.** The visitor has watched the product decide
   something on its own. *What else did it decide?*
5. **Promises → Features.** Five decisions, five drawings. *What do they add up
   to in one object?*
6. **Features → Pricing.** The record is the thing being priced. *What does one
   cost?*
7. **Pricing → FAQ.** A computed number. *What am I still worried about?*
8. **FAQ → Close.** The last answer. *Fine — show me something about me.*
9. **Close → account.** They have just seen their own dotted segments. The
   button is not "Start free"; it is **"Fix this with rootmail"**, and the
   secondary is "Create an account".

### 7.5 What the page does NOT do while you scroll

Written down because these are the defaults somebody will reach for:

- **No pinned/sticky scroll-jacked sections.** A section that holds the viewport
  while its contents advance makes content conditional on scroll position, which
  is Law 1 with a wheel instead of a frame.
- **No parallax.** Nothing on this page is at a different depth from anything
  else; the product has one hierarchy and it is the line.
- **No count-up numbers.** A figure that animates from 0 to 4,182 is a figure
  that reads as 0 in a frozen frame and as theatre in a live one. Every number
  renders at its value.
- **No scroll-triggered fades.** `Reveal` is already correct — 10px of transform
  on an element that is fully opaque at rest. Keep it exactly as it is and do
  not let anybody put opacity back in it.
- **No section that only exists on scroll.** Everything is in the DOM at
  first paint.

---

## 8. The developer site — `apps/developers`

### 8.1 It never got the redesign

The homepage was rebuilt; `apps/developers` was not. Read as source today it
still ships every tell `02-AUDIT.md` catalogued:

- `blur-[130px]` aurora blob behind the hero (`page.tsx:113`)
- gradient headline: `bg-gradient-to-r from-primary to-violet-500 bg-clip-text`
- five `<Badge>` eyebrows above five centred `text-3xl font-bold` headings
- **four** `why` cards with `bg-primary/10 text-primary` icon chips
- **twelve** `surface` cards with icon chips — the exact twelve-card grid §6 bans
- six `guarantees` bullets with `bg-primary/10` check circles
- `rounded-2xl`, `rounded-xl`, `shadow-sm` — the shadcn radius and elevation
  vocabulary the design package replaced
- `py-20 md:py-28` on all five sections, alternating `bg-secondary/30`

Plus a claims problem: `code-showcase.tsx`'s audit sample prints
`10:01:30 opened` in a plain event list at the same weight as `delivered`. **We
ship Resend's founding lie on our own developer site**, in the one artifact
whose whole job is to differentiate us from it.

So this is not a restyle. It is the same job the homepage got.

### 8.2 The principle: developers are judged by different proof

A bakery owner is convinced by *watching the mechanism*. A developer is
convinced by *running it and reading the response*. So on this site every
artifact returns something, and the thing it returns is real-shaped.

**Word budget: 600 words.** Code is not prose and is budgeted separately: **no
snippet exceeds 14 lines**, and every snippet is paired with its response.

### 8.3 The demo backend, and its honest fallback

The demos should hit the **real API**, not canned JSON. rootmail has a sandbox
that takes the real path (`sandbox-test-recipients` memory: reserved test
recipients at `test.rootmail.dev` route to the SES mailbox simulator, capped
50/day), which means a developer-site demo can be genuinely live without putting
mail on the wire to a stranger.

Spec:

- A Next route handler in `apps/developers` proxies to the API using a
  **server-side sandbox key** for a dedicated demo workspace. The key never
  reaches the browser.
- **Recipients are forced server-side** to `test.rootmail.dev` addresses. A
  visitor-supplied recipient is rejected, always — this is the one place a
  public demo could be turned into a mailer.
- Rate limit 20 calls/hour/IP.
- The panel carries a mono line: `sandbox · real API · rate limited · recipients
  forced to the mailbox simulator`.
- **If the API does not answer in 2s**, fall back to a cached example response
  and label it: `cached example — the live sandbox did not answer at 14:02:11`.
  A demo that silently fakes it when it fails is the exact failure this company
  exists to argue against, and admitting it on our own page is worth more than
  the demo working.

### 8.4 Section by section

---

**D1. Hero — the call and the response, and the honest word in it.**

*The one thing:* one call sends mail, and the only thing we will tell you
synchronously is that it is queued.

*Artifact.* Two panels side by side. Left: the SDK call. Right: empty until you
press **Send it**, then the real response, with the round-trip time printed in
mono.

```
201 Created · 218ms
{ "id": "msg_01J9Q7F2XKB4M0RVTC8H", "status": "queued" }
```

Under it, 22 words that are the whole positioning of this page:

> *`queued` is the only status we can honestly return in a request. Everything
> after it arrives on your webhook, and we draw the difference.*

*Language switch, in place.* `TypeScript · Python · Go · cURL` as a segmented
control over the left panel. The panel height is locked to the tallest variant
so nothing below moves — a code panel that resizes on tab change is the tell of
a page assembled rather than authored. **The response panel does not change**
between languages, and that is the point: same API, four doors.

*Resting state.* Left panel rendered with the TypeScript call. Right panel shows
a **previous** response, complete and labelled `last run · cached example`, so
the fold is never empty and no information waits on a click. Pressing Send it
replaces it with a live one.

*Reduced motion.* Nothing animates here at any setting. The response appears; it
does not type itself out. A typewriter effect on a JSON response is content
gated behind animation.

*Words: 90.* h1 (8) + one 20-word lead + the 22-word honesty caption + labels.

*Dies:* the gradient h1 clause, the `blur-[130px]`, the `<Badge>` eyebrow, the
"Typed Node SDK · CLI · REST" trailer line, and the 48-word "You've written the
in-house email service before…" paragraph → 20 words.

---

**D2. The ledger — where we differ from the best page in the category.**

*The one thing:* your webhook receives what we **did**, not only what happened.

*Artifact.* A streaming event ledger, Resend-shaped in density and specificity,
built from the **real** `AUDIT_EVENTS` vocabulary in
`packages/core/src/constants.ts`. New rows arrive on a `setInterval` (timers,
not frames), oldest scrolls off, ~1 row/1.5s, and it **stops after 12 rows** with
a `Replay` control. Two differences from every ledger you have seen:

1. **The rendering law is in the ledger.** `delivered` gets a filled node,
   `opened` a **hollow** one, `bounced` a bar with the provider's reason. Rows
   are not colour-swatched chips at equal weight.
2. **Tenant events are in the same stream.** This is the part no competitor's
   ledger can show, because they do not have these events:

```
delivered              msg_01J9Q7…  to guest@test.rootmail.dev   subject Booking confirmed
opened        (hollow) msg_01J9Q7…  tracking pixel · undercounts blocked images
tenant_throttled       harbourclinic.com · 60/hour · complaints 0.31% · threshold 0.30%
tenant_dns_drifted     northlakegym.com · DKIM stopped resolving · 6h grace
bounced                msg_01J9R2…  550 5.1.1 mailbox unavailable
dkim_rotation_started  sunsetvillas.com · selector rm2 published
```

A **filter row** — `all · message events · tenant events` — three buttons. The
`tenant events` view is the pitch, and letting a developer isolate it in one
click is worth more than a paragraph naming it.

*Resting state.* Twelve rows rendered server-side, complete, in final order. The
stream is a **replay of rows already on screen**, entering at the top and pushing
the rest down. If timers never fire, the visitor reads twelve rows. Nothing is
revealed.

*Reduced motion.* No streaming. The twelve rows are static and `Replay` is
hidden.

*Words: 80.* h2 (9) + 20-word lead + three filter labels + a 14-word caption on
the hollow node + the signed-webhook fact line.

*Dies:* `code-showcase.tsx`'s "Audit trail" tab, whose flat `opened` line is the
thing being replaced.

---

**D3. Idempotency, demonstrated in one click.**

*The one thing:* the same `Idempotency-Key` twice returns the same message, not
two messages.

*Artifact.* One button: **Send it twice.** It fires two real requests with an
identical key and renders both responses side by side.

```
request 1   201 Created · 204ms
            { "id": "msg_01J9Q7F2XKB4M0RVTC8H", "status": "queued" }

request 2   200 OK      ·  31ms
            Idempotent-Replayed: true
            { "id": "msg_01J9Q7F2XKB4M0RVTC8H", "status": "queued" }
```

**Same id. Different status code. A response header saying which one this was.
One-seventh the latency.** That is the entire section: no prose can do what two
responses with the same id in them do, and this is the single most-doubted claim
in the category.

*This is the real shape, checked.* `apps/api/src/routes/messages.ts:243-257` —
the replay path sets `Idempotent-Replayed: true` and returns `200` with the
identical serialized message. There is **no** `deduplicated` body field, so the
panel does not print one. Rendering the header rather than an invented field is
also the more developer-credible artifact: a header is where a developer expects
to find out that this was a replay.

*Resting state.* Both responses pre-rendered from a cached run, labelled
`cached example`. Pressing the button replaces them with live ones.

*Words: 45.* h2 (6) + 18-word lead + labels + a 12-word caption.

---

**D4. Sub-tenancy — the onboarding UI you would have built.**

*The one thing:* creating a customer's sending identity returns the DNS table you
were going to build a screen for.

*Artifact.* `mail.subTenants.create({...})` on the left; on the right, the
returned `dns_records` array rendered **as the actual table you would paste into
your own onboarding UI** — type, host, value, each with a copy button. Below it,
one toggle: **as your platform / as your customer**, which flips the `From:`
address, the DKIM selector and the reputation panel between the two identities.

*Why the toggle:* it is §5.4's trunk-and-branches idea in the developer's
vocabulary, and it makes "each customer gets their own score" a thing you switch
rather than a thing you read.

*Resting state.* Call and table both fully rendered, toggle at `as your
platform`.

*Words: 55.*

*Dies:* the four `whyPoints` cards (172 words) — `Grows into platform territory`
is this section, and the other three are absorbed by D1, D3 and D6.

---

**D5. Proof — sign, verify, and break it.**

*The one thing:* the proof bundle can be checked by somebody who does not trust
us, and you can watch it fail.

*Artifact.* Three steps in one panel:

1. `mail.proof.get("msg_01J9Q7…")` → the bundle: recipient, subject, timestamp,
   `content_sha256`, `signature`, `public_key`.
2. **Verify** → `signature: valid (Ed25519) · content hash: matches`.
3. **Change one byte** → a single character of the body flips, visibly, in the
   rendered bundle, and re-verification prints `content hash: MISMATCH` with the
   two hashes shown differing from the fourth character.

Step 3 is four seconds long and it is the most convincing thing on the site,
because it is the only demo that **fails on purpose**.

*Claims guard, non-negotiable:* the word **"tamper-evident" may not appear.**
`00-PHILOSOPHY.md` and `promises.tsx` both restrict us to "signed,
independently verifiable, content hash included" until a hash chain exists. A
content hash mismatch is exactly what this demo shows and exactly what we may
say. Label the button `Change one byte`, not `Tamper`.

*Resting state.* Bundle rendered, step-1 output present, `signature: valid` shown
from a cached verification. Steps 2 and 3 are re-runs of visible content.

*Words: 60.*

---

**D6. Parity — the grid, earned, and quarantined last.**

*The one thing:* everything the dashboard does, the API does, and here is the
route.

*Artifact.* The twelve-item `surface` list survives — but as a **ruled table**,
not twelve bordered cards with icon chips, and with the **actual route** in mono
beside each name:

```
Send                POST   /v1/messages              idempotent, templated, sandboxed
Client domains      POST   /v1/sub-tenants           per-customer DKIM + verify
Proof exports       GET    /v1/proof/:id             Ed25519-signed
Webhooks            POST   /v1/webhooks              signed, replayable
…
```

For a developer the route **is** the fact; a lucide icon beside it is decoration
asserting nothing. Each row links into `packages/docs`.

`01-REFERENCES.md §A.9`'s catalogue test decides the shape: could a reader act on
one row alone? Yes — each row is a route they can call. So a table is correct,
and Resend's structural rule applies: **the grid is allowed, but only after the
argument is made.** It goes at position 6 of 7.

*Words: 40* + the route strings.

*Dies:* twelve `bg-primary/10` icon chips; twelve `rounded-xl border bg-card`
boxes; the six `guarantees` check-bullets (they are now demonstrated in D1, D2,
D3 and D5, and a bulleted claim beside a running demo of the same claim is the
weaker of the two).

---

**D7. Close — one command.**

```
npm i @rootmail/node
```

One copy button. Under it: `3,000 sends a month, free. Sandbox sends never
count.` and two links — `Get an API key` / `Read the docs`.

*Words: 30.* *Dies:* the `rounded-2xl border bg-card p-8 text-center` pricing
card and its 38-word paragraph.

### 8.5 Developer-site budget

| Section | Words | Snippet lines |
|---|---:|---:|
| D1 Hero — call + response | 90 | 9 |
| D2 The ledger | 80 | 0 (data) |
| D3 Idempotency | 45 | 6 |
| D4 Sub-tenancy | 55 | 8 |
| D5 Proof | 60 | 4 |
| D6 Parity table | 40 | 0 (routes) |
| D7 Close | 30 | 1 |
| Nav, footer, chrome | 200 | — |
| **Total** | **600** | **≤ 14 per snippet** |

### 8.6 The design-system port

Before any of the above: `apps/developers` must take the same treatment
`apps/marketing` got — `@rootmail/design/tokens.css`, the preset, Inter Tight at
510, IBM Plex Mono for every id and route, radius 0.25rem, hairline rules,
`--witnessed` / `--acted` / `--stopped` instead of `--primary`, and the deletion
of every `blur-`, `bg-gradient-`, `<Badge>` eyebrow and `bg-primary/10` chip. It
already loads `next/font` (`02-AUDIT.md §3`), so this is tokens and deletions,
not new infrastructure.

---

## 9. What dies — the three biggest, named

### 9.1 Every explanatory paragraph over 35 words — about 1,000 words

Twenty paragraphs on the homepage currently exceed 40 words. Named, with counts:

| File | Paragraph | Words |
|---|---|---:|
| `hero.tsx` | "Receipts, campaigns, and the replies that come back…" | 47 → 26 |
| `hero.tsx` | the three-line prose sourcing block | 32 → 0 |
| `break.tsx` | "A domain stops authenticating and nothing announces it…" | 58 → 0 |
| `break.tsx` | "It is worse if you send for other people…" | 61 → 0 |
| `break.tsx` | "The line ends where the message ended…" | 46 → 0 |
| `the-line.tsx` | three stage bodies | 135 → 38 |
| `product-show.tsx` | five scenes + captions | ~250 → 0 |
| `subtenancy.tsx` | "We draw the trunk because the trunk is real…" | 70 → 13 |
| `subtenancy.tsx` | the five-step setup `<ol>` | 61 → 8 |
| `subtenancy.tsx` | "If you already send email you already have a reputation…" | 50 → 16 |
| `promises.tsx` | five claim bodies | 225 → 45 |
| `features.tsx` | six row bodies | 240 → 46 |
| `features.tsx` | "One system, two front doors" body | 75 → 0 |
| `pricing.tsx` | add-on descriptions ×20 | ~500 → 120 |

**Not one fact leaves the page.** Each of these becomes an artifact state plus a
caption of fourteen words or fewer. The information moves from *asserted* to
*demonstrated and labelled*. That is the only difference between this document
and an instruction to write less, and it is the difference that matters.

### 9.2 The five-tab `ProductTour` carousel

Five stylised screens — Design, Audience, Delivery, Replies, Assistant —
autoplaying at 7s, ~250 words of invented UI text, five tab controls, and a
progress bar. It is the most-built thing on the page and it is a **gallery**: it
says "we have a lot of screens," which is the breadth pitch `02-AUDIT.md §4.2.A`
identified as the wrong product.

It is replaced by §5.3 — **one message in three windows and two doors**, where
the message id is identical in all six states. Three views of one record says
"there is one record and it follows you," which is the position pitch.

Two things survive the demolition and must not be thrown out with it:

- **`carousel.tsx` itself.** Its three documented mechanics — CSS transform
  transition rather than a rAF loop, `setInterval` autoplay, pause on
  hover/focus/touch, never autoplay under `prefers-reduced-motion` — are the
  correct implementation of this document's Law 1 and Law 2, and half the
  artifacts specified above should be built on the same pattern. Keep the file
  and cite it.
- **The DOM-drawn-not-screenshotted discipline.** `product-show.tsx` draws the
  product in markup *"so they stay honest as the app changes"*. Every artifact
  in this document inherits that rule.

### 9.3 The developer site's entire current frame

`apps/developers/src/app/page.tsx` and `code-showcase.tsx`, as they stand: the
`blur-[130px]` aurora, the indigo→violet gradient headline, five `<Badge>`
eyebrows, four `whyPoints` cards, twelve `surface` cards, six `guarantees`
check-bullets, `rounded-2xl` + `shadow-sm`, and the flat audit-trail sample that
prints `opened` at the same weight as `delivered`.

That last item is the reason this is in the top three rather than filed as a
backlog restyle: **we currently ship, on our own developer site, the exact
rendering that `01-REFERENCES.md §4` identifies as the category's founding lie
and as rootmail's single differentiating visual claim.** Every hour that page
stays up, our own strongest argument is being made against us.

### 9.4 Smaller, listed for completeness

- `<LineLegend />` above the fold → footer, once per site.
- The four-station `<Line>` above the closing heading — the ninth line on the
  page, carrying no data. Wallpaper.
- Two FAQ questions (§5.8).
- The severed-message figure in `break.tsx` (§5.2) — the scrubber's branch does
  the same work, and three severed lines on one page is a motif that has become
  a texture.
- Every remaining `<Badge>` eyebrow on both sites.

---

## 10. Build order

Sequenced so that each step is shippable on its own and the first three are the
ones that change the owner's verdict.

| # | Work | Files | Why here |
|---|---|---|---|
| 1 | **`<LiveLine>`** — the hero runs | `hero.tsx`, new `components/site/live-line.tsx` | the first five seconds; the highest-value single component on either site; establishes the timer + CSS-transition pattern every later artifact reuses |
| 2 | **The cut** — 900-word budget applied to all nine sections | every `components/site/*.tsx` | pure deletion, no new components, and it alone removes 2,100 words |
| 3 | **`/check`** — the signature toy | new API route wrapping `auditEmailAuth()`, new `app/check/page.tsx`, `cta.tsx` | engine already exists in `packages/core/src/dns.ts`; it is the shareable artifact and the close |
| 4 | **`<ThresholdScrub>`** (§5.2) | `break.tsx` | one slider, real constants from `reputation.ts` |
| 5 | **`<OneMessage>`** (§5.3) | replaces `the-line.tsx` + `product-show.tsx` | the largest build; six panels; retires the carousel from the homepage |
| 6 | **Developer site: tokens + deletions** (§8.6) | `apps/developers/**` | stops shipping the flat ledger; unblocks D1–D7 |
| 7 | **D1 + D2 + D3** — call/response, ledger, idempotency | `apps/developers` + one proxy route handler | the three artifacts that convince a developer |
| 8 | **`<DefaultDiff>`** (§5.5), **`<TrunkAndBranches>`** operable (§5.4), **`<SpecimenRecord>`** (§5.6) | `promises.tsx`, `subtenancy.tsx`, `features.tsx` | three medium builds, independent of each other |
| 9 | **D4, D5, D6, D7**; pricing bracket line; the spine (§7.1) | | polish, each independently droppable |

### Component inventory

New, shared, in `packages/design/src/`:

- `<LiveLine>` — a `<Line>` plus a timer-driven `stage`, an always-present
  ledger, and station↔row hover linkage. Used by: marketing hero, dashboard
  onboarding (`00-PHILOSOPHY.md §8`, "watch it move"), message detail.
- `<Scrub>` — a labelled scale with fixed rules and a draggable handle,
  `role="slider"`, `aria-valuetext` as a sentence. Used by: §5.2, and the
  dashboard's deliverability page has the same shape.
- `<Ledger>` — event rows under the rendering law, optional timer-driven
  arrival. Used by: developer site D2, dashboard `/messages`, webhook console.

New, marketing-only: `<OneMessage>`, `<DefaultDiff>`, `<SpecimenRecord>`,
`<DomainCheck>`.

Three shared components covering both sites and the dashboard is the point:
**build the mechanism once and every surface inherits the argument.**

---

## 11. The review checklist

Before any section of either site ships, five questions. The first three are
`00-PHILOSOPHY.md`'s; the last two are this document's.

1. **What did we witness?** Anything else is hollow, dotted, or absent.
2. **Where's the line?** If the thing has stages and you didn't draw them, say
   why.
3. **Would a competitor ship this exact screen?** If yes, it isn't finished.
4. **What on this screen has state?** If the answer is "nothing", it is a
   paragraph wearing a section's clothes. Go back to §4 and find its verb.
5. **Kill the JavaScript. Read it. Is anything missing?** If yes, the artifact
   violates Law 1 and does not ship. Test it by disabling script, not by
   assuming.

And the one measurement that decides whether this worked, run the same way it
was run to write this document:

```js
document.querySelector('main').innerText.trim().split(/\s+/).length   // ≤ 900
```
