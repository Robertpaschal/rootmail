import type { Metadata } from "next";
import { DocPage } from "@/components/site/doc-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How rootmail collects, uses, shares, and protects personal data.",
};

export default function PrivacyPage() {
  return (
    <DocPage
      title="Privacy Policy"
      subtitle="How we handle personal data across the rootmail platform."
      updated="June 17, 2026"
    >
      <p>
        This Privacy Policy explains how rootmail (&ldquo;rootmail,&rdquo; &ldquo;we,&rdquo;
        &ldquo;us,&rdquo; or &ldquo;our&rdquo;) collects, uses, discloses, and safeguards personal
        data when you visit our website, create an account, or use our email-infrastructure
        services (collectively, the &ldquo;Services&rdquo;). It applies to personal data for which
        we act as a <strong>controller</strong> — primarily data about our customers and website
        visitors.
      </p>
      <p>
        When you send email <em>through</em> the Services to your own recipients, you act as the
        controller of that data and we act as your <strong>processor</strong>; that relationship is
        governed by our <a href="/legal/dpa">Data Processing Addendum</a> (&ldquo;DPA&rdquo;), not
        this Policy.
      </p>

      <h2>1. Information we collect</h2>
      <ul>
        <li>
          <strong>Account &amp; identity data</strong> — name, email address, organization name,
          hashed authentication credentials, and multi-factor settings.
        </li>
        <li>
          <strong>Billing data</strong> — plan, subscription status, usage counts, and payment
          metadata. Card details are collected and stored by our payment processor (Stripe), not by
          us.
        </li>
        <li>
          <strong>Customer content</strong> — templates, messages, contacts, sub-tenant
          configuration, and recipient data you submit. We process this on your behalf under the DPA.
        </li>
        <li>
          <strong>Usage &amp; device data</strong> — API requests, delivery and engagement events,
          log files, IP address, browser/device information, and approximate location derived from
          IP.
        </li>
        <li>
          <strong>Cookies</strong> — strictly-necessary cookies (e.g. an httpOnly session cookie for
          the dashboard). We do not use advertising cookies.
        </li>
      </ul>

      <h2>2. How and why we use personal data</h2>
      <p>We use personal data to:</p>
      <ul>
        <li>provide, operate, secure, and improve the Services and their deliverability;</li>
        <li>authenticate users and protect accounts;</li>
        <li>meter usage, process payments, and bill your plan;</li>
        <li>detect, prevent, and investigate fraud, abuse, and security incidents;</li>
        <li>provide support and send service and transactional notices; and</li>
        <li>comply with legal obligations and enforce our agreements.</li>
      </ul>
      <p>
        Where the GDPR or similar laws apply, our legal bases are: <strong>performance of a
        contract</strong> (providing the Services), <strong>legitimate interests</strong> (securing
        and improving the Services, preventing abuse), <strong>consent</strong> (where required, e.g.
        certain communications), and <strong>compliance with a legal obligation</strong>.
      </p>

      <h2>3. How we share personal data</h2>
      <p>
        We do <strong>not</strong> sell personal data and do not share it for cross-context
        behavioral advertising. We disclose personal data only to:
      </p>
      <ul>
        <li>
          <strong>Sub-processors</strong> that help us run the Services, each under a written
          contract with confidentiality and security obligations — see Section 4;
        </li>
        <li>
          <strong>professional advisers</strong> (e.g. auditors, lawyers) under confidentiality;
        </li>
        <li>
          <strong>authorities</strong> where required by law, or to protect our rights, users, or the
          public; and
        </li>
        <li>
          a <strong>successor entity</strong> in connection with a merger, acquisition, or asset sale,
          subject to this Policy.
        </li>
      </ul>

      <h2>4. Sub-processors</h2>
      <p>We rely on the following sub-processors to deliver the Services:</p>
      <ul>
        <li>
          <strong>Amazon Web Services, Inc.</strong> — cloud hosting, storage (S3), and email
          delivery (SES). United States.
        </li>
        <li>
          <strong>Stripe, Inc.</strong> — payment processing and subscription billing. United States.
        </li>
        <li>
          <strong>Anthropic, PBC</strong> — AI features (template drafting and the assistant), where
          you use them. United States.
        </li>
      </ul>
      <p>
        The current list is maintained in our <a href="/legal/dpa">DPA</a>. We notify customers of
        material changes so they may object as provided there.
      </p>

      <h2>5. International transfers</h2>
      <p>
        We and our sub-processors may process personal data in the United States and other countries.
        Where we transfer personal data out of the EEA, the UK, or Switzerland, we rely on appropriate
        safeguards such as the European Commission&apos;s Standard Contractual Clauses and equivalent
        mechanisms.
      </p>

      <h2>6. Data retention</h2>
      <p>
        We retain account and content data for as long as your account is active and as needed to
        provide the Services. After account closure we delete or anonymize personal data within a
        reasonable period (generally 90 days), except where longer retention is required for legal,
        accounting, dispute-resolution, or security purposes. You can export or delete account data at
        any time (Section 7).
      </p>

      <h2>7. Your rights and choices</h2>
      <p>
        Depending on your location, you may have the right to access, correct, delete, port, or
        restrict processing of your personal data, to object to processing, and to withdraw consent.
        California residents may request to know, delete, and correct personal information, and to opt
        out of &ldquo;sale&rdquo;/&ldquo;sharing&rdquo; (which we do not do); we will not discriminate
        for exercising these rights.
      </p>
      <ul>
        <li>
          <strong>Self-serve:</strong> export your account data with{" "}
          <code>GET /v1/account/export</code> and delete your organization from the dashboard or with{" "}
          <code>DELETE /v1/account</code>.
        </li>
        <li>
          <strong>By request:</strong> email{" "}
          <a href="mailto:privacy@rootmail.io">privacy@rootmail.io</a>. We respond within the
          timeframes required by applicable law and may need to verify your identity.
        </li>
      </ul>
      <p>
        If you are in the EEA/UK, you may also lodge a complaint with your local data-protection
        authority.
      </p>

      <h2>8. Security</h2>
      <p>
        We protect personal data with encryption in transit, hashed credentials and API keys,
        least-privilege and workspace-scoped access, signed and idempotent webhooks, and append-only
        audit logging. See our <a href="/legal/security">security overview</a>. No method of
        transmission or storage is perfectly secure, but we work to protect your data and to notify
        you of incidents as required by law.
      </p>

      <h2>9. Children</h2>
      <p>
        The Services are not directed to children under 16, and we do not knowingly collect their
        personal data. If you believe a child has provided us personal data, contact us and we will
        delete it.
      </p>

      <h2>10. Changes to this Policy</h2>
      <p>
        We may update this Policy from time to time. We will post the updated version with a new
        &ldquo;last updated&rdquo; date and, for material changes, provide additional notice (e.g. by
        email or in-app).
      </p>

      <h2>11. Contact us</h2>
      <p>
        For privacy questions or to exercise your rights, contact{" "}
        <a href="mailto:privacy@rootmail.io">privacy@rootmail.io</a>. For data we process on your
        behalf, see the <a href="/legal/dpa">DPA</a>.
      </p>
    </DocPage>
  );
}
