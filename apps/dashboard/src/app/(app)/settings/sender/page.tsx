import type { Metadata } from "next";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { Organization, SenderIdentity } from "@/lib/types";
import { OwnReplyDomain } from "./own-reply-domain";
import { ReplySettings } from "./reply-settings";
import { SenderForm } from "./sender-form";
import { SendersManager } from "./senders-manager";

export const metadata: Metadata = { title: "Sending · Settings" };

// Everything about WHO your email comes from: the from-addresses you own (so
// mail carries your name, and replies land in your real inbox) and the postal
// address anti-spam law requires on marketing mail.
export default async function SenderSettingsPage() {
  let org: Organization;
  let senders: SenderIdentity[] = [];
  try {
    const [o, sn] = await Promise.all([
      api.getOrganization(),
      api.listSenders().catch(() => ({ data: [] as SenderIdentity[] })),
    ]);
    org = o;
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
        <CardContent className="space-y-5">
          <ReplySettings initial={org.reply_mode} />
          <div className="border-t pt-5">
            <p className="mb-1 text-sm font-medium">Replies on your own domain <span className="font-normal text-muted-foreground">· optional</span></p>
            <p className="mb-3 text-xs text-muted-foreground">
              By default replies come in on a rootmail address. Point a subdomain of yours at us and recipients reply to
              your brand instead — still captured in the inbox above.
            </p>
            <OwnReplyDomain initial={org} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Postal address</CardTitle>
          <CardDescription>
            The physical postal address for {org.name || "your organization"}, added automatically —
            with the unsubscribe link — to the footer of every <strong>marketing</strong> and{" "}
            <strong>sales</strong> send, as anti-spam law requires. Receipts and other transactional
            mail never get the footer. A street address, P.O. box, or registered agent address all
            qualify.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SenderForm initial={org.postal_address ?? ""} />
        </CardContent>
      </Card>
    </div>
  );
}
