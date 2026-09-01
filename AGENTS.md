# AGENTS.md — read this first

Vendor-neutral brief for **any** AI agent working on rootmail (Claude, GPT, Gemini,
Grok, Copilot, Cursor, or a human picking this up cold). Several agents from
different tools work on this repo, sometimes at the same time.

`CLAUDE.md` carries the same rules plus the long list of hard-won gotchas. **Read
it too** — most of what it contains is invisible to a typecheck and has already
cost a production incident at least once each.

---

## ⛔ Two standing rules. Break either and the work gets reverted.

### 1. Information architecture is the product. Do not redesign it.

**Owner, 2026-08-28:** *"we can improve the product to be cohesive in product
design language but we cannot lose what worked and ease of access in the
dashboard as it were."*

- **Visual language** — type, colour, depth, curves, motion. Lives in
  `packages/design`, changes in one file, reversible. **Improve this freely.**
- **Information architecture and interaction** — what is in the nav, what a page
  IS, how a list sorts, where things live. **This is the product**, and it is what
  users already learned.

Two failures shipped to production because agents blurred these:

- The sidebar was cut to "Mail + Settings", deleting every other destination
  (`625a677`). The owner found it live.
- Nine routes were reshaped (`5a959da`) — `/messages` from a sortable table into
  a "register", `/contacts` into a "roster" — justified by an opinion about what
  operators ask, asserted with no evidence, removing a control that worked.

Both reverted in `f6c3ca7`. **If a change alters what is in the nav, what a page
IS, or removes a control that worked, that is a product decision: ask first, and
never ship it inside a design change.** Keeping the existing pattern is the
default; the burden of proof is on replacing it.

### 2. Never draw a solid line through something we did not observe.

The product's entire thesis is that email is a chain of custody and the enemy is
the black box. The "line" has four states and they are a **rendering law**, not
styling:

| state | meaning |
|---|---|
| solid | we witnessed it — a provider confirmed it, or we did it |
| hollow | we **inferred** it — a tracking pixel, a heuristic |
| dotted | we do not know, or it is not built |
| severed | it stopped, and a number says why |

An open is a pixel firing (roughly a third are a mail client pre-loading images)
and a click can be a security scanner, so `opened`/`clicked` render **hollow,
forever**. `messageStations()` in `packages/design/src/line.tsx` encodes this so a
caller cannot get it wrong; `<Metric>` requires `window` and `method` **by type**,
so a sourceless number cannot be constructed.

This is enforced, not trusted — see the checker below. Nothing here is decorative:
the dashboard once shipped `opened` at the same weight as `delivered`, which is
the industry's founding lie, in our own product.

---

## Where things stand (2026-09-01)

- Branch `main`, HEAD **`2083b36`**. `Build & push images` green; all four web
  apps deployed from it.
- **Production runs this code.** `rootmail.io` and `developers.rootmail.io`
  return 200; `app.rootmail.io` and `internal.rootmail.io` return 307 to their
  login, which is correct for an unauthenticated request.
- Gates green: `pnpm typecheck` 13/13 · `pnpm test` 4/4 suites (30 API incl.
  tenant isolation, 27 db) · `pnpm build` 6/6 · `design-audit` exits 0.
- `apps/worker` is intentionally **not** on this SHA — no worker code changed, and
  that host builds by image name rather than pulling (see `CLAUDE.md`).

### Recently done
The design system ("Ledger Luminous": Fraunces for headlines and figures,
Schibsted Grotesk for UI, JetBrains Mono for recorded values, brass accent,
`--radius: 1rem`, depth as a token) across all four apps from one file. A live
DNS auditor at `/check`. Light mode rebuilt as its own design (§11). The public
sites reworked around scroll-driven sticky scenes rather than click-to-reveal
tabs, a cropped outline wordmark in place of a 21-link footer, and a generated
social card — there had been none, so every shared link rendered as bare text.

Real bugs fixed along the way, all of which had shipped: the docs promised an
`Idempotency-Key` header the API never read (a duplicate email on every retry
for anyone not using our SDK); every inverted band painted itself in `--card`,
the token it re-points for its own cards, at 1.00 contrast; a scroll driver
looked up an element by an id that element did not have, so one scene never
advanced, silently; and the developer site's sub-tenancy tabs governed one of
four panels, leaving the code sample on a different customer's domain.

### The nav is an island now (2026-09-01)
Both public sites' headers are inset plates aligned to the section edges below
them (`.nav-island` / `.nav-group` in each app's `globals.css`), keeping the
frosted glass at a **measured** 90% opacity. Two constraints if you touch it:

1. **The marketing header's total height must stay 4rem.** Three scroll rigs pin
   with `calc(var(--beta-notice-h, 0px) + 4rem)`. The island is 3.25rem with
   0.375rem of air above and below. Break it and the scroll scenes start their
   travel in the wrong place, silently, only on long pages.
2. **A sticky translucent bar's contrast must be checked against every band it
   floats over, not against the page default.** Its ground moves as you scroll.
   Composite label → group glass → island glass → band; 82% failed AA on the nav
   links in light theme only, and only while over an inverted band.

### Known open items
1. ~12 lower-traffic dashboard routes still generic tables (`/analytics`,
   `/sequences` are the best candidates). **Restyle only — see rule 1.**
2. Admin's authed pages (`/our-workspace`, `/orgs/[id]`, `/staff`) are built and
   typechecked but were never walked in a browser.
3. `/changelog` is the densest page on the site (337 words per 1,000px).
4. `DocShell` (`apps/developers/src/components/site/doc-shell.tsx`) is imported
   by nothing — dead since the docs moved to `app/docs/layout.tsx`.
5. The developer site still has the STORY problem the homepage was fixed for in
   `f6c3ca7`/`202b438`: its visuals are current, its argument was never reordered
   around what a stranger asks first.

---

## Verify your work

```bash
pnpm infra:up                            # Docker Postgres :5435 + Redis :6380
pnpm typecheck && pnpm test && pnpm build
pnpm exec tsx scripts/design-audit.ts    # must exit 0
```

**The audit does not measure contrast.** It scans source text, so it cannot see
what a token computes to once a band has re-pointed it — and that is where this
codebase's design bugs actually live (see `d11ac66`, `fb0137d`). If you touch a
ground, a well or a card token, open the page in both themes and measure. There
is no substitute and no rule that will catch it for you.

`scripts/design-audit.ts` scans all four apps for twelve rules and exits non-zero
on a blocking violation. Two of them — `inferred-as-witnessed` and
`delivery-overclaim` — are about **truth**, not taste. Read the file; the
reasoning for each rule is in it.

## Working alongside other agents

- **Several agents share one working tree.** Stage explicit paths; never
  `git add -A`. It has already swept another session's work into the wrong commit.
- **Check `git log origin/main` before assuming your local HEAD is current.** A
  parallel session shipped the sidebar change while another agent was mid-task,
  and the mismatch cost an hour of misdiagnosis.
- Deploys are `main` → GitHub Actions builds six images → **hosts pull, they do
  not auto-update**. `docs/deploy-runbook.md` has the commands. `--env-file
  .env.prod` is not optional: without it every frontend var silently becomes the
  empty string and the console breaks while the API stays healthy.
- **Never send a real message from local.** `.env` has `MAIL_PROVIDER=ses`.

## Where to read more

| file | what |
|---|---|
| `CLAUDE.md` | full working notes + the gotcha list. Read it. |
| `docs/design/00-PHILOSOPHY.md` | the design constitution. **§10 supersedes rules still written in §5 and §9, and §11 is newer than both** — do not follow the earlier sections from memory. §11: light mode is its own design, not an inversion of dark; the two halves of `tokens.css` are supposed to disagree. |
| `docs/design/01-REFERENCES.md`, `02-AUDIT.md`, `04-EXPERIENCE.md`, `05-ENGAGEMENT.md` | the measured evidence behind the design decisions |
| `docs/deploy-runbook.md` | hosts, commands, and the two traps that have bitten |
| `docs/COLLAB.md` | channel to the positioning agent — append when you change what we can honestly claim |
| `ROADMAP.md` | what is built and what is next |
