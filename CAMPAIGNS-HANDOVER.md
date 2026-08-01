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

### 1. The swallowed-error sweep — CORRECTED COUNT: 13, not 24

My earlier "24 swallowed catches" was wrong: I grepped `catch {` without reading
them. Roughly half are **deliberate, documented graceful degradations** and must
be left alone — e.g. in messages/actions.ts:

- `simulateEvent` — "best-effort — the refresh below reflects whatever actually
  changed". There IS a compensating read; nothing is hidden.
- contact lookup for preview — "previewing must never depend on the audience
  being reachable". Correct: a preview should degrade, not fail.
- the variables `JSON.parse` — already returns
  `{ error: "Variables must be valid JSON." }`. Not a swallow at all.

**The real ones are mutations that return `Promise<void>` and have no
compensating refresh** — you press a button, it fails, nothing is said:

```
contacts/actions.ts     unsubscribeContact()
lists/actions.ts        deleteList()  addContact()  removeContact()
roles/actions.ts        deleteRole()
api-keys/actions.ts     revokeApiKey()
sequences/actions.ts    deleteSequenceAction()  enrollAction()
sub-tenants/actions.ts  verifySubTenant()
campaigns/actions.ts    deleteCampaign()
templates/actions.ts    deleteTemplate()
members/actions.ts      revokeInvite()
billing/actions.ts      setAddon()
```

Several are destructive (delete a list, revoke a key, delete a template, revoke
an invite) — the worst kind to fail quietly, because the row often disappears
from view on revalidate and looks like it worked.

**Why this isn't a find-and-replace.** All 13 are `<form action={fn}>` form
actions, and a form action's return value is discarded. Returning `{error}`
changes nothing until the CALLER becomes `useActionState` (or a client handler)
with somewhere to render it. So each is: convert caller → return `{error}` →
surface → verify. One section at a time.

`sendCampaign` in campaigns/actions.ts is the reference implementation:
action returns `{error?}`, `LaunchPanel` renders it inline.

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
