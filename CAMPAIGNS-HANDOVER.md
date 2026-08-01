# Campaigns journey — handover

State as of `d46c9b3`. Everything below is committed, CI-green and deployed
(dashboard + api). Read this before touching campaigns.

## The through-line we're building

One continuous journey, from pressing "New campaign" to watching engagement come
in — with progress visible at every stage and sub-stage, and **nothing failing
silently**.

```
Build ──► Review ──► Sending ──► Delivered ──► Engagement
  │          │
  │          └─ readiness checks · audience count · confirm · schedule
  └─ 1. Audience → 2. Message → 3. Review     (staged; bars, not pills)
```

`CampaignJourney` + `phaseForStatus` live in
`apps/dashboard/src/app/(app)/campaigns/[id]/launch.tsx` and render on **both**
`/campaigns/new` (phase `Build`) and `/campaigns/[id]` (phase from status).

## Done

- **Send never fails silently.** `sendCampaign` used to be
  `catch { /* best-effort */ }` — it swallowed the API's own perfectly good
  message ("A campaign needs both a list and a template before sending") so a
  refused send looked identical to a successful one. It returns `{error}` now
  and `LaunchPanel` shows it.
- **Readiness before the click.** `LaunchPanel` names each blocker (no audience /
  no content / no verified sender) with a deep link to fix it, and disables Send
  until they clear. Same conditions the API enforces, surfaced early.
- **Audience count + confirm.** "This goes to N people, from X" and one
  confirmation, because mail can't be unsent.
- **The list page** no longer one-click sends from a table row — it's
  "Review & send", routing to where the count and checks live.
- **Scheduling works.** The API had supported it all along (`POST /send` parsed
  `scheduled_at`, set status `scheduled`, enqueued with a delay) — the dashboard
  simply never passed it. Now: `sendCampaign(id, scheduledAt?)`, a "Schedule
  instead" door in `LaunchPanel` with a datetime picker, future-instant
  validation in the action, and the record states *when* it goes out. Verified
  against the running API: scheduled 3 days out → status `scheduled` + stored
  instant, page renders Build ✓ → Review with the date.

## Not done — in priority order

### ~~1. Composer → staged scenes~~  DONE (7836d2c, d46c9b3)

Three sub-stages under Build, rendered as **filling bars** (onboarding-wizard
shape) so they read differently from the main pill rail. Forward is gated on
what makes the next scene meaningful; completed scenes are clickable.

**Inactive scenes stay MOUNTED and hidden, deliberately** — this form posts via
`useActionState`, and a field not in the DOM doesn't submit. That's why there's
no AnimatePresence swap between scenes. If you want the slide transition, hoist
every submitted field to form level first.

### 1. The swallowed-error sweep — NOT a one-line fix, know this before starting
**24 swallowed catches across 17 action files.** Every one is a user pressing a
button and being told nothing when it fails.

```
grep -rn "catch {$" apps/dashboard/src/app --include="actions.ts"
```

The trap: **14 of these are `Promise<void>` form actions** (`<form action={fn}>`).
Returning `{error}` from them changes nothing on its own — a form action's return
value is discarded. Each one needs its CALLER converted to `useActionState` (or a
client handler) to have anywhere to show the error. That's a per-call-site
refactor, not a find-and-replace, which is why it wasn't bundled into the
campaign work.

Split it that way:

| Shape | Files | Work |
|---|---|---|
| Already returns a value | messages (4), inbox, assistant, contact, auth, subscribe | Cheap — surface `{error}` at the existing call site |
| `Promise<void>` form action | lists (3), sequences (2), contacts, roles, api-keys, members, templates, billing, sub-tenants, campaigns (delete) | Convert caller to `useActionState`, then return `{error}` |

Do the cheap column first — it's real user-facing value for little risk. The
form-action column is best done section by section, verifying each.

`sendCampaign` (campaigns) is already converted and is the reference
implementation: action returns `{error?}`, `LaunchPanel` renders it.

## A trap that already bit once — don't repeat it

`phaseForStatus()` was defined in `launch.tsx` (a `"use client"` module) and
called from the server page. **Next only lets COMPONENTS cross the client
boundary, never plain functions** — every campaign detail page threw
"Attempted to call phaseForStatus() from the server", and it shipped to
production because `tsc` is perfectly happy with it. It now lives in
`campaigns/phase.ts`, deliberately not a client module.

Rule: any helper a server component calls must live outside `"use client"`.
Typecheck will not catch this. Only walking the page will.

## Verification notes (read before claiming something works)

- **Never send a real campaign locally.** `.env` has `MAIL_PROVIDER=ses`, so a
  send puts mail on the wire to synthetic addresses. The blocked path is safe to
  exercise; the success path is not. Nothing in the list above has had a real
  send executed end to end.
- **The browser preview pane freezes `requestAnimationFrame`.** Framer entrances
  stall at their `initial` values and exits never unmount. Assert on DOM/text,
  not on animation completion, and don't read a faded screenshot as a bug.
- Local auth for verification: the dashboard sends `rm_session` as the Bearer and
  the API accepts API keys too, so
  `document.cookie = "rm_session=<rm_live_…>"` works without a password. Note
  `api.me()` then returns no user, so Profile-ish views render blank.
