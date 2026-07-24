import { FeatureLocked, type FeatureLockedInfo, asFeatureLocked } from "@/components/app/feature-locked";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { Reveal } from "@/components/app/motion";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { SsoConnection } from "@/lib/types";
import { SsoManager } from "../settings/sso/sso-manager";

/**
 * The Single sign-on tab of the Team hub — SSO is how the TEAM signs in, so it
 * belongs with the team, not buried in Settings. Probes the gated endpoint and
 * lets the API's 402 payload drive the lock screen (real add-on name, price,
 * purchase deep-link — can never drift from the live catalog).
 */
export async function SsoSection() {
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
