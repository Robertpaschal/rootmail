import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/rootmail";
import { EmailPrefsCard } from "./email-prefs-card";
import { MfaCard } from "./mfa-card";
import { SenderAddressForm } from "./sender-address-form";

export default async function SettingsPage() {
  let mfaEnabled = false;
  let postalAddress = "";
  let announcementOptOut = false;
  try {
    const [me, org] = await Promise.all([api.me(), api.getOrganization()]);
    mfaEnabled = me.user.mfa_enabled;
    announcementOptOut = me.user.announcement_opt_out;
    postalAddress = org.postal_address ?? "";
  } catch {
    /* render defaults if a lookup fails */
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Account security and sending compliance.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Two-factor authentication</CardTitle>
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
          <CardTitle>Sender address</CardTitle>
          <CardDescription>
            Your physical postal address — added automatically to the footer of marketing and sales
            emails to meet CAN-SPAM. Transactional mail is unaffected.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SenderAddressForm initial={postalAddress} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email preferences</CardTitle>
          <CardDescription>Choose which non-essential emails rootmail sends you.</CardDescription>
        </CardHeader>
        <CardContent>
          <EmailPrefsCard initialOptOut={announcementOptOut} />
        </CardContent>
      </Card>
    </div>
  );
}
