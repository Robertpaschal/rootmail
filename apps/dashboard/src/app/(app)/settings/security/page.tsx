import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/rootmail";
import { EmailPrefsCard } from "./email-prefs-card";
import { MfaCard } from "./mfa-card";

export const metadata: Metadata = { title: "Security & login · Settings" };

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
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Two-factor authentication</CardTitle>
          <CardDescription>
            Require a time-based code from an authenticator app when you sign in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MfaCard enabled={mfaEnabled} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Email preferences</CardTitle>
          <CardDescription>Choose which non-essential emails rootmail sends you.</CardDescription>
        </CardHeader>
        <CardContent>
          <EmailPrefsCard initialOptOut={announcementOptOut} />
        </CardContent>
      </Card>
    </div>
  );
}
