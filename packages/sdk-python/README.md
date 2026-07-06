# rootmail — Python SDK

The official Python client for the [rootmail](https://rootmail.io) email API. Zero
dependencies (standard library only), Python 3.8+.

```bash
pip install rootmail
```

## Quickstart

```python
from rootmail import RootMail

client = RootMail(api_key="rm_live_...", base_url="https://api.rootmail.io")

# Send a message (idempotent — safe to retry)
msg = client.messages.send(
    to="you@example.com",
    subject="Welcome",
    html="<h1>Hello 👋</h1>",
)
print(msg["id"], msg["status"])

# Or send a saved template with variables
client.messages.send(to="you@example.com", template="welcome", variables={"name": "Ada"})
```

## Resources

```python
client.messages       # send, list, get, get_audit, get_proof
client.templates      # list, get, create, update, delete
client.contacts       # list, create, delete
client.lists          # list, get, create, delete, contacts, add_contact
client.campaigns      # list, get, create, send, delete, analytics
client.sequences      # list, get, create, update, delete, enroll, enrollments, analytics
client.suppressions   # list, add, check
client.sub_tenants    # list, get, create, auth   (per-customer sending domains)
client.analytics      # get(window_days=...)
client.deliverability # get(window_days=...)
client.imports        # contacts(entries=...), suppressions(entries=...)
client.assistant      # chat(prompt=...)
```

## Sub-tenants

Scope every request to one of your customers' sending domains:

```python
tenant = client.with_sub_tenant("subt_123")
tenant.messages.send(to="user@theircompany.com", subject="Hi", html="…")
```

## Errors

```python
from rootmail import RootMailError

try:
    client.messages.send(to="x@example.com", subject="Hi", html="…")
except RootMailError as e:
    print(e.status, e.code, e.message)   # e.g. 402 feature_locked "…"
```

Responses and request fields use the API's `snake_case` names and are returned as
plain dictionaries.
