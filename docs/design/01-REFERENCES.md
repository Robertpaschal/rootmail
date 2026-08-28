# 01 — References: a forensic teardown of five authored products

**Status: research, downstream of `00-PHILOSOPHY.md`.** The direction is already
decided — the line, warm paper, ink, colour reserved for state, Inter Tight +
IBM Plex Mono, radius 0.25rem. Nothing here reopens that. This document exists to
supply the **numeric craft** that makes that direction excellent instead of
merely correct, and to say honestly where a reference proves part of it wrong.

Every value below was read out of the live page with `getComputedStyle` /
`document.fonts` on 2026-08-26/27 at a 1440×900 viewport. Nothing here is
recalled or inferred from memory. Where a value is a judgement rather than a
measurement it is marked *(judgement)*.

Stack constraint for every recommendation: **Next.js App Router, Tailwind v3,
hand-written shadcn (new-york), Google Fonts.** Anything that needs more than
that is flagged.

---

## 1. wisprflow.ai — warmth without whimsy

### Thesis
*A tool that removes friction should feel like good paper and a good pen, not
like a dashboard* — proven by a cream ground, a 96px Garamond headline, and a
homepage whose main visual is the product's own before/after output.

### Typography — measured

| Role | Family | Size | Weight | Tracking | Leading |
|---|---|---|---|---|---|
| h1 | **EB Garamond** | 96px | 400 | −2.88px (**−0.03em**) | 91.2px (**0.95**) |
| h2 (section) | EB Garamond | 40–48px | 400 | −1.2 / −1.44px (−0.03em) | 38–45.6px (0.95) |
| Body | **Figtree** | 18px | **500** | normal | 23.4px (**1.30**) |
| Eyebrow | Figtree | 14px | 500 | **+1.12px (+0.08em)** uppercase | — |
| Button label | Figtree | 13px | 600 | normal | 13px (1.0) |

Loaded faces: `Figtree` 400/500/600/700, `EB Garamond` 400 + 400 italic. That is
**two families, five weights, total.** Mono is declared in the stylesheet
(`JetBrainsMono`, `IBM Plex Mono`, `Monaspace Neon`) but reports `unloaded` — it
is never actually used on the marketing page.

Three findings that matter:

1. **There is a display face, and it is a serif at 400 weight.** The entire
   authored feeling of this page comes from one decision: the headline is not a
   heavier grotesque, it is a *lighter* old-style serif at enormous size. Weight
   is not how they get presence; **size and tightness** are.
2. **Leading below 1.0 at display size.** 91.2/96 = 0.95. This is the single
   most copyable number on the page — two lines of headline read as one drawn
   object rather than two rows of text.
3. **Body is weight 500, not 400, at line-height 1.30.** Tight for body copy.
   Combined with the cream ground it reads *printed*, not *rendered*.

### Colour — measured

```
ground        rgb(255,255,235)  #FFFFEB   warm cream, 49 elements — the page
surface-2     rgb(228,228,208)  #E4E4D0   inset panels
ink           rgb( 26, 26, 26)  #1A1A1A   2,880 elements carry this colour
ink-muted     rgba(26,26,26,.7)           45 elements
rule          rgb(209,209,193)  #D1D1C1   1px, 20 elements
accent lilac  rgb(240,215,255)  #F0D7FF   the primary button fill
accent orange rgb(255,108,76)   #FF6C4C
accent amber  rgb(255,169,70)   #FFA946
accent pink   rgb(255,188,242)  #FFBCF2
deep green    rgb(  3, 79, 70)  #034F46
```

The census is the point: **ink is used 2,880 times; the loudest accent is used
55 times.** Colour is rationed roughly 50:1 against ink. There is no dark mode —
the page commits to one look and inverts *sections* to `#1A1A1A` instead
(the logo strip and the testimonial block), so "dark" is a compositional device,
not a user preference.

### Surface
- **The whole page renders exactly ONE box-shadow:** `rgba(0,0,0,0.1) 1px 1px 3px 0`,
  on a single element. Separation is done with a **1px `#D1D1C1` rule** (20 uses)
  and a ground shift to `#E4E4D0`, never with elevation.
- The primary button is `2px`-family drawn: `1.5px solid #1A1A1A`, `border-radius: 8px`,
  fill `#F0D7FF`, no shadow. It looks **drawn**, not raised.
- `2px solid #1A1A1A` appears 7 times — the "hand-drawn outline" motif.
- Radius is plural and deliberate: `7px`/`8px` for controls, `999px` for pills,
  `16px`/`32px`/`48px` for large media containers. Small things are square-ish,
  big things are round.

### Density & rhythm
Content column **1240px** (38 elements share that exact width). Inner prose
column 835px. Section vertical padding is mostly 0 with spacing carried by the
content blocks; the one measured explicit rhythm is `100px` top / `32px` bottom
on the closing CTA and `80px` bottom on the logo strip.

### Motion
Three infinite animations only: `logoTicker1 40s linear infinite` (marquee),
`flowSpin 1.6s linear infinite`, `flowPolish 3.2s ease-in-out infinite`.
Interaction easing is dominated by one curve used 148 times:

```
transition: opacity .2s ease, transform .28s cubic-bezier(0.34, 1.56, 0.64, 1);
```

That `1.56` overshoot is the site's entire personality in a single number — it is
what makes the page feel friendly rather than corporate. A secondary, sober
curve `cubic-bezier(0.4, 0, 0.2, 1)` at `.15s` handles utility transitions. The
accordion uses `height .45s cubic-bezier(0.34,1.56,0.64,1)`.

### Signature moves (logo cropped, still identifiable)
1. **Cream ground + near-black ink + one lilac fill.** No white anywhere.
2. **Old-style serif at 96px / 0.95 leading / −0.03em** against a 500-weight
   sans body.
3. **The hero visual is the product's own output, twice** — the raw rambling
   transcript and the cleaned version, side by side, with the machine's reasoning
   labelled in situ: *"Filler identified / Correction identified / Repetition
   identified."*

### Narrative structure
1. **"What is it?"** — h1 + one sentence + one button + platform line.
2. **"Show me it working"** — the before/after transcript. Not a screenshot: the
   actual artifact, annotated with why each edit happened.
3. **"Who else?"** — logo strip, inverted to ink ground.
4. **"How much better?"** — Keyboard 45 wpm vs Flow 220 wpm, both typing live,
   side by side. A *comparison that runs*, not a bar chart.
5. **"How does it work?"** — three named stages (Speak naturally / Edits as you
   speak / Use it anywhere).
6. **"Will it bend to me?"** — tone slider (Formal → Casual → Very casual) showing
   the same sentence three ways; custom vocabulary; 100+ languages.
7. **"Is my data safe?"** — "Your voice stays yours."
8. **Testimonials → FAQ → close.**

**How they dodge the wall-of-cards:** sections 2, 4 and 6 are all the *same*
device — one input rendered two or three ways, so the reader compares rather than
reads. There is no 3×4 grid of icon+title+sentence anywhere on the page.

---

## 2. lennysproductpass.com — the drawn border, and one face with one job

### Thesis
*A list of 35 offers is boring; a list of 35 offers drawn in 2px black ink on
tan card stock with the price handwritten in the margin is a scrapbook* — proven
by 114 identical 2px black borders and exactly one box-shadow.

### Typography — measured

| Role | Family | Size | Weight | Tracking | Leading |
|---|---|---|---|---|---|
| h1 | **degularBold** | 50px | 400 (the face is bold) | normal | 52.5px (1.05) |
| h2 | degularBold | **64px** | 400 | normal → −1.28px on one | **64px (1.00)**, 58.88px (0.92) on one |
| h3 | degularBold | 28px | 400 | normal | **24px (0.86)** |
| Lead p | Degular-Medium | **26px** | 400 | normal | 35.88px (1.38) |
| UI/nav | Geist | 16px | 400 | normal | 24px (1.5) |
| **Value figure** | **FaveHandPro** (script) | 48–50px | 400 | — | — |

Loaded: Degular Bold + Medium, FaveHandPro, Geist. `Geist Mono` is declared and
**never loaded — zero elements on the page render in mono.**

The finding that matters: **the handwriting face is used for exactly one thing —
the dollar value.** `$240 value`, `$264 value`, `$216 value`, always at 48–50px,
always black. It is not decoration sprinkled around; it is a **semantic
assignment**: one face means "this is what it's worth." That is precisely the
discipline `00-PHILOSOPHY.md §5.2` asks of IBM Plex Mono ("this is a recorded
value, not prose") — and this page is proof the device works, because you can
find every price on the page without reading a word.

Leading is set **at or below 1.0** for all display type (64/64, 24/28). Same
lesson as Wispr: headline blocks are objects, not paragraphs.

### Colour — measured
```
ground        rgb(201,154,118)  #C99A76   tan / kraft — 408 elements
ink           rgb(  0,  0,  0)  #000000   pure black, 2,792 text elements
card          rgb(255,255,255)  #FFFFFF   49
peach tints   #FFE6CF #FFDBB8 #FDD4B5 #FFF1E8   section grounds
brown deep    #8C4100                     11
orange        #F6891F                      11
inverted      rgb(0,0,0) as ground        272 elements
muted text    rgb(86,86,86) / rgb(47,47,47)
```
**Only six distinct text colours exist on the entire page**, and 2,792 of ~2,900
coloured elements are pure `#000`. Everything else is a *ground*. This is the
same 50:1 ratio as Wispr, arrived at independently.

No dark mode. Like Wispr, "dark" is a composition tool — 272 elements sit on a
black ground as a deliberate inverted band.

### Surface — the important one
- **`2px solid #000` appears 114 times.** It is the only border on the page
  (the only other is a 1px transparent).
- **Exactly ONE box-shadow renders on the whole page**, and it is worth quoting
  in full because it is a *lit-from-above* recipe, not a drop shadow:

  ```
  0 8px 24px 0 rgba(0,0,0,0.04),  inset 0 1px 0 0 rgba(255,255,255,0.22)
  ```
  Tailwind: `shadow-[0_8px_24px_0_rgba(0,0,0,0.04),inset_0_1px_0_0_rgba(255,255,255,0.22)]`

  The `inset 0 1px 0` white top hairline is what makes a surface read as a
  physical edge catching light. The outer shadow is at **4% opacity** — almost
  nothing. Depth comes from the inset, not the drop.
- Radius is **large and consistent**: 30px (106 uses), 24px (35), 100px/9999px
  for pills. Cards are soft; the border is hard. That contrast — hard 2px stroke,
  soft 30px corner — is the whole surface language.
- A `NEW` badge is rotated: `matrix(0.866025,0.5,-0.5,0.866025,0,0)` = **rotate(30deg)**
  — the only rotation on the page, used once per new item.

### Density & rhythm
Card column 610px (73 elements). Section container 1332px, inner 1272px.
Section padding is a strict, small vocabulary: **48px / 56px / 64px** top and
bottom. Notably *tight* — this page does not use the 120px+ air that generic SaaS
pages use, because its content is a catalogue and air would make it feel sparse.

### Motion
`transform .2s cubic-bezier(0,0,0.2,1)` × 70 — the standard ease-out, no
overshoot. Colour transitions at `.15s` and `.12s`. Marquees at 36–60s linear.
A loader dot animates with **`steps(2)`** (`preauth-loader-dot 1.05s steps(2) infinite`)
— a deliberately mechanical, non-smooth tick.

### Signature moves
1. **2px black border, 30px radius, tan ground, no shadow.** Card stock.
2. **A script face reserved for the price and nothing else.**
3. **A 30° rotated `NEW` sticker** as the only rotation in the system.

### Narrative structure
1. h1 with the number and the parenthetical proof — *"Get 35 premium AI and
   product tools free for a year (worth over $40,000!)"*.
2. Scarcity line — "Codes are limited."
3. **The catalogue itself**, tier by tier: Insider-exclusive offers →
   Annual + Insider offers. Each item: name, one sentence, handwritten value,
   `Claim`.
4. Mid-catalogue upsell — "Want every offer? Upgrade to Insider."
5. Pricing.  6. FAQ.  7. The newsletter it belongs to.

**On the wall-of-cards question, be precise:** this page *is* a wall of cards —
and it works, because **the cards are the product, not a description of the
product.** 35 offers is a catalogue; a catalogue is legitimately a grid. The
failure mode `00-PHILOSOPHY.md §6` bans is twelve cards describing *features* of
one product, which is a grid pretending to be a catalogue. The test is: **could
a reader buy one row?** If yes, grid. If no, ruled table.

---

## 3. linear.app — the half-pixel, the 510, and colour as status only

This is the reference that most closely rehearses `00-PHILOSOPHY.md`'s own laws
in the opposite palette. Read it as a proof that the ink/state discipline works
at scale, and mine it for numbers.

### Thesis
*Craft is not ornament; it is the sum of a hundred sub-pixel decisions nobody can
name individually* — proven by 417 CSS custom properties, 0.5px borders, and a
font-weight of 510.

### Typography — measured

| Role | Family | Size | Weight | Tracking | Leading |
|---|---|---|---|---|---|
| h1 | **Inter Variable** | 64px | **510** | −1.408px (**−0.022em**) | 64px (**1.00**) |
| h2 | Inter Variable | 48px | **510** | −1.056px (**−0.022em**) | 48px (**1.00**) |
| Body | Inter Variable | **15px** | 400 | −0.165px (**−0.011em**) | 24px (**1.60**) |
| Nav / UI | Inter Variable | 13px | 400 / 510 | normal | — |
| Mono | (system mono) | small | — | — | — |

Four things to take literally:

1. **Weight 510, not 500 or 600.** Inter Variable is a variable font, so Linear
   picks a weight that does not exist as a static cut. It is the difference
   between "medium" and "just past medium" — enough to hold a 64px headline
   without ever looking bold. **Inter Tight is also a variable font on Google
   Fonts**, so `font-weight: 510` is available to rootmail today. This is a free
   upgrade over the philosophy's current `600`, which will read heavier and more
   generic. *Recommend testing 510–540 for headlines.*
2. **Tracking is a constant ratio, not a constant pixel value:** −0.022em at
   display, −0.011em at body, −0.01em at mini. The philosophy currently specifies
   a flat `-0.02em`; Linear's evidence says **halve it for body and leave micro
   text alone.**
3. **Display leading is exactly 1.00.** Third reference in a row at ≤1.0.
   Body leading is 1.60 — a *wide* gap between display and body leading is
   itself the signature.
4. **`font-feature-settings: "cv01", "ss03"`** on the root element. `cv01` is
   Inter's alternate `1` (no bottom serif); `ss03` is the round-comma/quote set.
   Two one-word declarations that make Inter stop looking like the default. This
   is one line in `globals.css` and rootmail should ship it. **Inter Tight
   supports both.**

### Colour — measured
```
--color-bg-primary     #08090A     page
--color-bg-secondary   #1C1C1F
surface (measured)     #0F1011     37 elements
--color-text-primary   #F7F8F8     3,081 elements
--color-text-secondary #D0D6E0       213
--color-text-tertiary  #8A8F98       469
text-quaternary        #62666D       287
--color-line-primary   #37393A
--color-line-secondary #202122
--color-line-tertiary  #18191A
```
Saturated colour appears only as **status tints at 7–12% alpha**:
`rgba(0,255,5,0.10)` ×19, `rgba(39,166,68,0.07)` ×7, `rgba(243,78,82,0.10)` ×7,
`rgba(255,0,0,0.12)` ×6 — green for done, red for blocked. Chromatic *text*
(#F79CE0 pink ×45, #F7BF8B orange ×22, #8FA6FF ×16, #FFDF9F, #83DCDC) appears
only inside product screenshots, where it is label colour — i.e. data.

**This is exactly the philosophy's law ("if a colour appears, it is asserting
something about state") already running in production at Linear's scale.**
Note the *technique*: state colour is delivered as a **10% alpha tint of the hue
over the ground**, not as a solid fill — which is how it stays legible on both a
near-black and a near-white ground without a second palette.

### Surface — the recipes worth copying verbatim

- **Borders are 0.5px, not 1px.** `0.5px solid rgba(255,255,255,0.08)` × 56 is
  the dominant border in the system. On a 2× display this is a true hairline;
  1px looks chunky next to it. Tailwind: `border-[0.5px] border-white/[0.08]`.
- **The "lit from above" ring** — three variants measured:
  ```
  inset 0 0 0 0.5px rgba(255,255,255,0.08)                    /* the ring */
  inset 0 0 0 1px   rgba(255,255,255,0.05)
  inset 0 0 0 1px rgba(255,255,255,.03),
  inset 0 1px 0 0 rgba(255,255,255,.04),
  0 0 0 1px rgba(0,0,0,.6),
  0 4px 4px 0 rgba(0,0,0,.1)                                   /* the full button */
  ```
  Note the top highlight is **0.04, not 0.08** — half what most people guess.
  Tailwind: `shadow-[inset_0_0_0_1px_rgba(255,255,255,.03),inset_0_1px_0_0_rgba(255,255,255,.04),0_0_0_1px_rgba(0,0,0,.6),0_4px_4px_0_rgba(0,0,0,.1)]`
- **The five-layer micro-shadow** (used on floating light-ground elements):
  ```
  0 8px 2px rgba(0,0,0,0),   0 5px 2px rgba(0,0,0,.01),
  0 3px 2px rgba(0,0,0,.04), 0 1px 1px rgba(0,0,0,.07),
  0 0px 1px rgba(0,0,0,.08)
  ```
  Five layers, none above 8% — a physically-plausible falloff instead of one
  blurry smear. **This is the shadow rootmail should use if it uses any**, because
  it works on a warm paper ground where a single dark blur turns grey and muddy.
- Named shadows: `--shadow-low: 0 2px 4px #0000001a`, `--shadow-medium: 0 4px 24px #0003`,
  `--shadow-high: 0 7px 32px #00000059`. Three, named by elevation.
- Radius: 4px and 8px are **named tokens** (`--radius-4`, `--radius-8`); 9999px
  ×76 for pills; `50%` ×28 for avatars; `12px 12px 0 0` ×7 for panel tops.
  Note `2px` ×9 and `2px 0 0 2px` ×4 — the *segment* radius on grouped controls.

### Density & rhythm
**Section padding is `128px` top and bottom, uniformly**, on a `1344px`
container. `--page-max-width: 1024px` governs prose. Body prose column 672px.
Rhythm is one number repeated, not a bespoke value per section.

### Motion
- The dominant transition is `color .1s cubic-bezier(.25,.46,.45,.94)` — **216
  elements**. 100ms. Hover feedback is effectively instantaneous.
- Two named curves: `--ease-out-quad: cubic-bezier(.25,.46,.45,.94)` and
  `--ease-in-out-quart: cubic-bezier(.77,0,.175,1)`.
- The long one: `transform .7s cubic-bezier(0.32,0.72,0,1)` × 20 and
  `stroke .7s` × 10 — a 700ms decelerating curve for scroll-driven scene changes
  and, notably, for **animating an SVG `stroke`**. That is the exact mechanic
  rootmail's line needs.
- `background .4s ease-out` × 25 for ground crossfades.

**Read the ratio:** interaction = 100–160ms; narrative = 700ms. Nothing sits in
between. There is no "0.3s all ease".

### Signature moves
1. **0.5px hairlines + a 1px inset white ring at 3–8% alpha.** Surfaces are
   defined by *edges catching light*, never by drop shadow.
2. **Weight 510 + −0.022em + leading 1.00** on every heading, at every size.
3. **Mono reserved for identifiers.** Measured in the wild: `vehicle_state`,
   `master`, `ride/drv-364-reset-dimmed-rows`. Field names, branches, refs —
   never prose, never numbers-as-prose.

### Narrative structure
1. Hero: one claim, product shot.
2. **Four capability sections, each 128px-padded and each titled as a two-line
   noun phrase**: *Intake and integrations* / *Planning and monitoring* /
   *AI and automations* / *Build, review, and ship*. Each is a full-bleed section
   with a real UI, not a card.
3. A single pull-quote about craft.
4. Close: "Built for the future. Available today."

**How they dodge the wall of cards:** there are **four** sections, not twelve,
and each one is *the product doing the thing*, at full section width. The
lifecycle order (intake → plan → build → ship) means the four sections are a
sequence, so the reader is walking a line rather than scanning a grid.

---

## 4. resend.com — the nearest neighbour, and the one to beat on honesty

Read this section twice. Resend is the reference that shares rootmail's *domain*,
which means it is the only one whose choices can be wrong for us in an
interesting way.

### Thesis
*Email infrastructure is a developer tool, so make the code the hero and dress it
in editorial type* — proven by a 96px Domaine serif headline over a `commitMono`
code block, on black.

### Typography — measured

| Role | Family | Size | Weight | Tracking | Leading |
|---|---|---|---|---|---|
| h1 | **Domaine** (high-contrast serif) | 96px | 400 | −0.96px (−0.01em) | 96px (**1.00**) |
| h2 | **ABC Favorit** (grotesque) | 56px | 400 | **−2.8px (−0.05em)** | 67.2px (1.20) |
| h3 / card title | ABC Favorit | 20px | 400 | normal | 26px (1.30) |
| Body | **Inter** | 18px | 400 | normal | 27px (1.50) |
| Code | **commitMono** (`--font-mono`) | 14px | — | — | — |
| Button | Inter | 14px | 600 | — | — |

**Four families.** Note what each is *for*: serif for the single largest claim,
grotesque for section titles, Inter for prose, mono for code. Nothing overlaps.

**The tracking finding is the surprising one:** −0.05em on section headings, five
times tighter than Linear's −0.022em, and yet the leading is *loose* at 1.20.
Very tight tracking + loose leading is the "editorial masthead" setting. The h1,
by contrast, is barely tracked at all (−0.01em) because a high-contrast serif
falls apart when you crowd it. **Tracking is a function of the face, not a global
constant** — which is the correction to make to `00-PHILOSOPHY.md`'s flat −0.02em.

### Colour — measured
```
text-primary   rgb(240,240,240)  #F0F0F0   816 elements
text-2         rgb(235,236,237)            332
text-muted     rgb(161,164,165)  #A1A4A5   398
text-muted-2   rgb(160,160,160)            216
text-dim       rgb( 70, 74, 77)  #464A4D    84
ground         rgb(  0,  0,  0)  #000000    22
panel          rgb( 11, 14, 20)  #0B0E14
ACCENT         rgb(255,255,146)  #FFFF92   pale yellow — 15 text uses, 1 border
```
621 CSS custom properties, a full Radix scale expressed in **`color(display-p3 …)`**
— wide-gamut. Their hairline is not neutral: `1px solid color(display-p3 .882 .949 .996 / .183)`
is a **cool blue-white at 18%**, not `rgba(255,255,255,.08)`. On a pure-black
ground a neutral hairline reads muddy; tinting it toward the ground's complement
keeps it crisp. State tints exist in the same 11–22% alpha band as Linear:
green `p3(.376 .996 .655 / .114)`, red `p3(1 .169 .271 / .156)`, amber
`p3(1 .6 0 / .118)`, violet `p3(.494 .337 .996 / .202)`.

Accent discipline is extreme: **one colour (#FFFF92), fifteen times, on a page
with 2,000+ coloured elements.**

### Surface
- The dominant "shadow" is **a 1px ring, not a shadow**: `0 0 0 1px rgba(24,25,28,0.88)`,
  60 uses. Same conclusion as Linear — surfaces are rings.
- `0 0 0 8px rgb(0,0,0)` × 5 — an **8px solid-black knockout ring**, used to punch
  an element cleanly through a line or grid behind it. Cheap, precise, and exactly
  the trick rootmail needs where a station node sits on top of the line: give the
  node a ring in the ground colour so the stroke does not show through it.
  Tailwind: `shadow-[0_0_0_8px_theme(colors.paper)]`.
- Buttons: `2px solid rgba(255,255,255,0.05)`, `border-radius:16px`, transparent
  fill. Even the primary CTA is an outline.
- Radius vocabulary: `9999px` (198), `16px` (61), `6px` (54), `8px` (29), `4px` (20),
  plus split radii `8px 0 0 8px` for segmented controls.

### Density & rhythm
**`96px` top and bottom on every content section, without exception** (11 of 11
measured). Container `1280px`, prose columns 598–600px. One number, repeated.

### Motion
Mostly Tailwind's defaults: `.15s`/`.2s cubic-bezier(0.4,0,0.2,1)`. Entrances are
slow and one-shot: `hero-text-slide-up-fade 1s ease-in-out`, `open-scale-up-fade
1.5s`, `webgl-scale-in-fade 1s`. Ambient: `scroll-x 180s linear infinite`,
`rotate 30s linear infinite`. Same two-tier structure as Linear — fast for
interaction, slow for narrative, nothing in between.

### Signature moves
1. **Serif h1 over a mono code block, on black.** The single most identifiable
   frame on the page.
2. **The live event ledger** — a scrolling list of real-shaped events:
   `Delivered · Aug 27 01:59:00 · to liam@figma.com with subject Magic Link · on Outlook · running on macOS`.
3. **One pale-yellow accent** and nothing else chromatic outside product shots.

### Narrative structure
1. Hero — "Email for developers." One sentence, two buttons.
2. Trust line + logo marquee.
3. **"Integrate this morning"** — the SDK code block with 13 language tabs. The
   hero visual is the API call.
4. **"First-class developer experience"** — HTTP 200 responses streaming with
   real message ids; then *Test mode*; then *Modular webhooks* with the event
   ledger.
5. "Write using a delightful editor" — the composer.
6. "Go beyond editing" — contacts, analytics.
7. "Develop emails using React."
8. **"Reach humans, not spam folders"** — deliverability.
9. "Everything in your control" — the residual feature grid, deliberately last.
10. Testimonials → "Email reimagined. Available today."

**How they dodge the wall of cards:** sections 3–8 each lead with *one running
artifact* (a code block, a response stream, an event ledger, an editor). The
generic feature grid is quarantined into section 9, after the argument is already
made. That is a reusable structural rule: **the grid is allowed, but only after
you have earned it, and never as the explanation.**

### Where Resend is wrong, and it is rootmail's opening

In the "Modular webhooks" ledger, these five rows are rendered in **identical
visual weight**:

```
Delivered   ·  to liam@figma.com          ·  subject Magic Link
Clicked     ·  from mia@xerox.com         ·  on Welcome
Opened      ·  from charlotte@yahoo.com   ·  subject Magic Link
Complained  ·  to emma@yahoo.com          ·  feedback Spam
Bounced     ·  to noah@figma.com          ·  type Spam
```

`Delivered` is a provider confirmation. `Opened` is a tracking pixel that fires
roughly a third of the time for a mail client prefetching an image. `Bounced` is
a hard fact. They are drawn the same. This is `00-PHILOSOPHY.md §1`'s "founding
lie" caught in the act, on the site of the best-designed company in this
category — and it is proof that the **hollow node is not a stylistic flourish but
the single differentiating visual claim rootmail can make.** If our ledger draws
`Opened` hollow and `Delivered` solid, and Resend's does not, a buyer who has
been burned by numbers can see the difference from across the room.

Second, softer point: Resend's site is *entirely* about the developer. rootmail
has decided on two front doors (`00-PHILOSOPHY.md §6`). Do not import the
"code block as hero" wholesale; the code block can be **one station on the line**,
not the line itself.

---

## 5. mailchimp.com — the maximalist pole, measured fairly

The temptation is to dismiss this. Don't. Mailchimp is craft-heavy — a licensed
serif, a warm-black ink, a real illustration system — and it is still the thing
`00-PHILOSOPHY.md` was written against. Being specific about *why* is more useful
than sneering.

### Thesis
*Email marketing is intimidating, so make the software feel like a friendly
brand that likes you* — proven by a spring easing with an overshoot factor of
**2.5** and a homepage whose every claim is prefixed "up to."

### Typography — measured

| Role | Family | Size | Weight | Tracking | Leading |
|---|---|---|---|---|---|
| h1 | **Means Web** (serif) | 64px | 400 | −1.2px (−0.019em) | 76.8px (**1.20**) |
| h2 | Means Web | 40–48px | 400 | −0.5px / normal | 40px (1.00) / 56px (1.17) |
| h3 | Means Web | 24px | 400 | normal | 32px (1.33) |
| Nav h2 | **Graphik Web** | 24px | 700 | normal | 32.4px |
| Body | Graphik Web | **13px** | 400 | normal | 17.55px (1.35) |

**A third serif headline in five references.** Wispr (EB Garamond), Resend
(Domaine), Mailchimp (Means). Linear and Lenny are the sans exceptions — and
Lenny's Degular is a *display* grotesque with almost no sans-ness left in it.
Four of five references use a face at the top of the page that is not their UI
face. This is the strongest single pattern in the whole study.

Note also: Mailchimp's display leading is **1.20**, the loosest of the five. Loose
display leading is one of the specific things that makes a page read "corporate
web" rather than "authored" — the headline becomes a paragraph.

Body at **13px** is a genuine finding and a genuine failure: it is smaller than
Linear's 15px and much smaller than Wispr's 18px/500 and Resend's 18px. A 13px
body on a 1280px page is a page whose copy nobody is meant to read closely.

### Colour — measured
```
ink (warm)        rgb( 35, 30, 21)  #231E15   727 elements — NOT neutral black
pure black        rgb(  0,  0,  0)            1,568 (mostly nav)
peacock           rgb(  0, 78, 86)  #004E56   257 text uses
cavendish yellow  rgb(255,224,27)   #FFE01B   23 backgrounds, 1 text use
cool gray ground  rgb(240,244,246)  #F0F4F6   34
white             #FFFFFF                     96
blue link         rgb( 56, 96,190)             7
rule              rgb(219,217,210)  #DBD9D2   1px ×22, 2px ×10
```
**Take the warm ink seriously.** `#231E15` is a brown-black, and it is why
Mailchimp's white pages don't feel like a spreadsheet. `00-PHILOSOPHY.md` already
specifies a warm paper ground (`40 20% 97%`) with a *cool* ink (`222 24% 10%`).
That is a mismatch: a warm ground under a blue-black ink reads slightly grubby.
**Recommend warming the ink to roughly `30 15% 10%`** so ground and ink share a
temperature. This is the one place a reference should change a value in the
constitution.

The yellow is used almost exclusively as a **ground**, once as text. Even the
maximalist rations its brand colour — the difference from Linear is not *how
much* colour but *what the colour is doing*: Mailchimp's yellow asserts brand,
Linear's green asserts state.

### Surface
- Radius is **4px (184 uses), 3px (57), 2px (20)** — small. Then 16/24/26/30/32px
  for illustration containers. **The maximalist's radius is already 4px**, which
  means `00-PHILOSOPHY.md`'s drop to `0.25rem` is *not by itself* differentiating.
  What differentiates is the combination: 4px radius + hairline rule + no drop
  shadow. Mailchimp has the radius and neither of the other two.
- Two large soft drop shadows dominate: `0 4px 12px rgba(36,28,21,0.12)` ×34 and
  `0 15.547px 44px rgba(0,0,0,0.086)` ×34. Note `15.547px` — an unrounded value
  from a design-tool export, which is a small tell of a system assembled rather
  than authored.
- `0 0 0 1px rgb(35,30,21)` ×19 — a hard ink ring giving the "sticker/cutout" look.

### Density & rhythm
Container 1280px on a 1440px page. Section padding measured at `0/80px` around
the mega-menu. The page's real density problem is not padding — it is that the
main content is a **four-item feature block where each item carries a title, a
sentence, three bullets and a link**, which is 4 × 6 = 24 pieces of copy competing
at once.

### Motion
```
transform, box-shadow  .3s  cubic-bezier(0.5, 2.5, 0.7, 0.7)   ×18
background-color       .15s ease                               ×194
box-shadow             .2s  ease                               ×34
```
**The overshoot coefficient is 2.5.** Wispr's is 1.56; Linear's curves have none.
That single number is the difference between "warm" and "cute", quantified. A
control that springs 2.5× past its target is *performing delight at you*.

### Signature moves
1. Cavendish yellow ground + warm-black serif headline.
2. Freddie / spot illustration everywhere.
3. The 2.5-overshoot spring on hover.

### Narrative structure
1. Hero: *"Turn ideas into emails that connect"* + AI mention + Start Free Trial
   + a star rating.
2. **"Recommended for your business" / "Customize my experience"** — a
   personalisation quiz *above* the product explanation.
3. Four feature blocks: Design with ease / Get more sales / Reach your audience
   on any device / Connect all your apps.
4. The quiz again, in full ("What's your industry? What are the top 4 things you
   want to achieve?").
5. Case studies → pricing → trial.

**They do not dodge the wall of cards; they replace it with a wall of claims.**
Harvested from one screen:

> "up to a 97% click rate" · "up to 30x ROI" · "Save up to 42% by switching from
> Klaviyo" · "4.5 star rating based on 33,000+ reviews" · "Seamless integration"

Five numbers, **zero windows, zero methods, and four of them are "up to"** — a
construction that is true if it happened once. `00-PHILOSOPHY.md §4` bans
"seamless" and requires that a number arrive with its window; here is the
canonical example of the failure, on the market leader's homepage, today. The
sourcing line (§5.3) is a direct, visible rebuttal of this exact paragraph.

### The position you asked for: is the whimsy actively harmful for rootmail?

**Yes, and specifically at the moment of bad news.**

Whimsy is not neutral tone; it is a claim about the stakes. A bouncing button
says *nothing here can hurt you*. rootmail's core promise —
*"one client's bad list never costs the others"* — is a promise about a
situation where something already went wrong and money is on the line. The
screens that carry that promise are: a client throttled overnight, a domain
suspended after a grace window, a send refused at 0.52% complaints. A product
that springs at 2.5 overshoot on Tuesday cannot be believed on Wednesday when it
tells you it stopped your customer's mail.

There is a second, sharper reason. Our buyer's stated experience is *"suddenly
the reputation of the entire platform collapses"* and nobody could tell them why.
Whimsy is the register in which the black box speaks: "Oops! Something went
wrong" is a whimsical sentence. Charm and opacity are the same gesture — both
substitute a feeling for an account of what happened. So the ban on whimsy is not
a taste preference downstream of the palette; **it is the same rule as the ban on
the un-sourced number**, applied to motion and voice.

What rootmail should take from Mailchimp instead: **warmth is not whimsy.**
`#231E15` warm ink, a serif at the top of the page, and a ground that isn't
white are all warm and all sober. Wispr proves this at 1.56 overshoot; Mailchimp
proves the failure at 2.5. Warmth is a *colour temperature and a typeface*
decision. It is not a motion decision.

---

# What rootmail should steal, and what it must not

Everything below is scoped to Next.js App Router + Tailwind v3 + hand-written
shadcn (new-york) + Google Fonts. Where something needs more, it says so.

## A. Ranked mechanics to steal

### 1. Display leading at 1.00 and below — the cheapest authored signal there is
**Measured:** Wispr h1 96/91.2 = **0.95**. Linear h1 64/64 and h2 48/48 = **1.00**.
Resend h1 96/96 = **1.00**. Lenny h2 64/64 = **1.00**, h3 28/24 = **0.86**.
Mailchimp — the one that reads corporate — is **1.20**.

**Why for rootmail:** the hero is *"Every email you send, and a record of what
happened to it."* At 1.20 that is two rows of text sitting near a line diagram.
At 0.95 it is a block with the same optical density as the 2px line beside it,
and the two read as one drawn object. This is the difference between a headline
that sits *on* the page and one that *is* the page.

```js
// tailwind.config.ts
fontSize: {
  'display-xl': ['4.5rem', { lineHeight: '0.95', letterSpacing: '-0.022em' }], // 72
  'display-l':  ['3rem',   { lineHeight: '1.00', letterSpacing: '-0.022em' }], // 48
  'display-m':  ['2rem',   { lineHeight: '1.05', letterSpacing: '-0.02em'  }], // 32
  'body':       ['0.9375rem', { lineHeight: '1.6', letterSpacing: '-0.011em' }], // 15
}
```

### 2. Weight 510 (verified available) instead of 600
**Measured:** Linear sets every heading at `font-weight: 510` on Inter Variable.

**Verified in-browser for rootmail:** Inter Tight loaded from Google Fonts at
`wght@100..900` renders `Handgloves` at 200px as **400 → 1018.55px, 500 →
1044.54px, 510 → 1047.13px, 540 → 1054.93px, 600 → 1070.52px**. The widths are
continuous and distinct, so **510 is a real weight on Inter Tight, not a rounded
alias.** `00-PHILOSOPHY.md §5.2` currently specifies 600.

**Why for rootmail:** 600 on a tight grotesque is the shadcn default headline and
reads as emphasis. The product's voice is a witness giving an account, not
someone raising it. 510–540 holds a 72px headline without shouting.

**Ship:** `Inter_Tight({ subsets:['latin'], axes: [] })` via `next/font/google`
(the variable version loads by default when you omit `weight`), then
`font-weight: 510` in the display classes. Test 510 and 540 side by side at 72px.

### 3. Surfaces are rings and hairlines, not drop shadows
**Measured, three independent confirmations:**
- Linear: `0.5px solid rgba(255,255,255,0.08)` × 56, and the ring
  `inset 0 0 0 0.5px rgba(255,255,255,0.08)`.
- Resend: `0 0 0 1px rgba(24,25,28,0.88)` × 60 — a ring used *as* the shadow.
- Wispr: **one** box-shadow on the entire page; separation done with
  `1px solid #D1D1C1` and a ground shift.
- Lenny: **one** box-shadow, and it is mostly the inset —
  `0 8px 24px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.22)`.
- Mailchimp, the outlier: two big soft drops at 34 uses each.

**Why for rootmail:** a drop shadow on warm paper turns grey and reads dirty; and
more importantly, elevation is a *claim about hierarchy* that competes with the
line, which is rootmail's only hierarchy. Records are flat. Ledgers are flat.

**Ship** (light ground):
```
.rm-surface { @apply rounded bg-paper border-[0.5px] border-rule; }
/* the one allowed lift, for a genuinely floating popover only: */
shadow-[0_8px_2px_rgba(0,0,0,0),0_5px_2px_rgba(0,0,0,.01),0_3px_2px_rgba(0,0,0,.04),0_1px_1px_rgba(0,0,0,.07),0_0_1px_rgba(0,0,0,.08)]
```
Note `border-[0.5px]` works in Tailwind v3 via arbitrary values and renders as a
true hairline on 2× displays. On 1× it rounds to 1px, which is fine.

### 4. The knockout ring — how a station node sits on a line without a seam
**Measured:** Resend uses `box-shadow: 0 0 0 8px rgb(0,0,0)` × 5 to punch an
element through whatever is behind it.

**Why for rootmail:** this is the single most load-bearing detail in the entire
line system and it is not yet specified. A 8px node centred on a 2px stroke will
show the stroke through any node that is hollow or partially transparent, and any
antialiasing seam will read as a rendering bug on a product whose whole pitch is
precision. Give every node a ring in the **ground** colour.

```
/* solid (witnessed) node */
<circle r="4" fill="var(--witnessed)" stroke="var(--paper)" stroke-width="3" />
/* hollow (inferred) node — ring knocks the line out from under it */
<circle r="4" fill="var(--paper)" stroke="var(--ink)" stroke-width="2" />
```
Draw the knockout in the **ground token, not white** — otherwise it will be
visible the moment a section inverts.

### 5. Per-size tracking, not one global value
**Measured:** Linear ships `--text-regular-letter-spacing: -.011em`,
`--text-mini-letter-spacing: -.01em`, `--title-3-letter-spacing: -.012em`, with
display computing to **−0.022em**. Resend runs **−0.05em** on a grotesque h2 but
only **−0.01em** on a serif h1.

**Why for rootmail:** `00-PHILOSOPHY.md §5.2` specifies a flat −0.02em. Applied to
15px body that is visibly crowded, and applied to 11px mono it is unreadable.
The rule that actually works: **display −0.022em, body −0.011em, mono 0 (never
track a monospace face — you destroy the grid that makes it read as data).**

### 6. `font-feature-settings` on the root — one line, permanent character
**Measured:** Linear sets `--font-settings: "cv01","ss03"` and applies it at the
root; `cv01` is Inter's straight-sided `1`, `ss03` the round quotes/commas.

**Why for rootmail:** the sourcing line (§5.3) is dense with `1`s, and the
default Inter `1` with its bottom serif sits badly in a mono/figure context. This
is one declaration for a permanent, unnameable "someone chose this" quality.

**Caveat — verify visually before shipping.** Character-variant substitutions in
Inter Tight are width-invariant, so the width probe used above cannot confirm
them (`1`, `“”`, and `l` all measured identically with and without the features).
Render `1 0 l “” ,` at 200px with and without `font-feature-settings: "cv01","ss03"`
and eyeball it. If Inter Tight has dropped the `cv` sets, fall back to plain Inter
Tight — nothing else in the system depends on this.

Also add, for the mono: `font-variant-numeric: tabular-nums` on every figure. A
sourcing line whose digits jitter when a count changes is a sourcing line nobody
trusts. Tailwind ships `tabular-nums` as a utility.

### 7. Two motion tiers with an empty middle
**Measured:** Linear — interaction `.1s cubic-bezier(.25,.46,.45,.94)` × 216;
narrative `.7s cubic-bezier(.32,.72,0,1)` × 20, **including `stroke .7s`**.
Resend — `.15s/.2s` interaction, `1s–1.5s` one-shot entrances. Both have
**nothing at 0.3s**, which is where generic sites live (`transition: all .3s ease`).

**Why for rootmail:** "pull the thread" (§5.4) needs the scrub to feel like the
cursor is *attached* to the readout — that is a 100ms colour/opacity change, not
a 300ms tween. And the line drawing itself needs the slow tier. Linear literally
transitions an SVG `stroke` at 700ms with `cubic-bezier(.32,.72,0,1)`; that is
the curve for a dotted DNS segment going solid.

```js
transitionTimingFunction: {
  'rm-quick': 'cubic-bezier(.25,.46,.45,.94)',   // 100ms — hover, focus, scrub
  'rm-draw':  'cubic-bezier(.32,.72,0,1)',       // 700ms — a line resolving
},
transitionDuration: { 'rm-quick': '100ms', 'rm-draw': '700ms' },
```
Ban `duration-300` in review. And per §5.4, wrap the draw tier in
`motion-reduce:transition-none`.

### 8. One repeated section rhythm, not a bespoke value per section
**Measured:** Linear `128px/128px` on 11 of 11 content sections. Resend `96px/96px`
on 11 of 11. Lenny `48/56/64`. Nobody varies it.

**Why for rootmail:** with the site cut to nine sections (§7), an identical
vertical beat is what makes them read as **stations on one line** rather than
nine separate pages stacked. Pick `96px` (`py-24`) at desktop, `56px` (`py-14`)
at mobile, and do not negotiate per section. Container `1280px` (`max-w-7xl`),
prose `672px` (`max-w-2xl`).

### 9. The catalogue test, for the feature-grid ban
**Measured:** Lenny's page is 35 cards and it works; Mailchimp's four blocks with
24 pieces of copy do not; Linear ships four full-width sections; Resend
quarantines its grid to position 9 of 10.

**The rule, stated so it can be applied:** *could a reader act on one row on its
own?* A row you can claim, buy, or click into is a catalogue item and a grid is
correct. A row that only makes sense as evidence for a claim made elsewhere is
prose, and belongs in the ruled six-row table §6 already specifies.

### 10. Warm the ink to match the warm ground
**Measured:** Mailchimp's ink is `#231E15` — hue ≈ 33°, warm. Wispr's is
`#1A1A1A` — neutral, on a warm `#FFFFEB` ground. Linear and Resend are cool ink
on cool ground.

`00-PHILOSOPHY.md §5.2` pairs `--paper: 40 20% 97%` (warm, hue 40) with
`--ink: 222 24% 10%` (blue-black, hue 222). **That is a 182° hue opposition, and
it is the one measurable inconsistency in the constitution.** Blue-black on warm
paper reads slightly ashen, and it will fight `--acted 35 90% 45%`, which sits
almost exactly on the paper's hue.

**Proposed, as an amendment for the owner to accept or reject:**
```
--ink        30 18% 11%     (warm near-black; keeps the paper family)
--ink-muted  30  8% 42%
--rule       36 12% 86%     (warm hairline; 222-hue rules go grey on cream)
```
Signals unchanged. This is a small edit with a large effect, and it is the only
place in this document that proposes changing a decided value.

### 11. State colour as a low-alpha tint of the hue, not a second palette
**Measured:** Linear `rgba(39,166,68,0.07)`, `rgba(243,78,82,0.10)`,
`rgba(0,255,5,0.10)`. Resend `p3(.376 .996 .655/.114)`, `p3(1 .169 .271/.156)`,
`p3(1 .6 0/.118)`. Every state ground on both sites is **7–16% alpha of the same
hue used for the stroke/text.**

**Why for rootmail:** dark mode (§5.2) currently requires lifting each signal
~12% in lightness — i.e. maintaining two palettes. If the *stroke* is the full
signal colour and every *ground* is that same colour at 10% alpha over whatever
the page ground is, the tint self-adjusts and dark mode becomes a one-token
change. `bg-witnessed/10 text-witnessed border-witnessed/25`.

### 12. A display face for the top of the page — flagged, not asserted
**Measured:** four of five references set the largest type in a face that is not
their UI face — EB Garamond (Wispr), Domaine (Resend), Means (Mailchimp), Degular
(Lenny). Only Linear runs one family throughout, and Linear is the one whose
subject *is* software.

`00-PHILOSOPHY.md §5.2` chooses Inter Tight for headlines, explicitly as a
"ship-now choice because it loads from Google Fonts." Two Google-hosted options
would honour the intent and add the missing register:

- **Instrument Serif** — one weight, one italic. High-contrast, editorial, close
  to Domaine. The single-weight constraint enforces the discipline automatically.
- **EB Garamond** — variable 400–800 + italic. Literally Wispr's face. Warmer,
  bookish, closer to "ledger" and "record" than "magazine".

**Scope it hard if adopted:** the display face gets the marketing h1 and the
one section that names the enemy (§7.2), and *nothing else, ever* — never in the
dashboard, never on a number, never on a label. Inter Tight keeps every other
heading. **Risk to state plainly:** a serif is the most reversible-looking
decision here and the easiest to over-apply; if there is any doubt, Linear is a
complete existence proof that one grotesque at 510/−0.022em/1.00 is sufficient.
This is the owner's call, not a research finding.

### 13. Mono means identifier — confirmed in the wild
**Measured:** Linear's live mono strings are `vehicle_state`, `master`,
`ride/drv-364-reset-dimmed-rows` — field names, branches, refs. Resend's are
inside code blocks and message ids (`26abdd24-36a9-475d-83bf-4d27a31c7def`).
Lenny declares Geist Mono and never renders a single character of it.

`00-PHILOSOPHY.md §5.2` already has this exactly right. The reference value is
the **negative** finding: Lenny's page proves that declaring a mono you never use
is what a design system that was assembled rather than authored looks like. If
mono ships, every id, address, domain, timestamp, threshold and count is in it —
consistently, or the marker stops meaning anything.

---

## B. Do not import

1. **Mailchimp's 2.5-overshoot spring** (`cubic-bezier(0.5,2.5,0.7,0.7)`).
   A control that springs 2.5× past its target performs delight at you. rootmail's
   worst screens are a throttle, a suspension and a refusal; a product that is
   cute on Tuesday is not believed on Wednesday. **Wispr's 1.56 is the ceiling,
   and even that belongs nowhere near a status surface.** Prefer 0 overshoot.
2. **Any "up to" number, and any number without a window.** Harvested live from
   mailchimp.com: *"up to a 97% click rate", "up to 30x ROI", "up to 42%", "4.5
   stars based on 33,000+ reviews", "Seamless integration."* Five claims, zero
   windows, zero methods. §5.3's sourcing line exists to be the visible opposite
   of this paragraph.
3. **Resend's flat event ledger.** `Opened` rendered at the same weight as
   `Delivered` is the founding lie drawn, and it is the specific thing rootmail's
   hollow node refutes. Steal the ledger's *density and specificity*
   (`Delivered · Aug 27 01:59:00 · to liam@figma.com · subject Magic Link ·
   Outlook · macOS`); refuse its equal weighting.
4. **Resend's "code block as hero."** rootmail has two front doors (§6). A code
   block is one station on the line, not the line.
5. **Lenny's 30px radius + 2px black border.** It is excellent and it is
   scrapbook. §5.2 sets 4px for a reason: *records have corners.* Note also the
   measurement that 4px is **Mailchimp's** dominant radius (184 uses) — so radius
   alone differentiates nothing. The differentiator is 4px **plus** a hairline
   rule **plus** no drop shadow.
6. **A handwriting face.** Lenny's FaveHandPro is a genuinely good device — one
   face, one semantic job — but "handwritten" is the visual grammar of an
   annotation someone made up. rootmail's equivalent slot is already filled by
   IBM Plex Mono, and mono's connotation is *machine-recorded*, which is the
   claim we are actually making.
7. **Wide-gamut `color(display-p3 …)` tokens** (Resend, 621 vars). Real cost, no
   benefit for a palette that is deliberately three signals and two neutrals, and
   it fights Tailwind v3's HSL-variable convention that the codebase already uses.
8. **Marquees for social proof.** All four non-Linear references run logo
   marquees (Wispr 40s, Resend 180s, Lenny 36–60s, Mailchimp 45–60s). §6 already
   bans borrowed trust during closed beta — and a marquee is motion whose only
   content is names we do not have permission to print.
9. **Mailchimp's personalisation quiz above the product explanation.** Asking the
   reader to classify themselves before you have told them what you are is the
   structural version of a modal explaining a feature (§6).
10. **13px body copy** (Mailchimp). Wispr 18px/500, Resend 18px, Linear 15px.
    rootmail's copy is the argument; set body at **15px** and never below.
11. **Loose display leading (1.20).** The single most reliable tell separating the
    four authored references from the corporate one.
12. **A second "dark mode palette" maintained by hand.** See A.11 — alpha tints
    over a ground token make dark mode one variable, and §5.2's "lift each signal
    ~12%" is a maintenance burden that the tint approach removes.

---

## C. The one thing all five have that rootmail does not

**A single running artifact that is the page's main visual, showing the product's
own mechanism operating on realistic data.**

- Wispr: the rambling transcript beside the cleaned one, with the machine's
  reasoning labelled in place — *"Filler identified / Correction identified /
  Repetition identified"* — plus a live 45 wpm vs 220 wpm race.
- Lenny: 35 real offers with real dollar values, each individually claimable.
- Linear: four full-width sections, each one the actual UI doing intake, planning,
  automation, review.
- Resend: the SDK call in 13 languages; a stream of real `HTTP 200 { "id": … }`
  responses; the event ledger with real addresses, subjects, clients and OSes.
- Mailchimp: even here, the campaign builder is on screen.

Not one of the five explains itself with an icon and a sentence. Each one
**runs**, on data shaped like real data.

rootmail has the strongest possible version of this available and does not yet
draw it: **the line, completing live, on a real message.** §8's first-login
task — *send one real email to yourself and watch it move* — is already the right
product decision; the finding here is that **it is also the right hero.** One
line, five stations, a real address, a real timestamp under each node in mono, the
delivered node going solid in front of the reader at `stroke .7s cubic-bezier(.32,.72,0,1)`,
the opened node staying hollow, and a sourcing line underneath saying why.

That single component is the marketing hero (§3.7), the onboarding screen (§3.6),
the message detail (§3.2) and the proof of the honesty claim — and it is the only
asset in this study that no competitor can copy without also admitting what they
cannot observe.

**Build it once, and everything in `00-PHILOSOPHY.md` has somewhere to live.**
