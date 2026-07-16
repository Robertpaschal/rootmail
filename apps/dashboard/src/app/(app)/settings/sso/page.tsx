import type { Metadata } from "next";
import { FeatureLocked, type FeatureLockedInfo, asFeatureLocked } from "@/components/app/feature-locked";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { Reveal } from "@/components/app/motion";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { SsoConnection } from "@/lib/types";
import { SsoManager } from "./sso-manager";

export const metadata: Metadata = { title: "Single sign-on · Settings" };

// SAML SSO unlocks via the SSO + SCIM add-on. Probe the gated endpoint and let
// the API's 402 payload drive the lock screen — it carries the real add-on
// name, price, and the exact purchase deep-link, so this page can never drift
// from the live catalog.
export default async function SsoSettingsPage() {
  let connection: SsoConnection | null = null;
  let locked: FeatureLockedInfo | null = null;
  let failed: string | null = null;
  let isApiErr = false;
  try {
    connection = (await api.getSsoConnection()).connection;
  } catch (err) {
    if (err instanceof ApiError && err.code === "feature_locked") locked = asFeatureLocked(err.details);
    else if (err instanceof ConnectionError || err instanceof ApiError) {
      failed = err.message;
      isApiErr = err instanceof ApiError;
    } else {
      failed = "An unexpected error occurred.";
    }
  }

  if (failed) return <ConnectionErrorCard message={failed} showReconnect={isApiErr} />;
  if (locked) {
    return (
      <Reveal>
        <FeatureLocked
          info={locked}
          blurb="Your team signs in through Okta, Microsoft Entra ID, Google Workspace, or any SAML identity provider — with just-in-time provisioning, SCIM deprovisioning, and optional enforcement."
        />
      </Reveal>
    );
  }

  return <SsoManager connection={connection} />;
}
