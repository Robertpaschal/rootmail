#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { RootMail, RootMailError } from "@rootmail/node";

// A thin terminal/CI wrapper over @rootmail/node. Auth comes from the
// ROOTMAIL_API_KEY env var (rm_live_… / rm_test_…); ROOTMAIL_API_URL overrides
// the base URL. Every command takes --json to print the raw response.

interface Args {
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq >= 0) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
          flags[a.slice(2)] = next;
          i++;
        } else {
          flags[a.slice(2)] = true;
        }
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

function client(): RootMail {
  const apiKey = process.env.ROOTMAIL_API_KEY;
  if (!apiKey) {
    console.error("rootmail: set ROOTMAIL_API_KEY (rm_live_… or rm_test_…).");
    process.exit(1);
  }
  return new RootMail({ apiKey, baseUrl: process.env.ROOTMAIL_API_URL });
}

function str(v: string | boolean | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/** Pragmatic CSV → import entries (detects email / reason / name columns). */
function csvEntries(path: string, kind: "suppressions" | "contacts") {
  const rows = readFileSync(path, "utf8")
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => l.split(",").map((c) => c.trim().replace(/^"|"$/g, "")));
  if (rows.length === 0) return [];
  const first = rows[0].map((c) => c.toLowerCase());
  const hasHeader = first.some((c) => c.includes("email") || c.includes("address"));
  const data = hasHeader ? rows.slice(1) : rows;
  const emailCol = hasHeader ? first.findIndex((c) => c.includes("email") || c.includes("address")) : 0;
  const reasonCol = hasHeader ? first.findIndex((c) => /reason|type|status|event/.test(c)) : -1;
  const nameCol = hasHeader ? first.findIndex((c) => c.includes("name") && !c.includes("email")) : -1;
  const out: { email: string; reason?: string; name?: string }[] = [];
  for (const r of data) {
    const email = (r[emailCol] ?? "").trim();
    if (!email.includes("@")) continue;
    out.push(
      kind === "suppressions"
        ? { email, reason: reasonCol >= 0 ? r[reasonCol] : undefined }
        : { email, name: nameCol >= 0 ? r[nameCol] : undefined },
    );
  }
  return out;
}

const HELP = `rootmail — CLI for rootmail email infrastructure

Usage: rootmail <command> [options]   (auth via ROOTMAIL_API_KEY)

  send --to <email> --subject <s> --html <h>     Send an email
  send --to <email> --template <slug>            …or from a template
  messages [--status <s>] [--limit <n>]          Recent messages
  templates                                      List templates
  domains                                         List sub-tenant sending domains
  domains:auth <id>                              SPF/DKIM/DMARC/BIMI audit for a domain
  deliverability                                 Reputation score + rates
  analytics                                      Engagement funnel + rates
  import:suppressions <file.csv> [--source <s>]  Bulk-import a suppression list
  import:contacts <file.csv> [--list <id>]       Bulk-import contacts
  assistant <prompt…>                            Ask the in-app agent
  help                                           Show this help

Add --json to any command to print the raw response.
Env: ROOTMAIL_API_KEY (required), ROOTMAIL_API_URL (default http://localhost:4000).`;

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { positional, flags } = parseArgs(rest);
  const json = flags.json === true;
  const show = (obj: unknown, summary: () => void) => (json ? console.log(JSON.stringify(obj, null, 2)) : summary());

  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    console.log(HELP);
    return;
  }

  const c = client();

  switch (cmd) {
    case "send": {
      const to = str(flags.to);
      if (!to) throw new Error("send: --to is required");
      const msg = await c.send({
        to,
        subject: str(flags.subject),
        html: str(flags.html),
        template: str(flags.template),
      });
      show(msg, () => console.log(`✓ ${msg.id} — ${msg.status} → ${msg.to}`));
      break;
    }
    case "messages": {
      const res = await c.messages.list({ status: str(flags.status), limit: Number(flags.limit) || undefined });
      show(res, () => {
        for (const m of res.data) console.log(`${m.status.padEnd(10)} ${m.to.padEnd(32)} ${m.subject ?? ""}`);
        console.log(`(${res.data.length} messages)`);
      });
      break;
    }
    case "templates": {
      const res = await c.templates.list();
      show(res, () => {
        for (const t of res.data) console.log(`${t.slug.padEnd(28)} ${t.name}`);
        console.log(`(${res.data.length} templates)`);
      });
      break;
    }
    case "domains": {
      const res = await c.subTenants.list();
      show(res, () => {
        for (const s of res.data) console.log(`${s.status.padEnd(22)} ${s.sending_domain}  (${s.id})`);
        console.log(`(${res.data.length} sub-tenants)`);
      });
      break;
    }
    case "domains:auth": {
      const id = positional[0];
      if (!id) throw new Error("domains:auth: a sub-tenant id is required");
      const r = await c.subTenants.auth(id);
      show(r, () => {
        console.log(`${r.domain} — ${r.summary.passing}/${r.summary.total} passing`);
        for (const i of r.items) console.log(`  ${i.label.padEnd(6)} ${i.status}${i.recommendation ? ` — ${i.recommendation}` : ""}`);
      });
      break;
    }
    case "deliverability": {
      const r = await c.deliverability.get({ windowDays: Number(flags.days) || undefined });
      show(r, () =>
        console.log(
          `Score ${r.score ?? "—"}/100 (${r.status}) · delivery ${r.rates.delivery}% · bounce ${r.rates.bounce}% · complaint ${r.rates.complaint}%`,
        ),
      );
      break;
    }
    case "analytics": {
      const r = await c.analytics.get({ windowDays: Number(flags.days) || undefined });
      show(r, () =>
        console.log(
          `Sent ${r.funnel.sent} · delivered ${r.funnel.delivered} (${r.rates.delivery}%) · opened ${r.funnel.opened} (${r.rates.open}%) · clicked ${r.funnel.clicked} (${r.rates.click}%)`,
        ),
      );
      break;
    }
    case "import:suppressions": {
      const file = positional[0];
      if (!file) throw new Error("import:suppressions: a CSV file path is required");
      const entries = csvEntries(file, "suppressions");
      const r = await c.imports.suppressions({ entries, source: str(flags.source) });
      show(r, () => console.log(`Imported ${r.imported} suppressions (${r.duplicates ?? 0} dupes, ${r.invalid} invalid).`));
      break;
    }
    case "import:contacts": {
      const file = positional[0];
      if (!file) throw new Error("import:contacts: a CSV file path is required");
      const entries = csvEntries(file, "contacts").map((e) => ({ email: e.email, name: e.name }));
      const r = await c.imports.contacts({ entries, listId: str(flags.list) });
      show(r, () =>
        console.log(`Imported ${r.imported} contacts (${r.existing ?? 0} existing, ${r.invalid} invalid${r.added_to_list ? `, ${r.added_to_list} added to list` : ""}).`),
      );
      break;
    }
    case "assistant": {
      const prompt = positional.join(" ").trim();
      if (!prompt) throw new Error("assistant: provide a prompt, e.g. rootmail assistant \"why did my last email bounce?\"");
      const r = await c.assistant.ask(prompt);
      show(r, () => {
        console.log(r.reply);
        if (r.actions.length) console.log(`\n[${r.actions.map((a) => `${a.tool}·${a.status}`).join(", ")}] · ${r.source} · credits ${r.credits.used}/${r.credits.allowance}`);
      });
      break;
    }
    default:
      console.error(`rootmail: unknown command "${cmd}". Run "rootmail help".`);
      process.exit(1);
  }
}

main().catch((err) => {
  if (err instanceof RootMailError) {
    console.error(`rootmail: ${err.status} ${err.message}`);
  } else {
    console.error(`rootmail: ${err instanceof Error ? err.message : String(err)}`);
  }
  process.exit(1);
});
