/**
 * Design-system conformance audit.
 *
 * "Consistent" is not a vibe — it is a set of rules that either hold on every
 * page or do not. This script checks the rules from `docs/design/` statically
 * across all four apps, so drift is caught the same way a type error is, and
 * so a redesign that only reached the homepage is visible as a number rather
 * than discovered by a person clicking around.
 *
 *   pnpm exec tsx scripts/design-audit.ts            # summary per app
 *   pnpm exec tsx scripts/design-audit.ts --files    # every offending file
 *   pnpm exec tsx scripts/design-audit.ts --rule=raw-palette
 *
 * Exits non-zero if any BLOCKING rule is violated, so CI can gate on it.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

type Rule = {
  id: string;
  /** Blocking rules fail the build; advisory ones are reported only. */
  blocking: boolean;
  why: string;
  test: RegExp;
  /**
   * Whole-file exemption. `content-gating-motion` uses it to tell the real bug
   * from a false positive: an entrance animation on content that is ALWAYS in
   * the DOM hides that content when frames are frozen, but a panel that mounts
   * on a click is legitimately absent until the click. `AnimatePresence` in the
   * file is the signal that the mount is conditional and user-driven.
   */
  fileExempt?: RegExp;
};

const RULES: Rule[] = [
  {
    id: "raw-palette",
    blocking: true,
    why: "Colour asserts STATE. Use witnessed/acted/stopped (+ .tint) — raw palette values have no dark-mode counterpart.",
    test: /\b(?:bg|text|border|ring|from|via|to|decoration|outline|shadow)-(?:amber|red|green|emerald|blue|sky|violet|orange|yellow|rose|indigo|purple|teal|cyan|lime|fuchsia|pink)-\d{2,3}\b/,
  },
  {
    id: "content-gating-motion",
    blocking: true,
    why: "Content hidden until an animation runs is content that sometimes does not exist. rAF AND setTimeout freeze in hidden tabs.",
    test: /initial=\{\{[^}]*opacity:\s*0/,
    fileExempt: /AnimatePresence/,
  },
  {
    id: "banned-duration",
    blocking: true,
    why: "Motion is two tiers with an empty middle: duration-interaction (100ms) or duration-narrative (700ms).",
    test: /\bduration-(?:150|200|300|500)\b/,
  },
  {
    id: "absence-headline",
    blocking: true,
    why: "A headline naming the absence of a thing carries no information. Say what the thing does.",
    test: /(?:title|headline)=\{?["'](?:No |Nothing |None )/,
  },
  {
    id: "banned-words",
    blocking: true,
    why: "Voice rules: these words are the register of the black box.",
    test: /\b(?:seamless|effortless|effortlessly|blazing|supercharge|enterprise-grade|Oops)\b/i,
  },
  {
    /* THE ONE THAT IS ABOUT TRUTH, NOT TASTE.
       An open is a tracking pixel firing and roughly a third are a mail client
       pre-loading an image; a click can be a security scanner. Drawing either in
       the colour reserved for "a provider confirmed this" is the industry's
       founding lie, and it shipped in two of our own files before this rule
       existed — `opened` sharing `success` with `delivered` on the message page,
       and opens rendering LOUDER than deliveries on the campaign page. */
    id: "inferred-as-witnessed",
    blocking: true,
    why: "An inferred event (opened/clicked) must never render in the witnessed/success treatment. Use the inferred tone — muted ink, hollow, never a signal fill.",
    test:
      /(?:opened|clicked|open|click)\s*:\s*\{?[^\n}]*(?:"success"|text-witnessed|bg-witnessed)|label:\s*"(?:Opened|Clicked)"[^}]*state:\s*"witnessed"|state:\s*"witnessed"[^}]*label:\s*"(?:Opened|Clicked)"/,
  },
  {
    /* Every number ships with the window it covers and the method that produced
       it. `<Metric>` enforces this by TYPE; this catches the hand-rolled ones. */
    id: "unsourced-metric",
    blocking: false,
    why: "A figure set in the display face needs its window and method beside it — use <Metric>, which requires both.",
    test: /className=\{?"[^"]*display-num[^"]*"[^>]*>\s*\{?[\d,.$%]/,
  },
  {
    /* Deliverability is not ours to promise. Nobody can guarantee the inbox, and
       the people who say so are why our buyer stopped believing dashboards. */
    id: "delivery-overclaim",
    blocking: true,
    why: "Nobody can guarantee inbox placement. Say what we do (authenticate, throttle, report), never what a mailbox provider will decide.",
    test: /guarantee[ds]?\s+(?:delivery|the\s+inbox|inbox\s+placement)|never\s+lands?\s+in\s+spam|100%\s+deliver|inbox\s+guaranteed/i,
  },
  {
    id: "decorative-blur",
    blocking: false,
    why: "Decorative glows assert nothing. Colour is information or it does not ship.",
    test: /blur-\[\d+px\]/,
  },
  {
    id: "gradient-text",
    blocking: false,
    why: "Gradient headlines are the most anonymous mark in software.",
    test: /bg-clip-text/,
  },
  {
    /* RETIRED 2026-08-28. The rule enforced a 0.25rem radius, and the owner's
       verdict on the result was "flat and boring and square". Curves are now
       the direction: `--radius` is 1rem and the preset exposes a real scale up
       to 3xl. What replaces it is the opposite check — a hardcoded pixel radius
       bypasses the scale and cannot follow a future change. */
    id: "hardcoded-radius",
    blocking: false,
    why: "Use the radius scale (rounded-sm…3xl); a hardcoded rounded-[Npx] cannot follow the token.",
    test: /\brounded-\[[0-9]/,
  },
  {
    id: "emoji",
    blocking: false,
    why: "No emoji, anywhere.",
    test: /[\u{1F300}-\u{1FAFF}\u{2700}-\u{27BF}\u{2600}-\u{26FF}]/u,
  },
];

const APPS = ["marketing", "developers", "dashboard", "admin"] as const;

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx") || p.endsWith(".ts")) out.push(p);
  }
  return out;
}

const args = process.argv.slice(2);
const showFiles = args.includes("--files");
const only = args.find((a) => a.startsWith("--rule="))?.split("=")[1];

type Hit = { file: string; line: number; text: string };
const results = new Map<string, Map<string, Hit[]>>(); // app -> rule -> hits

for (const app of APPS) {
  const perRule = new Map<string, Hit[]>();
  for (const file of walk(`apps/${app}/src`)) {
    const src = readFileSync(file, "utf8");
    const lines = src.split("\n");
    lines.forEach((line, i) => {
      // A line that is only a comment is documentation, not shipped UI.
      if (/^\s*(?:\/\/|\*|\/\*)/.test(line)) return;
      for (const rule of RULES) {
        if (only && rule.id !== only) continue;
        if (rule.fileExempt?.test(src)) continue;
        if (rule.test.test(line)) {
          const arr = perRule.get(rule.id) ?? [];
          arr.push({ file: file.replace(`apps/${app}/src/`, ""), line: i + 1, text: line.trim().slice(0, 90) });
          perRule.set(rule.id, arr);
        }
      }
    });
  }
  results.set(app, perRule);
}

// --- foundation checks: does each app even consume the system? ---
console.log("FOUNDATION\n");
console.log("app          tokens.css  next/font  preset");
for (const app of APPS) {
  const css = (() => { try { return readFileSync(`apps/${app}/src/app/globals.css`, "utf8"); } catch { return ""; } })();
  const layout = (() => { try { return readFileSync(`apps/${app}/src/app/layout.tsx`, "utf8"); } catch { return ""; } })();
  const tw = (() => { try { return readFileSync(`apps/${app}/tailwind.config.ts`, "utf8"); } catch { return ""; } })();
  const y = (b: boolean) => (b ? "yes" : "NO ");
  console.log(
    `${app.padEnd(12)} ${y(css.includes("@rootmail/design/tokens.css")).padEnd(11)} ${y(layout.includes("next/font")).padEnd(10)} ${y(tw.includes("rootmailPreset"))}`,
  );
}

console.log("\n\nRULE CONFORMANCE  (violations per app)\n");
const shown = RULES.filter((r) => !only || r.id === only);
const head = "rule".padEnd(24) + APPS.map((a) => a.slice(0, 9).padStart(11)).join("") + "   total";
console.log(head);
console.log("-".repeat(head.length));

let blockingTotal = 0;
for (const rule of shown) {
  const counts = APPS.map((a) => results.get(a)!.get(rule.id)?.length ?? 0);
  const total = counts.reduce((x, y) => x + y, 0);
  if (rule.blocking) blockingTotal += total;
  const mark = rule.blocking ? "!" : " ";
  console.log(
    `${mark}${rule.id.padEnd(23)}` + counts.map((c) => String(c).padStart(11)).join("") + String(total).padStart(8),
  );
}
console.log("\n! = blocking\n");

for (const rule of shown) {
  const all = APPS.flatMap((a) => (results.get(a)!.get(rule.id) ?? []).map((h) => ({ ...h, app: a })));
  if (!all.length) continue;
  console.log(`\n── ${rule.id} — ${all.length} ──`);
  console.log(`   ${rule.why}`);
  const byFile = new Map<string, number>();
  for (const h of all) byFile.set(`${h.app}/${h.file}`, (byFile.get(`${h.app}/${h.file}`) ?? 0) + 1);
  const sorted = [...byFile].sort((a, b) => b[1] - a[1]);
  for (const [f, n] of showFiles ? sorted : sorted.slice(0, 6)) console.log(`   ${String(n).padStart(4)}  ${f}`);
  if (!showFiles && sorted.length > 6) console.log(`         … ${sorted.length - 6} more files (--files)`);
}

console.log(`\n\nBlocking violations: ${blockingTotal}`);
process.exit(blockingTotal > 0 ? 1 : 0);
