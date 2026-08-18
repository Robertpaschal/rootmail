# Engineering brief — close the positioning gaps

**Written 2026-08-17. Source: an evidence-based audit of this repo against the market pain we validated.**

## Why this exists

We validated the buyer. It is **vertical SaaS platforms that send email on behalf of their own customers** — booking software, CRMs, membership platforms, clinic systems, marketplaces, education platforms.

Their words: *"The moment you send email on behalf of your users, you inherit their behavior. One customer sends spam. One customer imports a dirty list. Suddenly the reputation of the entire platform collapses."*

The incumbents abandoned them. Mailgun gates subaccounts behind the Scale plan at **$90/month minimum**. Resend has no lifecycle automation. Postmark is transactional-and-broadcast only. SendGrid moved upmarket. All of them force a second vendor for marketing email.

**Our wedge is that sub-tenancy is in the data model rather than the price list.** That part is true and shipped. The part that is NOT true is that we do anything about a bad tenant — and we are currently claiming otherwise on the marketing site.

**The goal of this brief: make the claims true, then say them.**

---

## P0 — Do first. These are live falsehoods.

### P0.1 — Remove the isolation guarantee from marketing

`apps/marketing/src/components/site/subtenancy.tsx:31` currently reads:

> "Each client sends from their own web address, with their own sending reputation — one client's mistake never touches another's delivery."

This is false. All sub-tenants share one IP pool and one SES account reputation, and nothing throttles or pauses a bad tenant.

Replace with the honest — and still differentiated — version:

> "Every client's sending reputation is measured separately, so you can see exactly which one is going wrong — before the mailbox providers tell you."

Resend and Postmark cannot say that. Ship the honest line now; earn the stronger one in P1.1.

### P0.2 — Remove the DKIM rotation claim

`packages/db/src/seed-blog-refresh-2026-07.ts:24` claims we *"generate and rotate DKIM keys for every sending domain — including each sub-tenant's — automatically."*

There is no rotation code anywhere in the repo. Keys are generated once at sub-tenant creation and never touched. Either delete the sentence or implement P2.3 first.

### P0.3 — Fix the ROADMAP test claim

`ROADMAP.md:37` states *"every feature has a test or browser verification."* There are zero `.test.ts` / `.spec.ts` files in the repo and no test runner in any package.json. Correct the line. Then fix the underlying problem in P1.3.

---

## P1 — The wedge. This is the week's real work.

### P1.1 — Per-tenant reputation enforcement loop  ★ HIGHEST LEVERAGE

Today `computeDeliverability` (`apps/api/src/lib/deliverability.ts`) is a genuinely good scorer — bands calibrated to published SES thresholds (5%/0.1% warn, 10%/0.5% suspend), low-volume damping, 0–100 score with factors and recommendations, correctly scoped per sub-tenant.

And it is imported in exactly ONE place: the read-only GET route. The send path never consults it.

Everything upstream already exists. What is missing is the loop.

**Build:**

1. **Scheduled sweep.** `apps/worker/src/index.ts` already schedules three recurring jobs (sequence tick, retention, lifecycle emails). Add a fourth: `reputationSweep`, every 15 minutes.
2. For each sub-tenant with volume in the trailing window, call the existing `computeDeliverability` — do not write a second scorer.
3. **Thresholds → state machine:**
   - `warn` (bounce >5% or complaint >0.1%): notify the parent workspace, no send restriction.
   - `throttle` (bounce >8% or complaint >0.3%): apply a per-tenant token bucket in the existing Redis. Reduce to a low fixed rate rather than blocking.
   - `pause` (bounce >10% or complaint >0.5%): set `subTenants.status = 'disabled'`.
4. **Make `disabled` real.** `SUBTENANT_STATUSES` in `packages/core/src/constants.ts:114` already includes `"disabled"`, and NOTHING in the codebase can currently set it. The `PATCH /v1/sub-tenants/:id` handler accepts only `name`, `external_id`, `inherits_templates`.
5. **Send-path hook.** `apps/api/src/routes/messages.ts:195` already blocks unverified sub-tenants. Extend that guard to also block `disabled`. This is a ~3-line change.
6. **Recovery path.** A paused tenant must be un-pausable by the parent, with the reason and the metrics that caused it visible. A trap door with no ladder is worse than no trap door.
7. **Notify the parent** on every state transition. The platform operator is the customer — they need to know which of *their* customers is the problem, which is exactly the value proposition.

**Acceptance criteria**
- A sub-tenant driven past the complaint threshold is throttled within one sweep interval and paused at the hard threshold, without operator action.
- A paused tenant's sends are rejected at the API with a clear, specific error.
- Other sub-tenants in the same workspace are unaffected — send rates unchanged.
- The parent receives a notification naming the tenant, the metric, and the threshold crossed.
- The transition is written to `audit_entries`.

**When this ships, the isolation claim becomes defensible and the marketing line can be upgraded. This is the launch.**

### P1.2 — Sub-tenant-scoped API keys

`api_keys` has no `sub_tenant_id` column (`packages/db/src/schema.ts:581`). Scope comes from the `X-Rootmail-Subtenant` request header (`apps/api/src/plugins/auth.ts:29`), so a workspace key can act as any tenant by changing a header.

That is tolerable while the platform holds the key. It becomes blocking the moment a customer asks *"can you give my client a key that only works for their data?"* — which is the first question every vertical SaaS buyer asks.

**Build:** nullable `sub_tenant_id` on `api_keys`; when set, it pins the scope and the header is ignored (or rejected on mismatch). Migration + auth plugin + key-creation UI/API.

**Do P1.4 before or with this.** Shipping scoped keys on top of the current read leak turns a latent bug into a live cross-tenant breach.

### P1.3 — First tests, on the isolation paths

Zero tests exist. Do not attempt broad coverage. Add a test runner and cover exactly the paths where a silent regression is a customer-facing breach:

- Suppression scoping (`apps/worker/src/pipeline.ts:64`) — the hierarchical workspace-vs-tenant logic and the unsubscribe/transactional distinction. This code is subtle, correct, and completely unguarded.
- Tenant read isolation — tenant A cannot read tenant B's message, audit trail, or proof bundle.
- Audience resolution (membership vs rule-based).
- The P1.1 threshold state machine.

### P1.4 — Close the cross-tenant read leak  ★ HALF A DAY, DO IT TONIGHT

`getScopedMessage()` at `apps/api/src/routes/messages.ts:122` filters on `workspaceId` only:

```ts
.where(and(eq(messages.id, id), eq(messages.workspaceId, req.auth.workspace.id)))
```

The list endpoint at line 490 already does it correctly:

```ts
if (req.auth.subTenant) conditions.push(eq(messages.subTenantId, req.auth.subTenant.id));
```

Four routes use the unscoped helper: GET message, **audit trail**, **proof bundle**, and event recording. Apply the same sub-tenant condition to all four.

Not exploitable today because scope is header-derived, but "we served one client's signed proof bundle to another" is the single worst headline a proof-and-compliance product can get.

---

## P2 — Credibility work

### P2.1 — Encrypt DKIM private keys at rest
`packages/db/src/schema.ts:615` carries its own admission: `// PEM private key — must be encrypted at rest / KMS-managed in production.` It is not. `packages/core/src/crypto.ts` has hashing, HMAC and password functions but no symmetric encrypt/decrypt. A database dump currently hands over every tenant's signing key. Security-conscious buyers will ask, and the honest answer today is bad.

### P2.2 — DNS drift detection
Verification is one-shot. If a tenant deletes their DKIM record later, nothing re-checks. `lastCheckedAt` exists but no job updates it. Extend the P1.1 sweep to re-verify tenant DNS.

### P2.3 — DKIM key rotation
Dual-selector overlap: generate the new key, publish both records, wait for propagation, cut over, retire the old selector. Required before P0.2's claim can be restored.

### P2.4 — `DNS_VERIFY_MODE` defaults to `mock`
`packages/core/src/env.ts:70`. Mock auto-passes all domain verification. `.env.prod` correctly sets `live`, so hosted production is fine — but any self-hoster who misses this silently verifies nothing. Flip the default to `live` and make `mock` opt-in.

### P2.5 — RFC-header threading
`In-Reply-To` and `References` appear nowhere in the repo. Threading currently works via a plus-addressed reply token (`reply+<conversationId>@domain`) plus subject normalisation. That breaks when someone replies to a forwarded copy, or from a client that ignores `Reply-To` — and our own replies do not thread correctly in the *recipient's* mail client. Persist outbound `Message-ID`, emit `In-Reply-To`/`References` on replies, and fall back to them on inbound.

---

## P3 — Marketing surfaces to update once P1.1 lands

We are **under-claiming** five shipped things. Under-claiming costs as much as over-claiming.

1. **The suppression doctrine is a product opinion, not a feature.** An unsubscribe opts out of bulk mail only and can never block a transactional password reset or a live reply (`apps/worker/src/pipeline.ts:64`). Platform buyers get burned by exactly this elsewhere. Nobody markets it.
2. **"Our sandbox doesn't lie to you."** Test sends are excluded from reputation scoring, and sends to the reserved test recipient take the real provider path with simulated events rejected. The reasoning is already written in the code comments and it is better copy than what is on the site.
3. **Rule-based audiences** — a list can be a rule, not just a membership.
4. **Campaign pre-flight with per-recipient overrides** — read and edit an individual's rendered copy before send. Not in Resend, Postmark or Loops. Demo-able.
5. **Compliance breadth** — SAML, SCIM, GDPR export/deletion, retention with redaction that preserves provability, RBAC with custom roles, audited impersonation, BIMI readiness, three SDKs, a CLI.

---

## The unified line — every surface repeats this

> **Rootmail is email infrastructure for platforms that send on behalf of their customers. Sub-tenancy is in the data model, not the price list — every client gets their own domain, their own DKIM keys, their own suppression list, and their own reputation score you can actually see.**

Every clause is verified true today. Nothing in it promises isolation we do not yet enforce.

When P1.1 ships, it gains: *"— and a bad tenant gets throttled automatically before it costs anyone else."*

---

## Never claim until the code lands

- Automatic reputation-based throttling or pausing of a bad tenant → P1.1
- "One client's mistake never touches another's delivery" → needs P1.1 **and** per-tenant IP isolation
- Automatic DKIM rotation → P2.3
- RFC-header threading → P2.5
- "Tamper-evident" or "legal-grade" audit log → needs a hash chain or DB-level append-only. Say "cryptographically signed, independently verifiable proof of a message's lifecycle and content hash", which is true.
- That the product has automated tests → P1.3

## Suggested order for one focused session

P0.1 → P0.2 → P0.3 → P1.4 → P1.1 → P1.3 (tests for what you just built) → P1.2 → P2.1

Ship P0 and P1.4 even if nothing else lands. They are small and they remove real exposure.
