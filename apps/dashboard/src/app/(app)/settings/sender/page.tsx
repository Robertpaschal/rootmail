import type { Metadata } from "next";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import { SenderForm } from "./sender-form";

export const metadata: Metadata = { title: "Sender address · Settings" };

// CAN-SPAM (and its cousins abroad) require commercial email to carry the
// sender's physical postal address. rootmail appends it — with the unsubscribe
// link — to every marketing/sales send automatically once it's set here.
// Transactional mail is exempt and never gets the footer.
export default async function SenderAddressPage() {
  let postal = "";
  let orgName = "";
  try {
    const org = await api.getOrganization();
    postal = org.postal_address ?? "";
    orgName = org.name;
  } catch (err) {
    return (
      <ConnectionErrorCard
        message={
          err instanceof ConnectionError || err instanceof ApiError
            ? err.message
            : "An unexpected error occurred."
        }
        showReconnect={err instanceof ApiError}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Postal address</CardTitle>
        <CardDescription>
          The physical postal address for {orgName || "your organization"}, appended automatically —
          with the unsubscribe link — to the footer of every <strong>marketing</strong> and{" "}
          <strong>sales</strong> send. Transactional mail (receipts, resets) is exempt and never
          gets the footer. A street address, P.O. box, or registered agent address all qualify.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SenderForm initial={postal} />
      </CardContent>
    </Card>
  );
}
