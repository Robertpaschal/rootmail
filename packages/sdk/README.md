# @rootmail/node

Official Node.js SDK for [rootmail](https://rootmail.io) — unified email
infrastructure for transactional, marketing, and sales mail, with sub-tenancy
and full audit trails.

```bash
npm install @rootmail/node
```

Requires Node.js ≥ 18 (uses the global `fetch`).

## Usage

```ts
import { RootMail } from "@rootmail/node";

const mail = new RootMail({
  apiKey: process.env.ROOTMAIL_API_KEY!,
  baseUrl: "http://localhost:4000", // defaults to http://localhost:4000
});
```

### Send

```ts
// Via a template
await mail.send({
  to: "user@example.com",
  template: "welcome",
  variables: { name: "Ada", product: "rootmail" },
  idempotencyKey: `welcome-${user.id}`,
});

// Inline HTML
await mail.send({
  to: { email: "user@example.com", name: "Ada" },
  subject: "Hello {{name}}",
  html: "<h1>Hi {{name}}</h1>",
  variables: { name: "Ada" },
  priority: "high",
  sendAt: new Date(Date.now() + 60_000), // schedule
});
```

`send()` returns the created `Message`. Reusing an `idempotencyKey` returns the
original message instead of sending again.

### Messages

```ts
const message = await mail.messages.get(id);
const { data } = await mail.messages.list({ limit: 20, status: "delivered" });
const { trail } = await mail.messages.audit(id);  // full lifecycle
await mail.messages.recordEvent(id, { event: "opened", ip: "102.x.x.x" });
```

### Sub-tenants

Give your platform's customers their own verified sending domain.

```ts
const tenant = await mail.subTenants.create({
  name: "Sunset Villas",
  sendingDomain: "sunsetvillas.com",
  externalId: "customer_8821",        // your id for this customer
});

// tenant.dns_records — show these in your own onboarding UI
for (const r of tenant.dns_records!) {
  console.log(r.type, r.host, "→", r.value);
}

const result = await mail.subTenants.verify(tenant.id);
if (result.verified) {
  // Send from the customer's domain
  await mail.withSubTenant(tenant.id).send({
    to: "guest@gmail.com",
    subject: "Booking confirmed",
    html: "<h1>See you soon!</h1>",
  });
}
```

`mail.withSubTenant(id)` returns a client scoped to that sub-tenant (every
request carries the `X-Rootmail-Subtenant` header).

### Contacts & suppression

```ts
await mail.contacts.upsert({ email: "user@example.com", name: "Ada", tags: ["beta"] });
await mail.contacts.unsubscribe("user@example.com");
const suppressed = await mail.contacts.isSuppressed("user@example.com");
```

## Error handling

Failed requests throw `RootMailError` with `status`, `code`, `message`, and
optional `details`:

```ts
import { RootMailError } from "@rootmail/node";

try {
  await mail.send({ to: "x@example.com", subject: "Hi", html: "<p>Hi</p>" });
} catch (err) {
  if (err instanceof RootMailError) {
    console.error(err.status, err.code, err.message);
  }
}
```
