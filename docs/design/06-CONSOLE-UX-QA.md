# Console UX pass — September 2026

Status: implemented on `codex/dashboard-ux-polish`; not published to production.
The owner authorized a dashboard-first UX/UI pass, including a font/identity
change, followed by marketing, developers and internal admin. See philosophy §12.

## What changed

- Manrope UI, sans-serif console titles/figures, stable espresso-brown navigation and
  separate light/dark working surfaces. Public narrative headlines keep Fraunces.
- More legible labels, descriptions, input text and table headings; semantic text
  and badge colours; wrapping page headers and long addresses; contained table
  scrolling. All existing navigation destinations, sorts, filters and paging remain.
- Overview uses contained cards, including the five sending metrics, and keeps
  completed setup steps expandable. Recent-message times have their own space.
  Generic activity was moved behind the bell; Overview shows only recent,
  attributable system actions for the current workspace.
  Metrics retain their reporting window, measurement method and inferred caveats.
- Keyboard skip links, named navigation/search/editing controls, current-page,
  sort and progress semantics, reduced-motion support, mobile all-pages drawer,
  and viewport-contained information hints.
- Compose preserves the written body when returning from review. Invalid
  recipients are caught before review; a preview lookup error keeps the draft
  visible and reports an inline error instead of replacing the page.
- Public beta notices measure their wrapped height. Marketing's 4rem header
  contract is preserved. Mobile developer navigation and all 27 docs destinations
  are reachable; documentation tables scroll within their panel.
- Internal admin retains its dark-only identity and explicitly says "Internal
  admin". Populated staff, workspace and organisation screens were walked read-only.
- Follow-up revision uses the marketing palette for the customer canvas in both
  themes, with uniform 44px topbar pills. The bell separates needs-attention,
  sending activity and published product updates. Seen status is browser-local;
  it cannot answer or close a conversation.
- Template studio separates email details, the canvas, content tools, whole-email
  styling and selected-block settings. Preview/save is reachable above the email;
  narrow screens use a focus-managed tools dialog. Undo/redo, HTML, personalization,
  previews, test sends and starter choices remain available. HTML-to-block switching
  warns about non-importable edits, and failed deletion now displays an error.

## Verification environment

Only local QA accounts and fixtures were changed. The API used local PostgreSQL
on 5435, Redis on 6380, `MAIL_PROVIDER=mock` and `DNS_VERIFY_MODE=mock`. No worker
was started. Fixtures were inserted directly: 25 messages, 25 contacts, one
audience, one draft campaign, one paused sequence and inbound conversations. The
notification revision adds a labelled synthetic reply and release note. A new
synthetic template was created through the studio to verify saving.
No real message, campaign launch, enrollment, customer mutation, staff action,
payment, public contact request or demo-send request was performed.

## Automated gates

- `pnpm typecheck`: 13/13 tasks passed.
- `DATABASE_URL=postgres://rootmail:rootmail@localhost:5435/rootmail REDIS_URL=redis://localhost:6380 MAIL_PROVIDER=mock DNS_VERIFY_MODE=mock pnpm test --env-mode=loose`:
  5/5 tasks passed, including 48 API, 115 core, 27 database and 22 dashboard tests
  (212 total). Dashboard tests include notification classification, provider-copy
  checks, panel/popup geometry and server-rendered motion safety checks.
  Loose environment mode is necessary because the test task otherwise strips
  these local database overrides. This is not a frontend interaction test suite.
- `pnpm build`: 6/6 tasks passed (four web applications plus SDK and CLI).
- `pnpm exec tsx scripts/design-audit.ts`: zero blocking violations.
- `git diff --check`: passed.

The build reports an existing Turbo output-configuration warning for developers;
Next's production compilation, static-page generation and route output succeed.

## Browser coverage

Checks were performed in the in-app browser, primarily at 1280×900 and 390×844,
with additional 375px and 320px reflow checks. This is representative coverage,
not a claim that every route and state has been exhaustively exercised.

| Area | Observed checks |
| --- | --- |
| Dashboard overview | Light/dark desktop and mobile; setup completion expansion; populated activity and recent messages; overflow corrected at the card/grid source. |
| Messages | Light/dark; 25-row fixture search narrows to one result; next page shows 21–25; sorting exposes ascending state and resets paging; long subjects retained. |
| Compose and replies | Labelled fields; write → review → back retains body; preview error recovery; recipient validation; no send. Information hint fits the mobile viewport and Escape dismisses it. |
| Campaigns and sequences | Populated list, draft campaign review and recipient preview; paused sequence and its editor opened/cancelled; no launch/enrollment/save. Campaign detail checked at 320px, with long sender and progress badge fixes verified. |
| Templates | Existing and new studio; desktop and 390px light/dark views. Added and edited a button, previewed, returned with the draft intact and exercised undo. Mobile tools dialog opens/closes with focus return. Created a synthetic local template through the save action. Email sheet colours remain independent from the application theme. |
| Notification channel | Loaded a synthetic needs-reply thread and published release from the local API. Marking updates seen left the reply in needs-attention. The reply link opened the exact conversation on mobile. Source failures retain a warning rather than claiming everything is clear. |
| Other customer routes | Representative contacts, analytics, deliverability, billing, members, testing and sender-settings views; empty and populated states where available. Not every billing configuration or modal was exercised. |
| Customer mobile menu | All destinations retained; open, Escape close and focus return checked. Horizontal quick navigation remains available. |
| Marketing | Homepage, pricing, changelog, DNS check, beta and contact page readability/reflow; both themes represented, with 320px checks. Contact form clipping corrected and rechecked. Forms not submitted. |
| Public header | Mobile menu open/Escape/focus return; marketing header measured at 64px and beta offset matched observed wrapped height. |
| Developers | Homepage, quickstart and Messages reference; 320px mobile navigation; Enter opens the 27-page documentation menu and Messages navigation works; light/dark reference checks. |
| Admin | Overview, own workspace, organisation list/detail, staff, leads, support and analytics; populated local data, desktop and 390px mobile. Read-only session; no impersonation or staff mutations. |

## Contrast methodology and boundaries

Computed foreground colours were compared with composited ancestor backgrounds
for visible text. Findings included low-contrast decorative-brass text, faded
labels and alpha-filled green badges; these were corrected using text/tint tokens.
The helper omits opacity-affected ancestors and gradients and does not infer a
background painted by an absolutely positioned sibling. Consequently a zero
finding count is not a WCAG conformance certificate. Screenshots and element
bounds were also inspected; page scroll width alone missed content clipped by
a public slab, which is why the contact form needed a separate bounds check.

For the marketing header's scrolled glass, the ancestor layers were composited
over each distinct opaque section background. Lowest measured header-control
contrast was 4.71:1 in dark and 5.62:1 in light; nav links were above 7.8:1.
The developer header's minima were 4.88:1 dark and 4.96:1 light across its bands. These calculations
cover the sampled colours, not every image, hover state, animation frame or
possible future background. The internal active-nav highlight uses a positioned
sibling; its separate foreground/fill check measured 8.46:1.

Not covered: a full screen-reader audit, OS text-only scaling, 200% text zoom,
every error/permission/billing state, every browser, or live delivery behaviour.
The existing four-state renderer and Metric sourcing requirements are unchanged;
opens/clicks continue to be inferred, never promoted to witnessed delivery.

## Assistant and Support follow-up (2026-09-13)

The full page, floating chat and docked panel now share the approved working
palette, rounded raised surfaces, 44px controls and readable conversation text.
AI and human authors remain explicitly labelled. The existing conversation list,
filter, grouping, rename/delete, new-chat, outline and support-history controls
remain available. Full-page links from the panel retain the selected help pane;
an existing AI conversation carries its chat id into the full page.

AI/Support switches keep both panes mounted after first use. Docking uses one
persistent native dialog, with browser modal isolation only in docked mode.
Support drafts are held per conversation; hidden support panes do not poll or
mark replies seen. Loading/pending guards prevent sending while another thread
is opening. Deletion errors remain visible instead of silently removing history.

The owner-reported placeholder issue came from the shared textarea's monospace
default. Help composers and placeholders explicitly use 16px Manrope. The
top-clipping report exposed automatic scrolling of the empty suggestions: empty
conversations now start at scroll position zero, while populated AI transcripts
follow new content only when the reader remains near the bottom. Their scroll
region can shrink independently from the fixed composer.

Checks: local development and the optimized production build; 1280px desktop,
390px mobile and 320px narrow layouts; light and dark. Seven labelled local AI
chat fixtures (one with six messages) and two local support threads were inserted
directly into PostgreSQL. No AI run, support submission or email send was made.
Observed checks included long-text wrapping, returning to the first AI message,
full-page pane draft retention, panel docking/undocking draft retention, native
modal state/background isolation, Escape dismissal and focus return. A 320px
panel initially lost 3px to the browser scrollbar; percentage-based max-width
restored a 12px inset on both sides of the content viewport.

Sampled help text contrast passed 4.5:1 in both themes (lowest recorded: 4.79:1,
the light-theme support status badge); methodology limitations above still apply.
The existing 199 tests pass, typecheck is 13/13, build 6/6, design audit reports
zero blocking violations, and `git diff --check` passes. Live streaming, staff
notification delivery, deletion success/failure and a complete screen-reader
audit were not exercised in the browser during this follow-up.

## Interaction and motion follow-up (2026-09-13)

The original panel/navigation pass and the requested wider interaction polish
are both included. Immediate control feedback uses the 100ms interaction tier;
surface and section movement uses the 700ms narrative tier. New entrances keep
content fully opaque and usable immediately: no exit-wait or animation-completion
dependency gates a menu, stage, selected label or form control.

- Help opening, docking and undocking animate the existing dialog from its
  observed position, including interrupted transitions and movement after dragging.
  Numeric drag bounds avoid a resize observer nudging the panel during animation.
  The same mounted panes retain drafts and native docked modal isolation.
- Topbar menus, notifications, sidebar selection/groups, mobile navigation,
  page headers, tabs, buttons and expandable settings receive restrained motion.
  Active-state fills appear immediately; moving outlines are decorative.
  Escape returns focus from the create, workspace and account menus.
- Compose/review stages, campaign steps and launch disclosures, template tools,
  inbox conversations and expanded emails use immediate, small-offset entrances.
  Inactive campaign form stages remain mounted. Shared pending buttons retain
  their disabled state and expose busy semantics; send-icon motion is decorative,
  not a percentage or a claim about delivery. API acceptance feedback says
  “Queued” where the response does not establish delivery.
- Test-send menus measure available space, respect the sticky toolbar, flip when
  needed and scroll within the viewport. At 320px, the final upward menu measured
  left 16px, right 288px, top 255px and bottom 767px in an 844px-high viewport;
  the toolbar ended at 134px. No test destination was activated.

Browser checks used the optimized production build on desktop, 390px and 320px,
with both themes represented. Observed panel checks included dragging, rapid
dock/undock interruption, draft retention, Escape and focus return. Create,
workspace, account, search and notification openings remained fully opaque;
sidebar route selection and all destinations remained available. Sampled minimum
menu text contrast was 5.92:1 light / 6.43:1 dark, and navigation text was
7.40:1 light / 8.16:1 dark, subject to the methodology limitations above.

Compose review/back retained subject and body. Template preview/back retained
the unsaved subject, body and selected tool tab; the original subject was restored
without saving. Reply expansion/collapse and the collapsed conversation rail were
exercised. Sender settings opened/closed without changing an option. Campaign
audience → message → review → audience → review retained the name and rendered
audience/template selections; no campaign was created or launched.

All 210 tests pass, typecheck is 13/13, build 6/6, and the design audit reports zero
blocking violations. Eight geometry/fallback tests and three server-rendered
motion tests were added. Reduced motion is covered by the native-animation unit
test and explicit CSS/Framer guards, not an OS-level browser emulation. Pending
send feedback was checked in source and server-rendered tests, not by sending mail.
Live delivery, AI streaming, the fixture-unavailable client switcher, every billing
state and a complete screen-reader audit remain outside this browser coverage.
The four-state rendering law and information architecture are unchanged.

## Menu, conversation access and support revision (2026-09-13)

Owner feedback exposed gaps the prior coverage missed. The New menu aligned its
right edge with a left-side trigger and extended behind the higher sidebar. It
now opens from the trigger's left edge, and the topbar sits above ordinary
navigation but below modal overlays. The observed desktop menu began at 355px;
the sidebar ended at 256px. Existing topbar menus share the corrected layer.

The full-page AI conversation rail now transitions its desktop width in both
directions with native CSS. Its compact state keeps every chat directly reachable
through a labelled shortcut, rather than only offering an expand button. Opening
a saved conversation from the compact rail was verified; final width was 52px,
with intermediate widths observed while collapsing/expanding. Toggle focus is
retained across the compact/expanded controls. Main navigation also uses native
movement, with the content inset following the same timing. Mobile breakpoint
changes do not animate the desktop inset across the narrow layout.

Notifications, AI/Support pane switches and support status filters share a
persistent measured slider, including wrapped two-row layouts. CSS interpolates
its position and size over 700ms; text and pressed state remain immediate. Both
card and track backgrounds were measured because either can pass behind a label:
the minimum sampled ratio was 5.08:1 light and 5.28:1 dark. Notification content
moves in the selected direction, including empty states. Chat list/transcript
switching and the shared jump-to-section outline no longer depend on a JavaScript
opacity animation to expose controls.

Support now exposes Conversations and New explicitly, with search, All/Open/
Resolved filters, refresh, current-thread indication and per-thread draft labels.
The thread shows its topic and explains its state. New conversations can have an
optional topic; if omitted, the first message supplies a bounded title through
the existing API subject field. Resolution remains a team action, and a customer
reply reopens a resolved thread; no unsupported customer-resolution control was
added. A failed thread load returns to the list instead of leaving an unrelated
old thread under the attempted navigation. Polling updates list status as well
as the active transcript.

Observed checks: open/resolved filtering; opening the resolved fixture and its
reopen guidance; an unsent reply surviving a trip through another thread; a new
topic surviving list/back navigation; and full-page plus 320px floating-panel
layouts. The floating panel remained within left 12px / right 293px of a 305px
content viewport. All synthetic drafts used in this revision were cleared. No
support submission, customer reply, AI run or real email was sent. Two new pure
tests cover topic selection/bounds and combined status/search filtering.

Final keyboard checks also verified that collapsing the AI rail focuses its
replacement expand control, and the question outline opens fully opaque then
returns focus to its trigger on Escape. Its hover opening no longer gets undone
by the subsequent pointer click. The main sidebar was observed mid-transition
with hidden contents inert. Final gates: 212 tests, 13/13 typecheck, 6/6 build,
zero blocking design-audit findings and a clean whitespace check.

## Release boundary

No production deployment was performed by this UX pass. Use the existing AWS
deployment runbook after owner approval; do not migrate the application to a
different hosting system as part of a visual change. Local fixture credentials
and data are not production configuration and must not be shipped.
