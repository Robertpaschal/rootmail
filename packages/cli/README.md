# @rootmail/cli

Command-line interface for [rootmail](https://rootmail.io) — send, inspect, import, and
ask the assistant from your terminal or CI.

```bash
npm i -g @rootmail/cli
export ROOTMAIL_API_KEY=rm_live_…          # required
export ROOTMAIL_API_URL=https://api.rootmail.io   # optional (default http://localhost:4000)
```

## Commands

```bash
rootmail send --to you@example.com --subject "Hi" --html "<p>Hello</p>"
rootmail send --to you@example.com --template welcome
rootmail messages --status bounced --limit 20
rootmail templates
rootmail domains                       # sub-tenant sending domains
rootmail domains:auth tnt_…            # SPF / DKIM / DMARC / BIMI audit
rootmail deliverability                # reputation score + rates
rootmail analytics                     # sent → delivered → opened → clicked funnel
rootmail import:suppressions list.csv --source sendgrid
rootmail import:contacts contacts.csv --list lst_…
rootmail assistant "why did my last email bounce?"
```

Add `--json` to any command to print the raw API response (handy for piping into `jq`).

CSV imports auto-detect the email / reason / name columns, so a raw export from
SendGrid, Postmark or Mailgun works as-is.

Built on [`@rootmail/node`](../sdk).
