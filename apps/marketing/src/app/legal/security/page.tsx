import type { Metadata } from "next";
import { DocPage } from "@/components/site/doc-page";

export const metadata: Metadata = {
  title: "Security",
  description: "How rootmail protects your data and your sending.",
};

export default function SecurityPage() {
  return (
    <DocPage title="Security" subtitle="How we protect your data and your sending reputation." updated="June 2026">
      <h2>Authentication</h2>
      <p>
        API keys and dashboard sessions are stored only as hashes — the raw value is shown once. Passwords
        use scrypt. Optional two-factor (TOTP) with single-use recovery codes, plus login lockout and
        sign-up rate limits to blunt abuse.
      </p>

      <h2>Authorization &amp; isolation</h2>
      <p>
        Role-based permissions gate every action, and every resource is scoped to its workspace and
        organization — one tenant can never read or change another&apos;s data. Plan features are enforced
        server-side.
      </p>

      <h2>Data protection</h2>
      <p>
        Encryption in transit, validated request input, and append-only audit logs. Exportable Layer-3 proof
        bundles are Ed25519-signed and pin a hash of exactly what was sent.
      </p>

      <h2>Sending safety</h2>
      <p>
        Test-mode sends never reach real inboxes; DKIM/SPF/DMARC authenticate the sending domain; and
        bounces and complaints feed an automatic suppression list to protect deliverability.
      </p>

      <h2>Webhooks</h2>
      <p>
        Inbound webhooks (billing, email events) are signature-verified and idempotent; outbound webhook
        targets are checked to prevent requests to internal networks.
      </p>

      <h2>Reporting</h2>
      <p>
        Found an issue? Email <a href="mailto:security@rootmail.io">security@rootmail.io</a>.
      </p>
    </DocPage>
  );
}
