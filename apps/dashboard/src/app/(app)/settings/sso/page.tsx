import type { Metadata } from "next";
import { FeatureLocked } from "@/components/app/feature-locked";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { SsoConnection } from "@/lib/types";
import { SsoManager } from "./sso-manager";

export const metadata: Metadata = { title: "Single sign-on · Settings" };

// SAML SSO is an Enterprise capability. Gate on the plan feature, then hand the
// org's connection (or null) to the view-first manager.
export default async function SsoSettingsPage() {
  let hasSso = false;
  let connection: SsoConnection | null = null;
  let failed: string | null = null;
  let isApiErr = false;
  try {
    const billing = await api.getBilling();
    hasSso = billing.plan.features.includes("sso");
    if (hasSso) connection = (await api.getSsoConnection()).connection;
  } catch (err) {
    if (err instanceof ConnectionError || err instanceof ApiError) {
      failed = err.message;
      isApiErr = err instanceof ApiError;
    } else {
      failed = "An unexpected error occurred.";
    }
  }

  if (failed) return <ConnectionErrorCard message={failed} showReconnect={isApiErr} />;
  if (!hasSso) {
    return (
      <FeatureLocked
        info={{ feature: "sso", required_plan_name: "Enterprise" }}
        blurb="SAML single sign-on lets your team sign in through Okta, Microsoft Entra ID, Google Workspace, or any SAML identity provider — with just-in-time provisioning and optional enforcement. It's an Enterprise feature."
      />
    );
  }

  return <SsoManager connection={connection} />;
}
