"use server";

import { headers } from "next/headers";
import { lookup } from "./lookup";
import type { CheckState, CheckedDomain, Role } from "./types";

/**
 * The page's own entry point.
 *
 * A server action rather than a `fetch`, deliberately: `<form action={…}>`
 * submits and re-renders WITHOUT JavaScript, so the lookup itself survives
 * Law 1 ("kill the JavaScript, read it — is anything missing?"), not just the
 * resting state. It also keeps the domain out of the URL, which is §6.4's
 * no-permalink rule enforced by the mechanism rather than by a promise.
 *
 * Nothing here is logged or persisted. The domain lives for the length of one
 * request and is returned to the person who typed it.
 */
export async function checkDomains(_prev: CheckState, form: FormData): Promise<CheckState> {
  const h = await headers();
  const domain = String(form.get("domain") ?? "");
  const client = String(form.get("client_domain") ?? "").trim();
  const raw = { domain, client };

  const submitted: Array<{ role: Role; raw: string }> = [{ role: "yours", raw: domain }];
  if (client) submitted.push({ role: "client", raw: client });

  const checked: CheckedDomain[] = [];
  for (const entry of submitted) {
    const outcome = await lookup(entry.raw, h);
    if (!outcome.ok) return { kind: "error", message: outcome.message, raw };
    checked.push({ role: entry.role, result: outcome.result });
  }

  return { kind: "done", checked };
}
