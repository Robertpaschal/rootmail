# Campaigns journey — handover

State as of `85e91b1`. Everything below is committed, CI-green and deployed
(dashboard + api). Read this before touching campaigns.

## The through-line we're building

One continuous journey, from pressing "New campaign" to watching engagement come
in — with progress visible at every stage and sub-stage, and **nothing failing
silently**.

```
Build ──► Review ──► Sending ──► Delivered ──► Engagement
  │          │
  │          └─ readiness checks · audience count · confirm · schedule
  └─ name · audience · message · A/B          (sub-stages: NOT yet staged)
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

### 1. Composer → staged scenes  ← the headline gap
`apps/dashboard/src/app/(app)/campaigns/composer.tsx` (375 lines) is still ONE
scrolling form. It has a local `Step` component and four numbered sections
(Name it / Who gets it / What do they get / A-B by tags) — **those are already
the scene boundaries**, they just all render at once.

Reuse `StageRail` + `StageScene` from
`apps/dashboard/src/components/app/stage-rail.tsx` — the template studio and
message composer already use them, so campaigns will match rather than invent a
third pattern. Nest them as sub-stages *inside* the `Build` leg of
`CampaignJourney`.

Watch out for: the form submits via `useActionState(createCampaign)`, and the
message composer hit a real bug doing this — **fields in unmounted scenes stop
submitting**. Hoist every submitted field to form level (that fix is in
`messages/new`, worth copying).

### 2. The swallowed-error sweep (product-wide, not campaigns)
`sendCampaign` was not an isolated mistake. **24 swallowed catches in 17 action
files** — every one is a user pressing a button and being told nothing on
failure:

```
grep -rn "catch {$" apps/dashboard/src/app --include="actions.ts"
```

Worst offenders: `messages` (4), `lists` (3), `sequences` (3), `campaigns` (2
remaining). Convention to apply: action returns `{error?: string}`, caller
surfaces it. This is its own pass and probably the highest-value cleanup in the
dashboard.

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
