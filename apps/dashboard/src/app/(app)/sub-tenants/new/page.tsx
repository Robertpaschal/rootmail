import type { Metadata } from "next";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { FeatureLocked, type FeatureLockedInfo, asFeatureLocked } from "@/components/app/feature-locked";
import { PageHeader } from "@/components/app/page-header";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import { NewClientDomainFlow } from "./new-flow";

export const metadata: Metadata = { title: "Add a client domain" };

// Guard the DESTINATION, not just the entry (the cohesion rule): this page is
// reachable by URL and from the list, so it probes the same gated endpoint the
// list does and renders the sell screen rather than letting someone walk a
// three-stage flow that would 402 at the end of it.
export default async function NewClientDomainPage() {
  let locked: FeatureLockedInfo | null = null;
  let failed: string | null = null;
  try {
    await api.listSubTenants();
  } catch (err) {
    if (err instanceof ApiError && err.code === "feature_locked") locked = asFeatureLocked(err.details);
    else if (err instanceof ConnectionError || err instanceof ApiError) failed = err.message;
    else failed = "An unexpected error occurred.";
  }

  if (locked) {
    return (
      <>
        <PageHeader title="Add a client domain" backHref="/sub-tenants" backLabel="Client domains" />
        <FeatureLocked
          info={locked}
          blurb="Client domains let your customers send under their own verified domains, each with its own DKIM keys and its own reputation score."
        />
      </>
    );
  }

  if (failed) {
    return (
      <>
        <PageHeader title="Add a client domain" backHref="/sub-tenants" backLabel="Client domains" />
        <ConnectionErrorCard message={failed} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Add a client domain"
        description="Three steps: name it, publish the DNS, verify. You can stop after any of them and pick it up later."
        backHref="/sub-tenants"
        backLabel="Client domains"
      />
      <NewClientDomainFlow mockDns={process.env.DNS_VERIFY_MODE === "mock"} />
    </>
  );
}
