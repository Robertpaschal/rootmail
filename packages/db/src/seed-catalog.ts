import { ADD_ON_IDS, ADD_ONS, AI_CREDITS, PLAN_IDS, PLANS } from "@rootmail/core";
import { addons, db, plans } from "./index";

// The plan + add-on CATALOG seeding, shared by the full demo seed (seed.ts) and
// the prod-safe catalog-only seed (seed-pricing.ts). onConflictDoNothing so
// re-seeding never clobbers prices/grants an admin has since edited in the DB.

export async function ensureAddons(): Promise<void> {
  for (let i = 0; i < ADD_ON_IDS.length; i++) {
    const id = ADD_ON_IDS[i];
    const a = ADD_ONS[id];
    await db
      .insert(addons)
      .values({
        id,
        name: a.name,
        description: a.description,
        unit: a.unit,
        unitAmount: a.defaultUnitAmount,
        grant: a.grant,
        rank: i,
        active: true,
      })
      .onConflictDoNothing({ target: addons.id });
  }
}

export async function ensurePlans(): Promise<void> {
  for (let i = 0; i < PLAN_IDS.length; i++) {
    const id = PLAN_IDS[i];
    const p = PLANS[id];
    await db
      .insert(plans)
      .values({
        id,
        name: p.name,
        price: p.price,
        monthlyQuota: p.monthlyQuota,
        allowOverage: p.allowOverage,
        overagePer1000Cents: Math.round(p.overagePer1000 * 100),
        includedSubTenants: p.includedSubTenants,
        seats: p.seats,
        workspaceLimit: p.workspaceLimit,
        aiCredits: AI_CREDITS[id],
        features: [...p.features],
        rank: i,
        active: true,
      })
      .onConflictDoNothing({ target: plans.id });
  }
}
