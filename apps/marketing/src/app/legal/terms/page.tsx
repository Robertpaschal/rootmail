import type { Metadata } from "next";
import { DocPage } from "@/components/site/doc-page";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern your use of rootmail.",
};

export default function TermsPage() {
  return (
    <DocPage
      title="Terms of Service"
      subtitle="The agreement between you and rootmail."
      updated="June 2026"
    >
      <p className="rounded-md border border-border/60 bg-muted/40 p-3 text-xs">
        This is a starting template, not legal advice. Have counsel review and tailor it before launch.
      </p>

      <h2>Acceptance</h2>
      <p>By creating an account or using rootmail, you agree to these terms on behalf of yourself and your organization.</p>

      <h2>The service</h2>
      <p>
        rootmail provides APIs and a dashboard for sending, managing, and auditing email. We may update
        features over time; we aim to give notice of material changes.
      </p>

      <h2>Acceptable use &amp; anti-spam</h2>
      <ul>
        <li>Send only to recipients who have a lawful basis or consent to receive your mail.</li>
        <li>Comply with anti-spam laws (e.g. CAN-SPAM, CASL, GDPR), including a valid physical address and a working unsubscribe in marketing mail.</li>
        <li>Honor unsubscribe and suppression requests; don&apos;t attempt to bypass them.</li>
        <li>No unlawful, deceptive, or abusive content; no compromising the service&apos;s integrity or security.</li>
      </ul>
      <p>We may suspend sending that threatens deliverability or violates these rules.</p>

      <h2>Your content</h2>
      <p>
        You retain ownership of your content and are responsible for it and for your recipients&apos; data.
        You grant us the rights needed to process and deliver it on your behalf.
      </p>

      <h2>Billing</h2>
      <p>
        Paid plans bill in advance; usage above your plan&apos;s quota bills as overage. Fees are
        non-refundable except where required by law. You can change or cancel your plan from the dashboard.
      </p>

      <h2>Termination</h2>
      <p>
        You may stop using the service anytime. We may suspend or terminate accounts that violate these
        terms or create risk. On termination, we delete or return your data per our policies.
      </p>

      <h2>Disclaimers &amp; liability</h2>
      <p>
        The service is provided &ldquo;as is.&rdquo; To the extent permitted by law, our liability is limited
        to the amount you paid in the prior 12 months, and we&apos;re not liable for indirect or consequential
        damages.
      </p>

      <h2>Contact</h2>
      <p><a href="mailto:legal@rootmail.io">legal@rootmail.io</a></p>
    </DocPage>
  );
}
