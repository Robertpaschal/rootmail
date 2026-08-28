import type { Metadata } from "next";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { Organization, SenderIdentity , SendingProvider} from "@/lib/types";
import { SettingsItem, SettingsSection, StateBadge } from "../setting-item";
import { OwnReplyDomain } from "./own-reply-domain";
import { PostalAddress } from "./postal-address";
import { ReplySettings } from "./reply-settings";
import { SendersManager } from "./senders-manager";
import { SendingAccount } from "./sending-account";

export const metadata: Metadata = { title: "Sending · Settings" };

// Everything about WHO your email comes from. Three different KINDS of thing, so
// three different shapes rather than three identical cards:
//   • addresses — a collection you manage, so it keeps a section of its own
//   • replies   — a choice + an optional DNS setup, so: rows that state the
//                 current answer and unfold to change it
//   • postal    — one value, so: a row that shows it and edits on demand
export default async function SenderSettingsPage() {
  let org: Organization;
  let senders: SenderIdentity[] = [];
  let sendingProvider: SendingProvider | null = null;
  try {
    const [o, sn, sp] = await Promise.all([
      api.getOrganization(),
      api.listSenders().catch(() => ({ data: [] as SenderIdentity[] })),
      // Never fatal: not having connected an account is the common case, and a
      // failure to READ that fact should not take down the whole page.
      api.getSendingProvider().catch(() => null),
    ]);
    org = o;
    senders = sn.data;
    sendingProvider = sp;
  } catch (err) {
    return (
      <ConnectionErrorCard
        message={
          err instanceof ConnectionError || err instanceof ApiError
            ? err.message
            : "An unexpected error occurred."
        }
        status={err instanceof ApiError ? err.status : undefined}
      />
    );
  }

  const verified = senders.filter((s) => s.status === "verified").length;
  const pending = senders.filter((s) => s.status === "pending").length;
  const hasPostal = Boolean(org.postal_address?.trim());
  const domainActive = org.reply_domain_status === "active";

  return (
    <div className="space-y-8">
      {/* First on the page, because it is upstream of everything below it: which
          account the mail actually leaves from decides whose reputation and whose
          limits apply to all of it. */}
      <SettingsSection
        title="Where your mail sends from"
        hint="rootmail can deliver your mail, or you can keep the provider you already use and let rootmail be the layer on top."
      >
        <div className="divide-y rounded-lg border bg-card">
          <SendingAccount current={sendingProvider} />
        </div>
      </SettingsSection>

      {/* A collection, not a setting — it gets room to be a list. */}
      <SettingsSection
        title="Your sending addresses"
        hint="Send as hello@yourcompany.com instead of a rootmail address. We email that inbox a confirmation link; once it's clicked, the address appears in the From menu when you compose."
      >
        <div className="p-4">
          <SendersManager senders={senders} />
        </div>
      </SettingsSection>

      <SettingsSection
        title="When people reply"
        hint="Every email you send opens a conversation. These decide where the other half of it goes."
      >
        <SettingsItem
          label="Where replies land"
          description="Into your Replies inbox here, where each person is one thread you can answer in-app — or straight to your own mailbox."
          value={
            <StateBadge tone="ok">
              {org.reply_mode === "own_mailbox" ? "Your own mailbox" : "Replies inbox"}
            </StateBadge>
          }
        >
          <ReplySettings initial={org.reply_mode} />
        </SettingsItem>

        <SettingsItem
          label="Replies on your own domain"
          description="By default people reply to a rootmail address. Point a subdomain of yours at us and they reply to your brand instead — still captured in the inbox above."
          value={
            domainActive ? (
              <StateBadge tone="ok">{org.reply_domain ?? "Active"}</StateBadge>
            ) : org.reply_domain_status === "pending" ? (
              <StateBadge tone="warn">Awaiting DNS</StateBadge>
            ) : (
              <StateBadge tone="muted">Optional</StateBadge>
            )
          }
          openLabel={org.reply_domain_status === "none" ? "Set up" : "Manage"}
          closeLabel="Close"
        >
          <OwnReplyDomain initial={org} />
        </SettingsItem>
      </SettingsSection>

      <SettingsSection title="Required on marketing mail">
        <SettingsItem
          label="Postal address"
          description={
            <>
              A physical address for {org.name || "your organization"} goes in the footer of every{" "}
              <strong>marketing</strong> and <strong>sales</strong> send, next to the unsubscribe link,
              as anti-spam law requires. Receipts and other transactional mail never get a footer. A
              street address, P.O. box or registered agent address all qualify.
            </>
          }
          value={hasPostal ? <StateBadge tone="ok">Set</StateBadge> : <StateBadge tone="warn">Missing</StateBadge>}
          openLabel={hasPostal ? "Edit" : "Add address"}
          closeLabel="Close"
        >
          <PostalAddress initial={org.postal_address ?? ""} />
        </SettingsItem>
      </SettingsSection>

      {/* One quiet line of orientation, since verified > 0 is what actually
          unlocks sending as yourself. */}
      <p className="text-xs text-muted-foreground">
        {verified > 0
          ? `${verified} address${verified === 1 ? "" : "es"} verified${pending ? ` · ${pending} still awaiting confirmation` : ""}.`
          : "Until an address is verified, your mail goes out from a rootmail address."}
      </p>
    </div>
  );
}
