# 05 — Engagement: the mechanics of wanting to keep scrolling

**Status: research, downstream of `00-PHILOSOPHY.md`. Sibling to `01-REFERENCES.md`,
which owns typography, colour and surface — this document does not revisit any of
them.** Its beat is **motion, interaction, and attention**: what moves in the
first five seconds, what a stranger can touch, what scroll actually drives, how a
demo gets its data, and what survives when animation is frozen.

Every number below was read out of the live page with `getComputedStyle`,
`document.getAnimations()` and the page's own animation-library internals, at a
verified **1280×900** viewport on 2026-08-27. Where a viewport is not stated it is
1280×900. Nothing here is recalled.

The prompt behind it is the owner's: *"If you look at the Wispr Flow site, you
really want to know what it is about because of how it is designed."* This
document is the mechanical answer to **why**.

---

## 0. The baseline we are measuring against

rootmail's marketing homepage, measured at 1280px:

| | rootmail | Wispr Flow |
|---|---|---|
| Total words | **3,006** | **1,670** |
| Paragraphs over 25 words | **33** | 14 |
| Interactive elements | **20** (12 of them one pricing widget) | 74 (**71 are links**) |
| `<img>` | **0** | 65 |
| `<svg>` | — | 133 |
| `<canvas>` | **0** | 1 |
| `<video>` | **0** | 0 |
| Page height | ~11,177px | 15,518px |
| Words per 1,000px of scroll | **269** | **108** |

**Provenance caveat.** rootmail's figures are the baseline handed to this study.
The working tree has since moved: the homepage is nine sections per §7, the hero
already renders `LiveLine`, and `motion.tsx` no longer fades anything in. Treat
3,006 / 269 as **the problem being solved**, not as today's render — and re-measure
at 1280px before claiming the gap is closed.

That last row is the finding. **rootmail asks the reader to absorb 2.5× the prose
per screen of scroll.** Wispr is not shorter because it says less; it is longer
*in pixels* and shorter *in words*, because the scroll is being spent on something
other than sentences.

And note what Wispr's hero costs: **31 words.** One eyebrow, a two-line headline,
one 15-word sentence, one button, one availability line. That is the entire hero.

---

## 1. wisprflow.ai — the north star, measured

Library: **GSAP 3.15.0 + ScrollTrigger + MotionPathPlugin.** No Lenis, no
smooth-scroll hijack — the native scrollbar is left alone.

### 1.1 The first five seconds: nothing moves in the hero. At all.

This is the single most surprising measurement in the study, and it inverts the
obvious lesson.

After a hard reload, filtering every element inside `.section_hero` for
`opacity !== 1 || transform !== none` returns an **empty set**. The `h1`
(`"Don't type, just speak."`) reports `opacity: 1`, `transform: none`, at t=0 and
forever. There is no fade-up, no word stagger, no blur-in, no mask reveal on the
headline.

What *is* running at load, page-wide — the complete census:

| Animation | Duration | Easing | Iterations | Count |
|---|---|---|---|---|
| `logoTicker1` (marquee) | 40,000ms | linear | ∞ | 4 |
| `flowBorder` (pill shimmer) | 2,200ms | linear | ∞ | 1 |
| `flowSpin` (pill spinner) | 1,600ms | linear | ∞ | 1 |
| `transform` transition (word stagger) | 320ms | `cubic-bezier(0.4, 0, 0.2, 1)` | 1 | 12 |

Four things, and **only one of them is in the first viewport** (the marquee, which
is below the fold at y=850). The visitor's first five seconds are: a cream page,
a 96px serif headline, and stillness.

**So the pull is not the entrance.** The page earns attention with a *composed*
first frame and spends its motion budget further down. For rootmail this is
liberating: the hero does not need a reveal, and under §6 of the philosophy it
must not have one anyway.

### 1.2 What the visitor can actually touch — the correction

74 interactive elements sounds like a playground. It is not:

```
A (links)     71
DIV[role=button] 1
TEXTAREA       2
```

**Zero `<button>`, zero `<input>`, zero sliders, zero tabs.** Outside nav and
footer there are 23 interactive nodes, and their labels are almost all navigation
("Read more", "Learn more", "Pricing page.", "full plan comparison").

The Formal → Casual → Very casual tone comparison, which *reads* as a control, is
not one: it is three renderings of the same sentence shown at once inside
`.lang_type-style-wrap`. The reader compares; they do not operate.

**The lesson is the opposite of "add widgets".** Wispr's sense of liveness comes
from things that **run without being touched**, not from controls. A control
demands a decision; a running demonstration demands nothing and is therefore
cheaper to watch. rootmail's `Pull the thread` (§5.4) is the right kind of
touchable — it rewards a hover but requires none.

### 1.3 Scroll choreography: six triggers, one of which is 39% of the page

`ScrollTrigger.getAll()` returns **six triggers** on a 15,518px page. Only two
matter:

| Trigger | start → end | distance | mode |
|---|---|---|---|
| `.section_fl-wrap` | 1,146 → 7,157 | **6,011px** | `pin: true`, `anticipatePin: 1`, `refreshPriority: 1`, custom `onUpdate`, **`snap`** |
| `.testiv2_height` | 10,527 → 13,286 | 2,759px | `scrub: 1.5` |

The pinned section is **902px tall and holds the viewport for 6,011px of scroll** —
39% of the entire page's scroll distance is one scene. Its `pin-spacer` is 6,913px.

Its `onUpdate` is not a GSAP timeline. It is one line:

```js
onUpdate: function (self) { applyScroll(self.progress); }
```

A pure **progress → scene-state** function. `self.progress` is 0…1 across those
6,011px and the author maps it by hand. There is no attached tween, no `scrub`
value — the scene is a state machine the scrollbar indexes into.

And it **parks** the reader at each beat:

```js
snap: {
  snapTo: /* nearest of snapPoints, but only past a pHold threshold */,
  duration: 0.3,
  ease: 'power1.inOut',
  inertia: false,
}
```

300ms, `power1.inOut`, inertia off — a short, non-springy settle onto the nearest
beat, and the snap **only engages once progress passes `pHold`**, so the reader
can scroll past the section freely at the start without being captured. That
conditional is the difference between a scene that guides and one that traps.

**Read the ratio:** 6 triggers, 2 of consequence, 1 pin. This is not a page
covered in scroll effects. It is a page with **one** scroll effect, given
two-fifths of the page to run in.

### 1.4 The demo pattern, and where Wispr violates rootmail's law

The pinned scene is the "45 wpm vs 220 wpm" race: two columns, `.flow_45-wpm`
and `.flow_220-wpm`, typing the *same* passage at different rates, with a
`.flow-melt-canvas` (a 300×150 backing canvas, `opacity: 0` at rest,
`pointer-events: none`, `z-index: 1`) used for a dissolve between beats. The copy
is real product output, not lorem:

> *"I'm getting started with the project. How would you like to set up the file?
> I can create a new one from scratch…"*

**The data is seeded and looped, not live.** The passage repeats verbatim on a
cycle. That matters for rootmail: a convincing demo does not require a live
backend, it requires *realistically shaped* content and an honest label.

**The violation.** Sampled mid-pin, the scene's own words carry GSAP-written
inline styles:

```
.flow_w      style="opacity: 0;"
.flow_intro  style="position: static; opacity: 0;"
```

Content inside the pinned section **exists only because a scroll handler ran**. If
`requestAnimationFrame` is frozen — which is exactly what the Claude preview pane
does, and what a background tab does — those words are invisible. First-hand
evidence from this very session: while the browser pane was hidden, `setTimeout`
callbacks on this page **never fired at all**, twice in a row, silently.

Under `00-PHILOSOPHY.md` §6 (*"No motion that reveals content"*) and the two
shipped bugs behind that rule, **this pattern is disqualified for rootmail as
built.** rootmail's compliant variant is in §5.1 below: the same progress→state
mapping, but every state authored as *visible content by default* and the scroll
handler only ever **adds emphasis**, never subtracts visibility.

Note that Wispr itself already demonstrates the compliant version elsewhere — see
next.

### 1.5 The compliant mechanic Wispr does get right: the word stagger

The 12 staggered animations in the load census are not the headline. They are the
message being "spoken" in the languages section at y≈8,578:

```
transition-property: transform            (opacity is NOT transitioned)
duration: 320ms
easing:   cubic-bezier(0.4, 0, 0.2, 1)
delays:   0, 45, 90, 135, 180, 225, 270, 315, 360, 405, 450, 495, 540, 585, 630
          → a 45ms stride
```

Sampled at rest, every word reports **`opacity: 1`** and `transform:
matrix(1,0,0,1,0,0)`. The words are *always opaque*. Only their position tweens.

**That is the exact pattern rootmail is allowed to ship**: freeze the clock and
the sentence is fully readable, just not yet settled. 45ms stride, 320ms per
item, standard Material ease-out.

### 1.6 Text-to-artifact ratio, per section

Measured per top-level section (words / images / svg / canvas / interactive):

| Section | top | height | words | img | svg | canvas | interactive |
|---|---|---|---|---|---|---|---|
| `section_hero` | 0 | 677 | **31** | 1 (a 16×19 Apple glyph) | 0 | 0 | 1 |
| `section_nt-testi` (logo strip) | 850 | 375 | 4 | 32 | 0 | 0 | 0 |
| `section_fl-wrap` (pinned race) | 1,146 | 902 | 624 | 6 | 64 | 1 | **0** |
| `section_lang-wrap` | 8,059 | 1,859 | 272 | 0 | 10 | 0 | **0** |
| `section_switch` | 9,783 | 408 | 30 | 1 | 2 | 0 | 1 |
| `section_new-testi` | 10,191 | 3,995 | 207 | 8 | 4 | 0 | 2 |
| `section_nt-faqs` | 14,186 | 865 | 132 | 1 | 9 | 0 | 10 |
| `section_startflowing` | 15,051 | 779 | 21 | 3 | 1 | 0 | 2 |

Two patterns:

1. **The two biggest demonstration sections have ZERO interactive elements.** The
   product is shown operating; the reader is not asked to drive.
2. **The sections with the most words are the ones with the most artifact.** 624
   words in the pinned scene, but they are *the demo's own content* — the passage
   being typed — not prose describing a feature. Wispr's actual explanatory prose
   totals well under 400 words across the page.

### 1.7 Reduced motion: reduce, don't delete

Five `@media (prefers-reduced-motion: reduce)` blocks, and none of them is a
blanket `* { animation: none }`. Read them in order, because the *policy* is the
takeaway:

```css
@media (prefers-reduced-motion: reduce) {
  [data-flow="spinner"] { animation-duration: 4s; }                    /* 1.6s → 4s: slowed, not killed */
  [data-pill="polishing"] .flow_pill-polish_wrap::before,
  [data-pill="polishing"]::before { animation: none; }                 /* decorative shimmer: removed */
  [data-pill="polishing"].is-in .flow_pill-dots { animation: none; }   /* decorative dots: removed */
  [data-pill="polishing"].is-done .flow_pill-dot
      { transition-duration: 0.01ms; }                                 /* state change: instant, still happens */
}
```

The rule they are following: **decoration is removed; anything carrying state is
made instant or slowed, never deleted.** A dot that means "done" still becomes
"done" — in 0.01ms.

That is precisely the policy `00-PHILOSOPHY.md` §5.4 asks for ("turns the follow
into an instant jump"), confirmed in the wild, and it is the one rootmail should
copy verbatim.

### 1.8 Wispr, summarised as three transferable rules

1. **Compose the first frame; spend motion below the fold.** Hero motion: zero.
2. **One scroll scene, given 39% of the page — not twelve small ones.**
3. **Liveness comes from things that run untouched.** 71 of 74 interactive
   elements are ordinary links.

---

## 2. lennysproductpass.com — engagement with almost no motion at all

Library: **none.** No GSAP, no Lenis, no Framer Motion, no ScrollTrigger. The
`window` object carries no animation library at all.

| | value |
|---|---|
| Words | **1,127** |
| Page height | 8,498px |
| **Words per 1,000px** | **133** |
| Interactive elements | 76 — **50 `<button>`**, 20 `<a>`, 6 `<input>` |
| Images / SVG / canvas / video | 92 / 50 / 0 / 0 |
| **Total running animations** | **3** |

### 2.1 The first five seconds

Three animations exist on the entire page:

```
fade-in                    300ms  linear   ×1
hero-logo-marquee-right  60,000ms  linear   ∞
featured-cta-marquee-up  40,000ms  linear   ∞
```

One 300ms fade and two marquees. That is the whole motion system. Nothing is
scroll-linked; nothing is triggered; nothing is staged.

**And it works anyway.** This is the most useful reference in the set precisely
*because* it disproves the assumption that engagement is a motion problem. What
holds the reader is the **catalogue**: 5,161px — **61% of the page** — of named
offers, each with a real dollar value and a `Claim` button.

### 2.2 What the visitor can touch, and what each control teaches

50 buttons, and they resolve into exactly three jobs:

| Count | Control | What it teaches |
|---|---|---|
| **37** | One `Claim` per offer, e.g. *"1 year free of Cursor Pro · Build software with AI. · $240 value · Claim"* | The unit of the product is a row you can act on |
| 7 | FAQ accordions | Objection handling, on demand |
| 6 | `Get Product Pass` | The one conversion |
| 6 | `<input type=email>` | The one field |

The offer card: **347×322px, `border-radius: 24px`, `box-shadow: none`, no
border** — and **11 words plus one number plus one verb** inside it. That is the
whole atom, repeated 37 times.

Contrast with rootmail: our 20 interactive elements are **12 pricing-widget
controls plus 8 links**. Twelve of our twenty controls are all one decision, and
it is a decision about money made before the reader believes anything. Lenny's
puts an actionable control on **every unit of value**.

### 2.3 Interaction feel — one tier only

Transition census, top of the page (count of elements carrying each declaration):

```
transform                                     0.2s   cubic-bezier(0,0,0.2,1)   ×70
color, background-color, border-color, …      0.15s  cubic-bezier(0,0,0.2,1)   ×47
background-color, border-color, box-shadow    0.2s   cubic-bezier(0,0,0.2,1)   ×35
opacity                                       0.15s  cubic-bezier(0,0,0.2,1)   ×13
transform                                     0.12s  cubic-bezier(0,0,0.2,1)    ×8
```

Everything is 120–200ms on a plain ease-out with **no overshoot**. There is no
narrative tier because there is no narrative — the page is a list. This confirms
§9.4's two-tier rule from the other direction: **if you have no scene to stage,
you should have no slow tier**, not a 300ms compromise everywhere.

### 2.4 Reduced motion — the blunt version, and why they can afford it

```css
@media (prefers-reduced-motion: reduce) {
  *, ::after, ::before {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
  .hero-logo-marquee-track-left,
  .hero-logo-marquee-track-right   { animation-play-state: paused; }
  .featured-cta-marquee-track-up,
  .featured-cta-mobile-marquee-track { animation-play-state: paused; }
}
```

The global nuke **plus** an explicit `animation-play-state: paused` on the
marquees — because `animation-duration: 0.01ms` on an infinite marquee produces a
strobe, not a stop. That two-line addendum is a real bug fix worth copying if
rootmail ever ships a marquee.

They can afford the nuke because **nothing on this page is revealed by motion**.
rootmail is in the same position by policy, which means rootmail can ship the
same blunt rule — with the one exception noted in §5.6.

### 2.5 The transferable rule

**Engagement is a function of actionable units per screen, not animations per
screen.** Lenny's has 133 words per 1,000px against rootmail's 269, and it gets
there not by cutting sentences but by replacing paragraphs with *rows that can be
acted on*.

rootmail's equivalent unit is not an offer. It is **a message with its line** —
a row a reader can scrub, whose stations are real and whose timestamps are real.

---

## 3. linear.app — 545 animations that reveal nothing

**Why this one, and not another.** Two reasons, both specific to rootmail. First,
it is the only reference in the study that transitions an SVG **`stroke`** — the
literal mechanic of rootmail's spine. Second, its stylesheet ships a component
called `_line` with a `_readingPoint`, a `_readingMarker` and a `_crosshair`,
which is `00-PHILOSOPHY.md` §5.4 ("pull the thread") already built by somebody
else. `01-REFERENCES.md` measured Linear's easings; it did not measure this.

Library: **Framer Motion** (`window.MotionIsMounted`). No GSAP, no ScrollTrigger,
no Lenis.

| | value |
|---|---|
| Words | **1,448** |
| Page height | 9,602px |
| **Words per 1,000px** | **151** |
| **Paragraphs over 25 words** | **0** |
| Interactive | 148 — 70 `<button>`, 69 `<a>`, 5 link-buttons, 1 combobox, 1 textarea |
| SVG / img / canvas / video | **243** / 39 / 0 / **0** |
| Running animations | **545** |

Zero paragraphs over 25 words, against rootmail's 33. Zero video, 243 inline SVG.

### 3.1 The finding that matters most: 545 animations, 2 gated elements

Sweeping every element on the page for `opacity < 0.05` while still laid out and
non-empty returns **two** results:

```
.LSqk9q_root      "Skip to content →"     (a skip link — correct to hide)
.qM9FAa_chatMessage  "didier 4:12 PM …"   (the NEXT line of a looping chat demo)
```

That is it. On a 9,602px page running 545 concurrent animations, **exactly one
piece of real content is invisible at rest**, and it is the not-yet-typed message
in a loop that will type it a second later.

Everything else — every heading, every paragraph, every product scene — reports
`opacity: 1` before, during and after its entrance. Framer Motion is being used
for *ambient and additive* motion, not for reveal.

**This is the empirical case for `00-PHILOSOPHY.md` §6, made by the most
motion-dense site in the study.** The bug that shipped twice in this codebase is
not a tax we pay for looking plain; the best-looking reference does not pay it
either.

### 3.2 The animation census — where 545 comes from

```
fFDhtq_dotIn                420ms   linear   ×1  →  ×438
grid-dot-{r}-{c}-upDown    2800ms   linear   ∞   ×25   (a 5×5 grid, one keyframe rule per cell)
grid-dot-{r}-{c}-pong      1600ms   linear   ∞   ×25
grid-dot-{r}-{c}-agent     3200ms   linear   ∞   ×50   (two per cell)
agentBorderSweep           2000ms   linear   ∞    ×3
agentLabelSweep            2000ms   linear   ∞    ×3
cursorBlink                1250ms   linear   ∞    ×1
```

438 of the 545 are one 420ms one-shot on a background dot field. The *authored*
count is closer to seven behaviours. Note the shape of it: **a 5×5 grid where each
cell has its own named keyframe rule** (`grid-dot-3-2-pong`), three behaviours
deep — 75 hand-generated keyframe blocks, zero JavaScript. Ambient life bought
entirely in CSS, which means it survives a frozen rAF as *stillness*, not as
*missing content*.

All 545 run on `DocumentTimeline`. **Zero scroll-linked animations** — no
`animation-timeline: view()` or `scroll()` anywhere, despite the browser
supporting it. Linear's scroll behaviour is **triggered on entry, then plays on
its own clock** — never scrubbed.

### 3.3 The `stroke` transition, and the correction to a tempting assumption

10 `<path>` elements carry:

```css
transition: stroke 0.7s cubic-bezier(0.32, 0.72, 0, 1);
```

But measured on those same paths:

```
stroke-dasharray : none
stroke-dashoffset: 0px
```

**They are not drawing the path.** The geometry is fully rendered at all times;
what tweens over 700ms is the stroke's *colour*. A connector does not appear — it
*becomes live*.

This is the single most directly transferable mechanic in the document, because
it is how rootmail can animate `dotted → solid` **without ever violating its own
law**: the segment is always drawn, and 700ms of `cubic-bezier(.32,.72,0,1)`
changes what it means. Freeze the clock and you have a complete diagram in its
resting colour, not an empty box.

### 3.4 "Pull the thread", already built — the CSS, verbatim

Six rules from Linear's bundle, which together are §5.4's spec:

```css
.K64U9a_line          { color: var(--ink-a);        transition: opacity .12s ease-out; }
.K64U9a_lineAhead     { color: var(--ink-a-muted); }
.K64U9a_readingPoint  { position: absolute; inset: 0;
                        transition: opacity .12s ease-out; }
.K64U9a_crosshair     { position: absolute; top:0; left:0; width:1px; height:100%;
                        transform: translate(-50%);
                        background: repeating-linear-gradient(to bottom,
                                    var(--crosshair-color) 0 1px, transparent 1px 5px);
                        opacity: 0; transition: opacity .12s ease-out; }
.K64U9a_crosshairShown{ opacity: 1; }
.K64U9a_readingMarker { position: absolute; top:0; left:0;
                        width: var(--marker-size); height: var(--marker-size);
                        border-radius: var(--radius-circle);
                        background: var(--marker-color, var(--ink-a));
                        transform: translate(-50%,-50%);
                        opacity: 0; transition: opacity .12s ease-out; }
.K64U9a_readingShown .K64U9a_readingMarker { opacity: 1; }

@media (prefers-reduced-motion: reduce) {
  .K64U9a_line, .K64U9a_legendItem, .K64U9a_readingPoint,
  .K64U9a_readingMarker, .K64U9a_crosshair { transition: none; }
}
```

Five things to take from this, all of them decisions rootmail would otherwise
have to guess at:

1. **The "ahead" segment is a separate element with a muted colour token**
   (`_lineAhead` → `--ink-a-muted`), not an opacity multiplier on the whole path.
   That is how §5.4's "behind at full weight, ahead at 40%" is implemented without
   fading the data.
2. **The crosshair is a dotted 1px column drawn with a gradient** — `1px` on,
   `4px` off. rootmail already needs a dotted vertical rule for the *unknown*
   state; this is the one-line implementation, and it needs no SVG.
3. **The marker is a circle positioned by `translate(-50%,-50%)`**, i.e. the
   node rides the stroke by transform, not by layout. Consistent with §5.1's
   "nodes are the only circles."
4. **Every scrub affordance is 120ms `ease-out` on `opacity` only.** Nothing
   moves; things appear and disappear. That is why it feels attached to the
   cursor.
5. **Reduced motion is `transition: none`, not `display: none`.** The crosshair
   still tracks; it just snaps. Exactly §5.4's "instant jump."

### 3.5 Section rhythm as a metronome

The four narrative sections measure:

```
Intake and integrations   1,225px
Planning and monitoring   1,227px
AI and automations        1,231px
Build, review, and ship   1,219px
```

**A ±6px spread across four sections.** The page has a beat, and the reader's
body learns it by the second section — which is a large part of why it feels
effortless to keep going. Compare Wispr's deliberate violation of its own rhythm
(one 6,011px pin) as the emphasis device: you can only break a rhythm you have
established.

### 3.6 The demo-data doctrine: one fictional company, everywhere

The seeded data is not "Lorem" and not "Acme". It is **one coherent fictional
product — a rideshare app — used consistently across every scene**:

```
didier  4:12 PM  Has anyone been looking into the iOS startup performance…
lena    4:12 PM  Anyone else noticing the iOS app feels slow to open…
didier  4:12 PM  Yea, we're still blocking initial render on a full vehi[cle state fetch]
DRV-885 · ride/drv-364-reset-dimmed-rows · vehicle_state
```

Lowercase usernames. A plausible timestamp. An issue key with a consistent prefix.
A branch name that matches the issue. A field name that matches the bug. The
content is *domain-true* — it discusses a real engineering failure mode — which is
what makes the screenshot read as a product rather than as a mock.

**rootmail's version of this rule:** pick one fictional platform customer and one
fictional end recipient, and use them in the hero, the docs, the seeds, the
screenshots and the empty states, forever. A message to `liam@northwind.example`
from `receipts.northwind.example`, bouncing with a real SES reason, is worth more
than any amount of copy about accountability.

---

## 4. resend.com — the nearest neighbour, and the one whose reveal breaks

**Why this one.** It is the closest competitor, its main artifact is a stream of
**email delivery events** — the identical data shape to rootmail's line — and
`01-REFERENCES.md` measured its type and colour but never asked *where the demo's
data comes from*. That question turns out to be the whole finding.

Library: **Framer Motion** (`window.MotionIsMounted`). No GSAP, no scroll library.

| | value |
|---|---|
| Words | **2,155** |
| Page height | 12,229px |
| **Words per 1,000px** | **176** |
| Paragraphs over 25 words | **27** (rootmail: 33) |
| Interactive | 112 — 54 `<a>`, 18 `<button>`, **29 `role=tab`**, 4 tabpanels, 2 switches |
| img / svg / canvas / video | 73 / 102 / 1 (1296×1100) / **5** |
| Running animations | **13** |
| **Content elements invisible at rest** | **10** |

### 4.1 Video, used correctly and cheaply

Five `<video>` elements, and the pattern is uniform:

```
cube.mp4                    400×?  10s  autoplay muted loop playsInline
3d-integrate-afternoon.mp4  370×?  14s  (autoplay false — click to play)
3d-broadcast.mp4            370×?  16s  autoplay muted loop playsInline
3d-react.mp4                370×?  20s  autoplay muted loop playsInline
3d-control.mp4              370×?  16s  autoplay muted loop playsInline
```

All **muted**, all **`playsInline`**, all **370–400px wide** (not full-bleed), all
10–20s loops, and **all reporting `paused: true`** while off-screen — the browser
suspends them, and Resend does not fight it. Video here is a *decorative 3D
render*, never the carrier of a claim.

The relevance to rootmail is the negative one: five 3D renders cost real bandwidth
and say nothing about email. rootmail should stay at **0 video**, which it already
is — but not at 0 artifact.

### 4.2 What the visitor can touch: 29 tabs, in three groups

```
13 language tabs   Node.js · Serverless · Ruby · Python · PHP · CLI · Go ·
                   Rust · Java · Elixir · .NET · REST · SMTP
 9 framework tabs  Next.js · Remix · Nuxt · Express · Hono · Redwood · Bun · Astro
 4 template tabs   user-welcome.tsx · reset-password.tsx · user-invite.tsx ·
                   weekly-digest.tsx
```

This is the strongest *control* pattern in the study, and it is the same device
Wispr uses passively: **one input rendered N ways.** The reader is not learning
13 things; they are looking for **their** one thing and finding it. The tab strip
does the work a paragraph claiming "works with your stack" cannot.

The template tabs are the most copyable: **the tab labels are filenames.** Not
"Welcome" but `user-welcome.tsx`. Mono, lowercase, hyphenated, with an extension
— it reads as somebody's repo, not as a brochure.

### 4.3 Where the demo data comes from — and the tell

The event ledger, verbatim from the DOM:

```
Delivered   Aug 27 04:15:50   to lucas@yahoo.com    with subject Get Started   on Yahoo Mail  running on Windows
Opened      Aug 27 04:15:50   from emma@figma.com   with subject Hello world   on Gmail       running on macOS
Clicked     Aug 27 04:15:50   from liam@gmail.com   on Welcome                 on Gmail       running on macOS
Bounced     Aug 27 04:15:50   to emma@gmail.com     with type Spam             on Gmail       running on macOS
Complained  Aug 27 04:15:50   to melia@xerox.com    with feedback Spam         on Outlook     running on Windows
```

The date is **today's**. And **every one of the five events carries the same
timestamp to the second** — `04:15:50` — while the browser clock at measurement
read `16:17:02`.

So: the ledger is **seeded rows stamped once at render**. It is not live, it does
not tick, and no real event stream ever produces five independent events in the
same second. It is engineered to *look* live.

**This is rootmail's opening, and it is a design opening, not just a copy one.**
Under `00-PHILOSOPHY.md` §3 an inferred thing is drawn differently from a
witnessed thing. A demo whose timestamps are manufactured is an inferred thing.
rootmail's ledger must therefore either (a) carry real, differing, *older*
timestamps from a real seeded send, or (b) be labelled — one mono sourcing line
under it: `sample record · seeded · not a live feed`. Option (b) costs one line
and is the more distinctive choice, because **nobody else on this list labels
their demo**, and labelling it is a live demonstration of the product's entire
thesis.

Note also what the ledger already proves about the line: Resend renders
`Delivered`, `Opened`, `Clicked`, `Bounced` and `Complained` in *the same visual
weight*. That is §1's founding lie, rendered. rootmail's identical rows —
`Delivered` solid, `Opened` hollow, `Bounced` severed — is the same information
with the honesty drawn in, and it needs no extra copy to land.

### 4.4 The reveal bug, in the competitor's most important section

Sampled at rest, ten content elements report `opacity: 0`. Nine of them are the
deliverability feature cards at y ≈ 7,703 / 7,919 / 8,134, all carrying
Framer Motion's inline style:

```html
<div style="opacity:0;transform:translateY(20px)">
  Proactive blocklist tracking …
  Faster time to inbox …
  Build confidence with BIMI …
  Managed dedicated IPs …
  Dynamic suppression list …
  IP and domain monitoring …
  Verify DNS records …
  Battle-tested infrastructure …
  Prevent spoofing with DMARC …
</div>
```

A `whileInView` stagger in a 3×3 grid. **If `requestAnimationFrame` never runs —
frozen preview pane, suspended background tab, a scroll observer that misfires —
Resend's entire deliverability section is a blank rectangle.** Those nine cards
are the exact claims rootmail competes against.

That is the same class of bug that has shipped twice in this codebase, sitting in
production on the market leader for developer email. It is the clearest possible
argument that `00-PHILOSOPHY.md` §6 is a competitive advantage and not a
handicap: **the compliant version is also the one that is always readable.**

### 4.5 Motion census

```
hero-text-slide-up-fade   1,000ms  linear   ×1
open-scale-up-fade        1,500ms  linear   ×1
webgl-scale-in-fade       1,000ms  linear   ×1
rotate                   30,000ms  linear   ∞  ×2
disco                     6,000ms  linear   ∞  ×1
scroll-x                180,000ms  linear   ∞  ×3
scrollbar-color        200–300ms   ease-out ×3
background-color            150ms  cubic-bezier(0.4,0,0.2,1) ×1
```

Thirteen animations, all on `DocumentTimeline` — **nothing scroll-linked**.
One-shot entrances are 1,000–1,500ms (slower than Linear's 700ms narrative tier);
interaction is 150–300ms. The `scroll-x 180s` marquees are the slowest ambient
motion in the study — three minutes for one pass, which is effectively "drifting."

Also worth noting: Resend transitions **`scrollbar-color`**. A tiny detail, but it
means somebody looked at the page while scrolling and decided the scrollbar was
part of the design.

---

## 5. Buildable patterns for rootmail

**What already exists, so nothing below re-proposes it.** `packages/design/src/`
ships `line.tsx`, `live-line.tsx`, `scrub.tsx`, `metric.tsx`; `packages/design/preset.ts`
ships the two-tier motion tokens (`duration-interaction` 100ms /
`ease-interaction`, `duration-narrative` 700ms / `ease-narrative`) and a
`line-travel` keyframe that moves only `stroke-dashoffset` on an
already-drawn stroke; `apps/marketing/src/components/site/motion.tsx` ships a
`Reveal` that animates **`transform` only, never opacity**. The homepage is nine
sections and the hero already renders `LiveLine`.

The measurements above say the remaining gap is **not** a motion gap. It is a
**words-per-scroll** gap, and the reference that fixes it best (Lenny's) has three
animations.

Ranked. Each entry: mechanic with real values → the rootmail truth it
demonstrates → **resting state when animation is frozen** → reduced-motion path.

---

### 5.1 — The send, scrolled: a sticky progress→state scene *(the bet)*

**Mechanic.** Wispr's structure, rebuilt without GSAP. One `position: sticky`
viewport-height stage inside a tall parent; an `IntersectionObserver` with one
sentinel per beat sets `data-beat="0|1|2|3|4"` on the stage; every visual state
is expressed as CSS keyed off that attribute.

```
stage:      position: sticky; top: 0; height: 100svh
parent:     height: calc(100svh * 5)      → ~4,500px of scroll for 5 beats
sentinels:  5 × 1px divs, one per beat, IntersectionObserver
            rootMargin: "-50% 0px -50% 0px", threshold: 0
beats:      queued → sent → delivered → opened → (bounced | clicked)
transition: stroke .7s var(--ease-narrative)      /* the station going live */
            color  .1s var(--ease-interaction)    /* the row taking emphasis */
```

Wispr's numbers for comparison: 6,011px of pin, 39% of the page, `anticipatePin: 1`,
snap `duration: 0.3, ease: power1.inOut, inertia: false`, engaged only past a hold
threshold. **Do not copy the snap.** It requires GSAP and it takes the scrollbar
away from the reader; `scroll-snap-type: y proximity` on the parent gets 80% of
the benefit in one CSS line, and reads as a suggestion rather than a capture.

Size it at **~4,500px, ~30% of the page** — under Wispr's 39%, because rootmail
has a real product to show afterwards.

**The truth it demonstrates.** The whole of §8's first-login promise: *send one
real email and watch the line*. It is the only section on the site that can show
`opened` staying hollow while `delivered` goes solid, which is `00-PHILOSOPHY.md`
§1's argument made without a sentence.

**Resting state (frozen rAF, no JS, hidden tab).** The stage renders at
`data-beat="4"` — **the terminal state, server-rendered**: the complete line, every
station at its final drawing, and the full event ledger as plain rows beneath.
A reader who never scrolls and never gets a frame sees the *finished record*,
which is the most persuasive frame anyway. `data-beat` only ever moves emphasis
between rows that are all already on screen. This is the same contract
`live-line.tsx` already documents — extend it, do not re-invent it.

**Why this is the bet.** It is the only pattern that attacks the actual number:
269 words per 1,000px against Wispr's 108 and Lenny's 133. It converts prose into
scroll distance spent on the one artifact no competitor can copy, because copying
it means admitting what they cannot observe.

**`prefers-reduced-motion`.** No sticky staging at all: the parent collapses to
`height: auto`, the stage to `position: static`, and the five beats render as five
stacked ruled blocks in document order — the same information, read rather than
scrolled. One media query, no JS branch.

---

### 5.2 — `dotted → solid` as a stroke-colour transition, never a draw-on

**Mechanic.** Linear's, measured verbatim: 10 `<path>` elements carrying

```css
transition: stroke 0.7s cubic-bezier(0.32, 0.72, 0, 1);
```

with `stroke-dasharray: none` and `stroke-dashoffset: 0px`. **The geometry is
never animated.** The path is fully drawn at all times; 700ms of a decelerating
curve changes what it *means*.

For rootmail's dotted state, which does carry a dasharray, transition the
**colour and the dash pattern**, never the offset-to-reveal:

```css
.rm-seg            { stroke: hsl(var(--line-dim)); stroke-dasharray: 2 4;
                     transition: stroke .7s var(--ease-narrative),
                                 stroke-dasharray .7s var(--ease-narrative); }
.rm-seg[data-state="witnessed"] { stroke: hsl(var(--witnessed)); stroke-dasharray: 0 0; }
.rm-seg[data-state="stopped"]   { stroke: hsl(var(--stopped)); }
```

**The truth it demonstrates.** A DNS record resolving on the hourly re-check; a
station moving from *we do not know* to *we witnessed*. The transition is
literally the product's job, and it is one CSS declaration.

**Resting state.** A complete diagram in whatever colour its current state
requires. Nothing is missing, ever — the failure mode of a frozen clock is a
line that is *already correct* rather than a line that never arrives.

**Reduced motion.** `motion-reduce:transition-none`. The state still changes; it
changes instantly. Copied from Linear's own rule for its `_line` family.

---

### 5.3 — Upgrade `scrub.tsx` with Linear's five-rule recipe

`scrub.tsx` exists and its four documented constraints are right. These are the
**implementation** details it is currently guessing at, measured off a shipping
product:

| Detail | Linear's answer | Why it matters here |
|---|---|---|
| The dimmed "ahead" segment | a **separate element** (`_lineAhead`) with its own muted colour token, not an opacity multiplier | §5.4 says "ahead at 40%"; doing that with `opacity` fades the *data*. A muted token dims the line while keeping labels at full contrast. |
| The crosshair | `background: repeating-linear-gradient(to bottom, var(--crosshair-color) 0 1px, transparent 1px 5px)`, `width: 1px`, `transform: translate(-50%)` | A dotted vertical rule with **no SVG** — 1px on, 4px off. rootmail needs exactly this for the *unknown* state. |
| The marker | `border-radius: var(--radius-circle)`, `transform: translate(-50%,-50%)`, sized by `--marker-size` | The node rides the stroke by transform, not layout. Consistent with §5.1's "nodes are the only circles". |
| Every scrub affordance | `transition: opacity .12s ease-out` — **opacity only, nothing moves** | This is why it feels attached to the cursor. Our `duration-interaction` is 100ms; 100–120ms is the right band. |
| Show/hide | a parent class (`_readingShown`, `_crosshairShown`) flipping `opacity: 0 → 1` | One state class, not per-element JS. |

**Resting state.** The line, all stations, and the plain event rows — exactly as
`scrub.tsx` already promises. The crosshair and marker are `opacity: 0` overlays
that carry **no information of their own**; they point at rows that are already
readable. That is the distinction that makes an `opacity: 0` default legal here
and illegal in Resend's feature grid.

**Reduced motion.** `transition: none` on the whole family — Linear's own rule,
which is `00-PHILOSOPHY.md` §5.4's "instant jump", confirmed in the wild.

---

### 5.4 — One actionable unit per claim, replacing paragraphs

**Mechanic.** Lenny's, generalised. 61% of that page is a catalogue of 37 rows;
each row is **11 words + one number + one verb** in a 347×322 card. Not one
sentence describes a feature in the abstract.

rootmail's unit is not an offer — it is **a message with its line**. `Features`
is already six ruled rows; give each row the artifact instead of the adjective:

```
Suppression      msg_8Kd2…   liam@northwind.example   ●━━●━━◌   suppressed · hard bounce · 41d ago
Sub-tenancy      msg_7Qa9…   billing.northwind…       ●━━●━━●   delivered · 04:12:07 · client: northwind
Proof            msg_3Vf1…   ops@northwind.example    ●━━●━━●   proof bundle · signed · view →
```

The source strings in `apps/marketing/src/components/site/` show where the prose
actually sits: `faq.tsx` **836 words**, `promises.tsx` **329**, `features.tsx`
**261**, `the-line.tsx` **177**, `subtenancy.tsx` **168**. *(Counted from quoted
string literals in source, not from the rendered page — it locates the mass, it
is not the render-time number.)* The FAQ alone is over a quarter of the site's
copy and sits at position 8, where it is read least.

**The truth it demonstrates.** That every claim on the site is backed by a
record we can show — which is the product.

**Resting state.** Static rows. This pattern has no animation at all, which is
the point of including it: **the highest-engagement reference in the study runs
three animations.**

**Reduced motion.** N/A — nothing moves.

---

### 5.5 — Label the demo, because nobody else does

**Mechanic.** Resend's ledger shows five events sharing **one timestamp to the
second** (`Aug 27 04:15:50`) against a browser clock of `16:17:02`. It is seeded
data stamped once at render, presented as a feed.

rootmail's ledger gets **`5.3`'s sourcing line** underneath, in mono, at
`--ink-muted`:

```
   sample record · seeded · replayed on this page · not a live feed
```

or, better, where the send is real:

```
   msg_8Kd2 · sent 2026-08-11 04:12:07Z · real send from rootmail-hq · proof →
```

**The truth it demonstrates.** §5.3's law — *no naked number ships* — applied to
the product's own marketing. It is the cheapest possible proof that the honesty
policy is not a slogan: **we label our own demo**, which none of the four
references does.

**Resting state.** The label is static text. It is the one element on the page
that is *more* legible when nothing is running.

**Reduced motion.** N/A.

---

### 5.6 — The word stagger, on `transform` only

**Mechanic.** Wispr's, measured exactly:

```
transition-property: transform          /* opacity is NOT in the list */
duration: 320ms
easing:   cubic-bezier(0.4, 0, 0.2, 1)
delay:    0, 45, 90, 135, 180, …        /* 45ms stride */
```

Sampled at rest: every word `opacity: 1`, `transform: matrix(1,0,0,1,0,0)`.

Use it for **ledger rows arriving during a replay**, not for headlines. Cap the
stride: at 45ms, ten rows is a 450ms lead-in — past that it reads as slow rather
than as alive. Six rows maximum.

**The truth it demonstrates.** Events arrive in order and are recorded in order.

**Resting state.** Every row fully opaque and legible, sitting at its final
position or a few pixels off it. This is the same contract `motion.tsx`'s
`Reveal` already implements — reuse it with a `delay` per row rather than writing
a second mechanism.

**Reduced motion.** `motion-reduce:transition-none`; all rows land at once.
This is the **one exception** to the blunt global reduced-motion rule discussed
in §2.4: a stagger implemented as `transition-duration: 0.01ms` is correct, but
the *delays* must also be zeroed or reduced-motion users watch a 450ms staircase
of instant jumps. Zero `transition-delay` in the same block.

---

### 5.7 — Ambient life in CSS keyframes, never in a JS loop

**Mechanic.** Linear runs 545 concurrent animations and gates **two** elements.
Its background dot field is a 5×5 grid where **each cell has its own named
keyframe rule** — `grid-dot-3-2-pong`, three behaviour families deep (`upDown`
2,800ms, `pong` 1,600ms, `agent` 3,200ms), all `linear`, all `infinite`, **75
generated keyframe blocks and zero JavaScript**.

rootmail already has the right primitive: `line-travel` moves only
`stroke-dashoffset` on a stroke that is already fully drawn. Extend the same way —
generate per-node keyframe rules in the Tailwind config rather than driving
anything from `requestAnimationFrame`.

**The truth it demonstrates.** That the system is *watching* — an in-flight
segment, an hourly re-check pending.

**Resting state.** A frozen CSS animation is a **still frame of already-drawn
content**. A frozen rAF loop is a component that never initialised. That
difference is the entire reason to prefer CSS here, and it is why this codebase's
two shipped bugs were both JS-driven.

**Reduced motion.** `animation-play-state: paused` — **not**
`animation-duration: 0.01ms`, which strobes an infinite animation. Lenny's ships
exactly this fix as a two-line addendum to the global nuke; copy both lines.

---

### 5.8 — "One message, N views" as a tab strip

**Mechanic.** Resend's 29 tabs in three groups (13 languages, 9 frameworks, 4
template filenames), each rendering the *same* call. Wispr does the passive
version — the same sentence at three tones, all three on screen at once.

rootmail's version is **one message, four views**:

```
[ The line ]  [ Audit trail ]  [ JSON ]  [ Proof bundle ]
```

Same `msg_…`, four renderings. And steal Resend's naming detail: **tab labels are
artifacts, not categories** — `user-welcome.tsx` rather than "Welcome". Ours would
be `msg_8Kd2P1.json`, `proof-msg_8Kd2P1.sig`.

**The truth it demonstrates.** §6's "no two front doors that are different
products" — the operator's line and the developer's JSON are the *same record*,
and the tab strip proves it in one gesture instead of a paragraph.

**Resting state.** Tab 1 (`The line`) fully rendered server-side. The other
panels are in the DOM — `hidden`, not `opacity: 0` — so they are reachable by
find-in-page and by a screen reader, and no panel depends on a frame ever running.

**Reduced motion.** No cross-fade between panels at any time; the switch is
instantaneous for everybody. A 100ms fade on a panel swap is the kind of
"middle-tier" motion §9.4 bans.

---

### 5.9 — Section rhythm as a metronome, broken exactly once

**Mechanic.** Linear's four narrative sections measure **1,225 / 1,227 / 1,231 /
1,219px** — a ±6px spread. Wispr establishes a rhythm and then breaks it once,
with a single 6,011px pin.

rootmail's nine sections should land on one repeated height (a `--section-h`
token, ~1,000–1,100px at 1280px wide), with **one** deliberate violation: §5.1's
sticky scene. A rhythm you never break has no emphasis; a rhythm you break four
times has none either.

**Resting state / reduced motion.** N/A — this is layout.

---

### 5.10 — What not to build

- **Do not add GSAP or ScrollTrigger.** The one thing they buy that CSS does not
  is `pin` + `snap` with inertia, and §5.1 argues against the snap on its own
  merits. Framer Motion is already in the tree and Linear ships its entire
  homepage on it.
- **Do not use `animation-timeline: view()` / `scroll()`** as anything but
  progressive enhancement. It reported supported in the Chrome used for these
  measurements, and **none of the four references uses it** — all 545 of Linear's
  animations, all 13 of Resend's and all 18 of Wispr's run on `DocumentTimeline`.
  If it is used, the un-scrolled state must be the finished state.
- **Do not add video.** Resend's five 3D loops are 370–400px of decoration that
  say nothing about email, and all five sit `paused` off-screen anyway.
- **Do not build a control the reader must operate to understand the product.**
  Wispr's two biggest demonstration sections have **zero** interactive elements;
  its tone comparison only *looks* like a slider. Controls are for finding *your*
  case (§5.8), never for reaching the basic claim.
- **Do not fabricate a "live" feed.** See §5.5.

---

## 6. Summary

**The measured comparison:**

| | rootmail | Wispr | Lenny's | Linear | Resend |
|---|---|---|---|---|---|
| Words | **3,006** | 1,670 | 1,127 | 1,448 | 2,155 |
| Height | 11,177 | 15,518 | 8,498 | 9,602 | 12,229 |
| **Words / 1,000px** | **269** | **108** | **133** | **151** | **176** |
| Paragraphs > 25 words | **33** | 14 | 16 | **0** | 27 |
| Interactive | **20** | 74 (71 links) | 76 (50 buttons) | 148 | 112 (29 tabs) |
| Running animations | — | 18 | **3** | **545** | 13 |
| Content invisible at rest | — | the pinned scene (`.flow_w`, `.flow_intro` at `opacity: 0`) | **0** | **2** | **10** |
| Scroll library | — | GSAP ScrollTrigger | **none** | Framer Motion | Framer Motion |

**rootmail is the densest page in the study by a factor of 1.5 over the next
densest, and it is 2.5× Wispr.** The owner's instinct is correct and the cause is
measurable: the site spends its scroll on sentences.

Two findings invert the obvious reading of the brief:

1. **Wispr's hero has no entrance animation at all.** Filtering every element in
   the hero for `opacity !== 1 || transform !== none` returns an empty set. What
   makes a stranger want to keep scrolling is a *composed first frame*, not a
   reveal.
2. **Motion density and content-gating are independent.** Linear runs 545
   animations and hides two elements. Resend runs 13 and hides ten — including
   its entire deliverability grid. `00-PHILOSOPHY.md` §6 is not a constraint that
   costs us polish; it is what the best-executed reference already does.

**The single mechanic to bet on: §5.1 — the sticky progress→state scene.** It is
the only pattern that attacks the 269-words-per-1,000px number structurally, it
runs on `position: sticky` and one `IntersectionObserver` with no new dependency,
its resting state is the *finished record* (the most persuasive frame anyway), and
its subject — a line where `delivered` is solid and `opened` stays hollow — is the
one asset on this list that a competitor cannot copy without admitting what they
cannot observe.

