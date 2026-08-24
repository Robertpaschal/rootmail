-- Per-customer SES domain identities.
--
-- The previous scheme generated a DKIM keypair per sub-tenant and never signed
-- with it: SES signs via Easy DKIM on our own verified domain, so customer mail
-- carried d=<our domain> and DMARC never aligned for the customer. Registering
-- the domain with SES is required anyway — SES refuses a From address whose
-- domain is not a verified identity — and once registered, Easy DKIM signs as
-- the customer's own domain and Amazon manages the keys.
ALTER TABLE "sub_tenants" ADD COLUMN IF NOT EXISTS "ses_dkim_tokens" jsonb;
ALTER TABLE "sub_tenants" ADD COLUMN IF NOT EXISTS "ses_identity_status" text;
