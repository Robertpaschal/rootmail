import { and, eq } from "drizzle-orm";
import { env, generateApiKey, newId } from "@rootmail/core";
import {
  apiKeys,
  closeDb,
  db,
  organizations,
  type Organization,
  orgAddons,
  templates,
  type Workspace,
  workspaces,
} from "./index";
import { ensureAddons, ensurePlans } from "./seed-catalog";

// No staff are seeded — the first staff account is created via the gated
// first-run bootstrap (POST /v1/admin/auth/bootstrap), so there's never a
// hardcoded admin login in any environment.

async function ensureOrganization(): Promise<Organization> {
  const [existing] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, "acme"))
    .limit(1);
  if (existing) {
    // Normalize the demo org to Scale so the SDK smoke test and dashboard demo
    // exercise the full feature set (sub-tenants, threads, RBAC). Fresh signups
    // still start on Free, where feature-gating is demonstrable.
    if (existing.plan !== "scale") {
      await db
        .update(organizations)
        .set({ plan: "scale", updatedAt: new Date() })
        .where(eq(organizations.id, existing.id));
      existing.plan = "scale";
    }
    return existing;
  }

  const [row] = await db
    .insert(organizations)
    .values({ id: newId("organization"), name: "Acme Inc", slug: "acme", plan: "scale" })
    .returning();
  return row;
}

async function ensureWorkspace(
  organizationId: string,
  name: string,
  slug: string,
  environment: "live" | "test",
): Promise<Workspace> {
  const [existing] = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.organizationId, organizationId), eq(workspaces.slug, slug)))
    .limit(1);
  if (existing) return existing;

  const [row] = await db
    .insert(workspaces)
    .values({ id: newId("workspace"), organizationId, name, slug, environment })
    .returning();
  return row;
}

async function ensureWelcomeTemplate(workspaceId: string): Promise<void> {
  const [existing] = await db
    .select()
    .from(templates)
    .where(and(eq(templates.workspaceId, workspaceId), eq(templates.slug, "welcome")))
    .limit(1);
  if (existing) return;

  await db.insert(templates).values({
    id: newId("template"),
    workspaceId,
    name: "Welcome",
    slug: "welcome",
    type: "transactional",
    subject: "Welcome to {{product}}, {{name}}!",
    html:
      '<h1>Welcome, {{name}} 👋</h1>' +
      "<p>Thanks for joining {{product}} — we're glad you're here.</p>" +
      '<p><a href="{{action_url}}">Get started</a></p>',
    text: "Welcome, {{name}}!\n\nThanks for joining {{product}}.\nGet started: {{action_url}}",
    variablesSchema: { name: "string", product: "string", action_url: "string (url)" },
  });
}

async function createApiKey(
  workspaceId: string,
  name: string,
  mode: "live" | "test",
): Promise<string> {
  const generated = generateApiKey(mode);
  await db.insert(apiKeys).values({
    id: newId("apiKey"),
    workspaceId,
    name,
    prefix: generated.prefix,
    last4: generated.last4,
    keyHash: generated.hash,
    mode,
  });
  return generated.key;
}

async function main() {
  await ensurePlans();
  await ensureAddons();
  const org = await ensureOrganization();
  // Sub-tenant-pack headroom for the demo org: showcases an add-on line on the
  // collective bill AND keeps repeated smoke runs (each creates a sub-tenant)
  // from hitting the Scale ceiling.
  await db
    .insert(orgAddons)
    .values({ id: newId("orgAddon"), organizationId: org.id, addonId: "subtenant_pack", quantity: 5 })
    .onConflictDoUpdate({
      target: [orgAddons.organizationId, orgAddons.addonId],
      set: { quantity: 5, updatedAt: new Date() },
    });
  const production = await ensureWorkspace(org.id, "Production", "production", "live");
  const sandbox = await ensureWorkspace(org.id, "Sandbox", "sandbox", "test");
  await ensureWelcomeTemplate(production.id);

  const liveKey = await createApiKey(production.id, "Seed key", "live");
  const testKey = await createApiKey(sandbox.id, "Seed test key", "test");

  const line = "─".repeat(64);
  console.log(`\n${line}`);
  console.log("  rootmail — seed complete");
  console.log(line);
  console.log(`  Organization : ${org.name}  (${org.id})`);
  console.log(`  Workspace    : ${production.name}  (${production.id})  [live]`);
  console.log(`  Workspace    : ${sandbox.name}  (${sandbox.id})  [test]`);
  console.log(`  Template     : welcome  (transactional)`);
  console.log(line);
  console.log("  LIVE API key (copy now — only its hash is stored):\n");
  console.log(`      ${liveKey}\n`);
  console.log("  TEST API key:\n");
  console.log(`      ${testKey}`);
  console.log(line);
  console.log("  Admin console (apps/admin): bootstrap the first staff with\n");
  console.log("      POST /v1/admin/auth/bootstrap  { email, password, secret: INTERNAL_API_SECRET }");
  console.log(line);
  console.log("  Send your first email:\n");
  console.log(`    curl -s ${env.PUBLIC_API_URL}/v1/messages \\`);
  console.log(`      -H "Authorization: Bearer ${liveKey}" \\`);
  console.log(`      -H "Content-Type: application/json" \\`);
  console.log(
    `      -d '{"to":"ada@example.com","template":"welcome",` +
      `"variables":{"name":"Ada","product":"rootmail","action_url":"https://rootmail.io"}}'`,
  );
  console.log(`${line}\n`);

  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => {});
  process.exit(1);
});
