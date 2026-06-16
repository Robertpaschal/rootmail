import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/rootmail";
import { MfaCard } from "./mfa-card";

export default async function SecurityPage() {
  let enabled = false;
  try {
    enabled = (await api.me()).user.mfa_enabled;
  } catch {
    /* ignore — render the default (off) state if the lookup fails */
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Security</h1>
        <p className="text-sm text-muted-foreground">Manage how you protect your account.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Two-factor authentication</CardTitle>
          <CardDescription>
            Require a time-based code from an authenticator app when you sign in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MfaCard enabled={enabled} />
        </CardContent>
      </Card>
    </div>
  );
}
