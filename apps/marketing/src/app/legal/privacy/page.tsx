import type { Metadata } from "next";
import { DocPage } from "@/components/site/doc-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How rootmail collects, uses, and protects personal data.",
};

export default function PrivacyPage() {
  return (
    <DocPage
      title="Privacy Policy"
      subtitle="How we handle personal data across the rootmail platform."
      updated="June 2026"
    >
      <p className="rounded-md border border-border/60 bg-muted/40 p-3 text-xs">
        This is a starting template, not legal advice. Have counsel review and tailor it before launch.
      </p>

      <h2>Who we are</h2>
      <p>
        rootmail (&ldquo;we&rdquo;) provides email-infrastructure software. This policy covers personal
        data we process as a business — for the data you send <em>through</em> rootmail on behalf of your
        own users, see our <a href="/legal/dpa">Data Processing Addendum</a>.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account data</strong> — name, email, organization, and authentication details.</li>
        <li><strong>Billing data</strong> — plan, usage counts, and payment metadata (processed by Stripe).</li>
        <li><strong>Content &amp; recipients</strong> — the emails, templates, and contact lists you create.</li>
        <li><strong>Usage &amp; logs</strong> — API requests, delivery events, IP addresses, and device info.</li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To operate, secure, and improve the service and its deliverability.</li>
        <li>To meter usage, bill your plan, and prevent abuse.</li>
        <li>To provide support and send service notices.</li>
      </ul>

      <h2>Sharing &amp; subprocessors</h2>
      <p>
        We don&apos;t sell personal data. We share it only with subprocessors that help run the service
        (e.g. cloud hosting, an email-sending provider, and payment processing), each under contract. A
        current subprocessor list is available on request.
      </p>

      <h2>Retention</h2>
      <p>
        We keep account and content data for as long as your account is active, then delete or anonymize it
        within a reasonable period, except where we must retain records to meet legal obligations.
      </p>

      <h2>Your rights</h2>
      <p>
        Depending on your region, you may access, correct, export, or delete your personal data. You can
        export or delete account data from the dashboard or by contacting us; we respond within applicable
        timeframes.
      </p>

      <h2>Security</h2>
      <p>
        We protect data with encryption in transit, hashed credentials, scoped access, and audit logging.
        See our <a href="/legal/security">security overview</a>.
      </p>

      <h2>Contact</h2>
      <p>
        Questions or requests: <a href="mailto:privacy@rootmail.io">privacy@rootmail.io</a>.
      </p>
    </DocPage>
  );
}
