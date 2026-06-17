import type { Metadata } from "next";
import { DocPage } from "@/components/site/doc-page";

export const metadata: Metadata = {
  title: "Data Processing Addendum",
  description: "How rootmail processes personal data on your behalf.",
};

export default function DpaPage() {
  return (
    <DocPage
      title="Data Processing Addendum"
      subtitle="Governs personal data we process on your behalf as a processor."
      updated="June 2026"
    >
      <p className="rounded-md border border-border/60 bg-muted/40 p-3 text-xs">
        This is a starting template, not legal advice. Have counsel review and tailor it before launch.
      </p>

      <h2>Roles</h2>
      <p>
        For the recipient data and content you send through rootmail, you are the <strong>controller</strong>
        and rootmail is the <strong>processor</strong>. We process that data only on your documented
        instructions (your use of the service).
      </p>

      <h2>Scope &amp; nature of processing</h2>
      <p>
        We process recipient email addresses, message content, and delivery events for the purpose of
        rendering, sending, tracking, and auditing the email you instruct us to send — for the duration of
        your account.
      </p>

      <h2>Subprocessors</h2>
      <p>
        We engage vetted subprocessors (cloud hosting, an email-sending provider, payment processing) under
        written terms with equivalent data-protection obligations. We&apos;ll give notice of new
        subprocessors and a current list on request.
      </p>

      <h2>Security</h2>
      <p>
        We maintain technical and organizational measures appropriate to the risk — encryption in transit,
        hashed credentials, workspace isolation, signed webhooks, and audit logging. See our{" "}
        <a href="/legal/security">security overview</a>.
      </p>

      <h2>Data subject requests</h2>
      <p>
        We&apos;ll assist you in responding to access, correction, and deletion requests, and provide the
        tooling to export or delete data where feasible.
      </p>

      <h2>Deletion &amp; return</h2>
      <p>
        On termination, we delete or return personal data within a reasonable period, except where retention
        is legally required.
      </p>

      <h2>International transfers</h2>
      <p>
        Where data is transferred across regions, we rely on appropriate safeguards (such as Standard
        Contractual Clauses) as applicable.
      </p>

      <h2>Contact</h2>
      <p><a href="mailto:privacy@rootmail.io">privacy@rootmail.io</a></p>
    </DocPage>
  );
}
