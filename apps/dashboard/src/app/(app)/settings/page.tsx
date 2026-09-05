import type { Metadata } from "next";
import { api } from "@/lib/rootmail";
import type { Organization, SenderIdentity } from "@/lib/types";
import { SettingsIndex, type SettingGroup } from "./settings-index";

export const metadata: Metadata = { title: "Settings" };

// /settings used to redirect straight into Profile, which meant the section had
// no map: you couldn't see what was configurable, what it was set to, or that
// half of what people call "settings" (team, plan, keys) lives elsewhere. This
// is that map — every row carries its live value, so the page answers "what is
// this set to?" without making you open it.
export default async function SettingsHubPage() {
  let org: Organization | null = null;
  let senders: SenderIdentity[] = [];
  let mfaEnabled = false;
  let announcementOptOut = false;
  let userName = "";
  let userEmail = "";
  let emailVerified = false;

  // Every lookup is advisory — a settings map that fails because one call failed
  // is worse than one with a few unknowns in it.
  const [meRes, orgRes, senderRes] = await Promise.allSettled([
    api.me(),
    api.getOrganization(),
    api.listSenders(),
  ]);
  if (meRes.status === "fulfilled") {
    mfaEnabled = meRes.value.user.mfa_enabled;
    announcementOptOut = meRes.value.user.announcement_opt_out;
    userName = meRes.value.user.name ?? "";
    userEmail = meRes.value.user.email ?? "";
    emailVerified = meRes.value.user.email_verified;
  }
  if (orgRes.status === "fulfilled") org = orgRes.value;
  if (senderRes.status === "fulfilled") senders = senderRes.value.data;

  const verified = senders.filter((s) => s.status === "verified");
  const pending = senders.filter((s) => s.status === "pending");
  const hasPostal = Boolean(org?.postal_address?.trim());
  const ssoEntitled = org?.features?.includes("sso") ?? false;
  const replyDomainActive = org?.reply_domain_status === "active";

  const groups: SettingGroup[] = [
    {
      label: "You",
      rows: [
        {
          id: "profile",
          label: "Profile",
          blurb: "Your name and picture, shown across rootmail.",
          href: "/settings/profile",
          value: userName || userEmail || "Not set",
          tone: userName ? "ok" : "muted",
          keywords: ["name", "avatar", "picture", "photo", "display name"],
        },
        {
          id: "email",
          label: "Your email address",
          blurb: "Where rootmail reaches you about your own account.",
          href: "/settings/profile",
          value: emailVerified ? "Verified" : userEmail ? "Unverified" : "—",
          tone: emailVerified ? "ok" : "warn",
          attention: userEmail && !emailVerified ? "Not verified" : undefined,
          keywords: ["email", "address", "verify", "confirm"],
        },
        {
          id: "mfa",
          label: "Two-factor authentication",
          blurb: "Ask for a code from your authenticator app at sign-in.",
          href: "/settings/security",
          value: mfaEnabled ? "On" : "Off",
          tone: mfaEnabled ? "ok" : "warn",
          attention: mfaEnabled ? undefined : "Off",
          keywords: ["2fa", "mfa", "totp", "authenticator", "security", "login", "password"],
        },
        {
          id: "email-prefs",
          label: "Emails from rootmail",
          blurb: "Which non-essential emails we send you.",
          href: "/settings/security",
          value: announcementOptOut ? "Announcements off" : "All on",
          tone: "muted",
          keywords: ["notifications", "announcements", "unsubscribe", "preferences"],
        },
      ],
    },
    {
      label: "How your email is sent",
      hint: "Who it comes from, where replies land, and what the law needs in the footer.",
      rows: [
        {
          id: "senders",
          label: "Sending addresses",
          blurb: "Verify an address your recipients recognise to enable dashboard sending.",
          href: "/settings/sender",
          value:
            verified.length > 0
              ? `${verified.length} verified${pending.length ? ` · ${pending.length} pending` : ""}`
              : pending.length > 0
                ? `${pending.length} awaiting confirmation`
                : "None yet",
          tone: verified.length > 0 ? "ok" : "warn",
          attention: verified.length === 0 ? "No verified sender" : undefined,
          keywords: ["from", "sender", "identity", "domain", "address"],
        },
        {
          id: "replies",
          label: "Where replies go",
          blurb: "Into your Replies inbox here, or straight to your own mailbox.",
          href: "/settings/sender",
          value: org?.reply_mode === "own_mailbox" ? "Your own mailbox" : "Replies inbox",
          tone: "ok",
          keywords: ["reply", "replies", "inbox", "conversation", "reply-to"],
        },
        {
          id: "reply-domain",
          label: "Replies on your own domain",
          blurb: "Let people reply to your brand instead of a rootmail address.",
          href: "/settings/sender",
          value: replyDomainActive
            ? (org?.reply_domain ?? "Active")
            : org?.reply_domain_status === "pending"
              ? "Awaiting DNS"
              : "Not set up",
          tone: replyDomainActive ? "ok" : "muted",
          keywords: ["dns", "mx", "subdomain", "branded", "reply domain"],
        },
        {
          id: "postal",
          label: "Postal address",
          blurb: "Required by anti-spam law in the footer of marketing and sales mail.",
          href: "/settings/sender",
          value: hasPostal ? "Set" : "Missing",
          tone: hasPostal ? "ok" : "warn",
          attention: hasPostal ? undefined : "Marketing sends need this",
          keywords: ["can-spam", "footer", "compliance", "physical address", "unsubscribe"],
        },
      ],
    },
    {
      label: "Your workspace",
      hint: "These have their own sections — listed here so you don't have to remember where.",
      rows: [
        {
          id: "team",
          label: "Team & roles",
          blurb: "Who can sign in, and what each of them is allowed to do.",
          href: "/members",
          value: "Manage",
          where: "in Team",
          keywords: ["members", "invite", "permissions", "rbac", "roles", "seats"],
        },
        {
          id: "sso",
          label: "Single sign-on (SAML)",
          blurb: "Let your team sign in through your identity provider.",
          href: ssoEntitled ? "/members?tab=sso" : "/billing/addons?focus=sso_scim",
          value: ssoEntitled ? "Configure" : "Not on your plan",
          tone: ssoEntitled ? "muted" : "warn",
          where: ssoEntitled ? "in Team" : "an add-on",
          keywords: ["sso", "saml", "scim", "okta", "identity", "login"],
        },
        {
          id: "billing",
          label: "Plan & usage",
          blurb: "What you're on, what you've used, and every invoice.",
          href: "/billing",
          value: "Manage",
          where: "own section",
          keywords: ["billing", "invoice", "subscription", "upgrade", "payment", "add-ons"],
        },
        {
          id: "client-domains",
          label: "Client sending domains",
          blurb: "Send on behalf of your clients, from their own domains.",
          href: "/sub-tenants",
          value: "Manage",
          where: "own section",
          keywords: ["subtenant", "agency", "client", "dkim", "spf", "dns"],
        },
        {
          id: "compliance",
          label: "Proof & data retention",
          blurb: "Signed exports of what you sent, and how long we keep it.",
          href: "/compliance",
          value: "Manage",
          where: "own section",
          keywords: ["retention", "gdpr", "audit", "export", "residency", "region"],
        },
      ],
    },
    {
      label: "Developers",
      hint: "Only if you're wiring rootmail into your own product — everything else works without them.",
      rows: [
        {
          id: "api-keys",
          label: "API keys",
          blurb: "Keys for sending from your own code.",
          href: "/api-keys",
          value: "Manage",
          where: "own section",
          keywords: ["api", "key", "token", "secret", "sdk"],
        },
        {
          id: "webhooks",
          label: "Webhooks",
          blurb: "Get delivery and engagement events pushed to your endpoint.",
          href: "/webhooks",
          value: "Manage",
          where: "own section",
          keywords: ["webhook", "events", "callback", "endpoint", "signing secret"],
        },
      ],
    },
  ];

  return <SettingsIndex groups={groups} />;
}
