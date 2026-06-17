import type { Metadata } from "next";
import { DocPage } from "@/components/site/doc-page";

export const metadata: Metadata = {
  title: "Data Processing Addendum",
  description: "How rootmail processes personal data on your behalf as a processor.",
};

export default function DpaPage() {
  return (
    <DocPage
      title="Data Processing Addendum"
      subtitle="Governs personal data we process on your behalf as a processor."
      updated="June 17, 2026"
    >
      <p>
        This Data Processing Addendum (&ldquo;DPA&rdquo;) forms part of the{" "}
        <a href="/legal/terms">Terms of Service</a> between rootmail and Customer and applies to the
        extent rootmail processes Personal Data on Customer&apos;s behalf in providing the Services.
        Terms not defined here have the meaning given in the Terms or in applicable Data Protection
        Laws (e.g. the EU/UK GDPR and the CCPA/CPRA).
      </p>

      <h2>1. Roles of the parties</h2>
      <p>
        For Personal Data contained in Customer Content (recipient data, message content, and related
        events), Customer is the <strong>controller</strong> and rootmail is the{" "}
        <strong>processor</strong>. Where Customer is itself a processor for its own customers
        (including via sub-tenants), rootmail acts as a sub-processor. rootmail processes such Personal
        Data only on Customer&apos;s documented instructions, which include the Terms and Customer&apos;s
        configuration and use of the Services.
      </p>

      <h2>2. Processing details (Annex I)</h2>
      <ul>
        <li><strong>Subject matter &amp; duration:</strong> processing for the term of the Terms and until deletion under Section 8.</li>
        <li><strong>Nature &amp; purpose:</strong> hosting, rendering, sending, routing, tracking, auditing, and proving email the Customer instructs rootmail to send, and providing related dashboard and API functionality.</li>
        <li><strong>Categories of data subjects:</strong> Customer&apos;s users, contacts, and email recipients (and, for sub-tenancy, those of Customer&apos;s customers).</li>
        <li><strong>Categories of Personal Data:</strong> identifiers (name, email address), message content and metadata, contact attributes and tags, and technical data (IP address, delivery/engagement events).</li>
        <li><strong>Special categories:</strong> not intended; Customer must not submit special-category data except as separately agreed.</li>
      </ul>

      <h2>3. Obligations of rootmail</h2>
      <ul>
        <li>process Personal Data only on Customer&apos;s documented instructions, and inform Customer if an instruction infringes Data Protection Laws;</li>
        <li>ensure personnel authorized to process Personal Data are bound by confidentiality;</li>
        <li>implement and maintain the technical and organizational measures in Section 6 (Annex II);</li>
        <li>assist Customer, taking into account the nature of processing, with data-subject requests and with its obligations regarding security, breach notification, and data-protection impact assessments; and</li>
        <li>make available information reasonably necessary to demonstrate compliance with this DPA.</li>
      </ul>

      <h2>4. Sub-processors (Annex III)</h2>
      <p>
        Customer authorizes rootmail to engage the following sub-processors, each under a written
        contract imposing data-protection obligations no less protective than this DPA:
      </p>
      <ul>
        <li><strong>Amazon Web Services, Inc.</strong> — hosting, storage (S3), email delivery (SES); United States.</li>
        <li><strong>Stripe, Inc.</strong> — payment and subscription processing; United States.</li>
        <li><strong>Anthropic, PBC</strong> — AI features where used by Customer; United States.</li>
      </ul>
      <p>
        rootmail will give Customer prior notice of any intended addition or replacement of a
        sub-processor and an opportunity to object on reasonable data-protection grounds; if the
        parties cannot resolve the objection, Customer may terminate the affected Services.
      </p>

      <h2>5. International transfers</h2>
      <p>
        Where processing involves a transfer of Personal Data from the EEA, UK, or Switzerland to a
        country without an adequacy decision, the parties incorporate the European Commission&apos;s
        Standard Contractual Clauses (and the UK Addendum/Swiss amendments, as applicable), which are
        deemed entered into and completed with the details in this DPA.
      </p>

      <h2>6. Security measures (Annex II)</h2>
      <p>rootmail maintains measures appropriate to the risk, including:</p>
      <ul>
        <li>encryption of data in transit (TLS) and hashing of credentials and API keys;</li>
        <li>workspace- and tenant-scoped access controls and least-privilege internal access;</li>
        <li>signed, idempotent webhooks and SSRF protections;</li>
        <li>append-only audit logging of message lifecycle and privileged staff actions;</li>
        <li>network isolation for data stores and regular patching; and</li>
        <li>access review and incident-response procedures.</li>
      </ul>
      <p>
        See the <a href="/legal/security">security overview</a>. rootmail may update measures provided
        they do not materially reduce protection.
      </p>

      <h2>7. Data subject requests &amp; breach notification</h2>
      <p>
        rootmail will, to the extent legally permitted, promptly notify Customer of a request received
        directly from a data subject and assist Customer in responding using the export and deletion
        tooling in the Services. rootmail will notify Customer without undue delay after becoming aware
        of a Personal Data Breach affecting Customer&apos;s Personal Data, with information reasonably
        available to assist Customer&apos;s own notification obligations.
      </p>

      <h2>8. Deletion &amp; return</h2>
      <p>
        On termination or expiry, and at Customer&apos;s choice, rootmail will delete or return
        Customer&apos;s Personal Data and delete existing copies within a reasonable period (generally
        within 90 days), except where retention is required by law. Customer may export its data for 30
        days after termination as described in the Terms.
      </p>

      <h2>9. Audits</h2>
      <p>
        rootmail will make available information necessary to demonstrate compliance and will allow for
        and contribute to audits, including inspections, conducted by Customer or an auditor mandated by
        Customer, subject to reasonable confidentiality, scheduling, and security requirements.
      </p>

      <h2>10. Liability</h2>
      <p>
        Each party&apos;s liability under this DPA is subject to the limitations and exclusions of
        liability set out in the Terms.
      </p>

      <h2>11. Contact</h2>
      <p>
        Data-protection contact: <a href="mailto:privacy@rootmail.io">privacy@rootmail.io</a>.
      </p>
    </DocPage>
  );
}
