-- Suppressions must survive the deletion of the client they came from.
--
-- With ON DELETE CASCADE, deleting a sub-tenant erased every bounce and
-- complaint suppression collected under it — making delete + re-create a
-- one-call reset of both the suppression list and the reputation score.
-- Orphaned rows become workspace-level, which isSuppressed already treats as
-- blocking everything in the workspace.
ALTER TABLE "suppressions" DROP CONSTRAINT IF EXISTS "suppressions_sub_tenant_id_sub_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "suppressions" ADD CONSTRAINT "suppressions_sub_tenant_id_sub_tenants_id_fk"
  FOREIGN KEY ("sub_tenant_id") REFERENCES "public"."sub_tenants"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
