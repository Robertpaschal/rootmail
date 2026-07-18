import type { Metadata } from "next";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { SenderIdentity } from "@/lib/types";
import { ReplySettings } from "./reply-settings";
import { SenderForm } from "./sender-form";
import { SendersManager } from "./senders-manager";

export const metadata: Metadata = { title: "Sending · Settings" };

// Everything about WHO your email comes from: the from-addresses you own (so
// mail carries your name, and replies land in your real inbox) and the postal
// address anti-spam law requires on marketing mail.
export default async function SenderSettingsPage() {
  let postal = "";
  let orgName = "";
  let replyMode: "inbox" | "own_mailbox" = "inbox";
  let senders: SenderIdentity[] = [];
  try {
    const [org, sn] = await Promise.all([
      api.getOrganization(),
      api.listSenders().catch(() => ({ data: [] as SenderIdentity[] })),
    ]);
    postal = org.postal_address ?? "";
    orgName = org.name;
    replyMode = org.reply_mode;
    senders = sn.data;
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
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your sending addresses</CardTitle>
          <CardDescription>
            Send email as yourself — hello@yourcompany.com instead of a rootmail address. We email
            that inbox a confirmation link; once clicked, it appears in compose&apos;s From menu,
            and replies go straight to your real inbox.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SendersManager senders={senders} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">When people reply</CardTitle>
          <CardDescription>
            Every email opens a conversation. Choose where a reply goes when someone writes back — into
            your <strong>Replies</strong> inbox here (one thread per person, answer in-app), or straight
            to your own mailbox.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReplySettings initial={replyMode} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Postal address</CardTitle>
          <CardDescription>
            The physical postal address for {orgName || "your organization"}, added automatically —
            with the unsubscribe link — to the footer of every <strong>marketing</strong> and{" "}
            <strong>sales</strong> send, as anti-spam law requires. Receipts and other transactional
            mail never get the footer. A street address, P.O. box, or registered agent address all
            qualify.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SenderForm initial={postal} />
        </CardContent>
      </Card>
    </div>
  );
}
