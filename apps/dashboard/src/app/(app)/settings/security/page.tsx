import type { Metadata } from "next";
import { api } from "@/lib/rootmail";
import { SettingsItem, SettingsSection, StateBadge } from "../setting-item";
import { EmailPrefsCard } from "./email-prefs-card";
import { MfaCard } from "./mfa-card";

export const metadata: Metadata = { title: "Security & login · Settings" };

// Two independent switches. They used to sit in two full Cards — header, a
// description paragraph, and the control always open underneath — which is a lot
// of furniture around "is 2FA on?". As rows, the page states both answers at a
// glance, and the multi-step enrolment only appears when you ask for it.
export default async function SecuritySettingsPage() {
  let mfaEnabled = false;
  let announcementOptOut = false;
  try {
    const me = await api.me();
    mfaEnabled = me.user.mfa_enabled;
    announcementOptOut = me.user.announcement_opt_out;
  } catch {
    /* render defaults if the lookup fails */
  }

  return (
    <div className="space-y-8">
      <SettingsSection title="Signing in">
        <SettingsItem
          label="Two-factor authentication"
          description="Ask for a code from your authenticator app on top of your password. The single biggest thing you can do to protect this account."
          value={
            mfaEnabled ? <StateBadge tone="ok">On</StateBadge> : <StateBadge tone="warn">Off</StateBadge>
          }
          openLabel={mfaEnabled ? "Manage" : "Set up"}
          closeLabel="Close"
          // Off is the state worth acting on, so that row starts open rather than
          // hiding the one thing we'd like you to do behind another click.
          defaultOpen={!mfaEnabled}
        >
          <MfaCard enabled={mfaEnabled} />
        </SettingsItem>
      </SettingsSection>

      <SettingsSection title="What we send you">
        <SettingsItem
          label="Product announcements"
          description="Occasional news about what's new. Essential account and security emails are always sent — those you can't turn off, and we keep them rare."
          control={<EmailPrefsCard initialOptOut={announcementOptOut} />}
        />
      </SettingsSection>
    </div>
  );
}
