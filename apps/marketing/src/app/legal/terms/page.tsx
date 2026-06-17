import type { Metadata } from "next";
import { DocPage } from "@/components/site/doc-page";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern your access to and use of rootmail.",
};

export default function TermsPage() {
  return (
    <DocPage
      title="Terms of Service"
      subtitle="The agreement between you and rootmail."
      updated="June 17, 2026"
    >
      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) are a binding agreement between rootmail
        (&ldquo;rootmail,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;) and the individual or entity that
        accesses or uses the Services (&ldquo;Customer,&rdquo; &ldquo;you&rdquo;). By creating an
        account, clicking to accept, or using the Services, you agree to these Terms. If you accept on
        behalf of an organization, you represent that you are authorized to bind it.
      </p>

      <h2>1. The Services</h2>
      <p>
        rootmail provides email-infrastructure software — APIs, SDKs, an operator dashboard, and
        related tools for sending, automating, auditing, and proving email. We may add, change, or
        discontinue features; for material adverse changes to a paid feature you rely on, we will use
        reasonable efforts to give advance notice.
      </p>

      <h2>2. Accounts &amp; eligibility</h2>
      <ul>
        <li>You must be at least 18 and able to form a binding contract.</li>
        <li>You are responsible for your account, your users, and all activity under your credentials, and must keep credentials secure (we recommend enabling MFA).</li>
        <li>You must provide accurate information and keep it current.</li>
        <li>Sign-in is via session (email/password or a supported identity provider); API keys authenticate the API and must be kept secret.</li>
      </ul>

      <h2>3. Plans, fees &amp; payment</h2>
      <ul>
        <li><strong>Subscriptions</strong> bill in advance on a monthly or annual cycle and renew automatically until cancelled.</li>
        <li><strong>Usage &amp; overage</strong> above your plan&apos;s included volume bill at the rates shown at purchase. Add-ons bill per unit.</li>
        <li><strong>Taxes</strong> are your responsibility except for taxes on our net income.</li>
        <li><strong>Changes</strong> to your plan take effect as described in the dashboard; we may change prices on renewal with prior notice.</li>
        <li><strong>Non-payment</strong> may result in suspension. Fees are non-refundable except where required by law.</li>
      </ul>

      <h2>4. Acceptable use &amp; anti-spam</h2>
      <p>You agree that you and your users will not:</p>
      <ul>
        <li>send to recipients without a lawful basis or valid consent, or send unsolicited bulk email (spam);</li>
        <li>violate anti-spam or privacy laws (e.g. CAN-SPAM, CASL, GDPR/ePrivacy), including the requirements for a valid physical mailing address and a working unsubscribe in marketing and sales mail;</li>
        <li>fail to honor unsubscribe or suppression requests, or attempt to bypass suppression, quotas, rate limits, or plan boundaries;</li>
        <li>send unlawful, infringing, deceptive, harassing, or harmful content, or phishing or malware;</li>
        <li>probe, scan, overload, or interfere with the Services&apos; integrity or security, or attempt unauthorized access; or</li>
        <li>resell or provide the Services to third parties except through the sub-tenancy features for your own customers, for whose use you remain responsible.</li>
      </ul>
      <p>
        We may throttle, suspend, or terminate sending or accounts that threaten deliverability,
        violate this section, or create legal or security risk — immediately where necessary.
      </p>

      <h2>5. Customer content</h2>
      <p>
        You retain all rights to the templates, messages, contacts, and other data you submit
        (&ldquo;Customer Content&rdquo;). You grant us a worldwide, non-exclusive license to host,
        process, transmit, and display Customer Content solely to provide and secure the Services. You
        are responsible for Customer Content, for having the rights and consents to send it, and for
        your recipients&apos; data. Our processing of personal data in Customer Content is governed by
        the <a href="/legal/dpa">DPA</a>.
      </p>

      <h2>6. Intellectual property &amp; feedback</h2>
      <p>
        We and our licensors own the Services and all related software, designs, and trademarks. No
        rights are granted except as expressly set out here. If you send us feedback or suggestions,
        you grant us a perpetual, royalty-free license to use them without restriction.
      </p>

      <h2>7. Third-party services</h2>
      <p>
        The Services interoperate with third parties (e.g. AWS, Stripe, Anthropic). Your use of those
        services may be subject to their terms, and we are not responsible for them.
      </p>

      <h2>8. Confidentiality</h2>
      <p>
        Each party may receive non-public information of the other. The recipient will protect it with
        reasonable care and use it only to perform under these Terms, except for information that is
        public, independently developed, or rightfully obtained from another source.
      </p>

      <h2>9. Disclaimers</h2>
      <p>
        Except as expressly stated, the Services are provided <strong>&ldquo;as is&rdquo;</strong> and
        <strong> &ldquo;as available,&rdquo;</strong> without warranties of any kind, whether express,
        implied, or statutory, including merchantability, fitness for a particular purpose, and
        non-infringement. We do not warrant uninterrupted or error-free operation, or that any email
        will be delivered, accepted, or placed in any particular folder.
      </p>

      <h2>10. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, neither party is liable for indirect, incidental,
        special, consequential, or punitive damages, or for lost profits, revenue, data, or goodwill.
        Each party&apos;s total aggregate liability arising out of or relating to these Terms will not
        exceed the amounts you paid to us for the Services in the twelve (12) months before the event
        giving rise to the claim. These limits do not apply to your payment obligations or to
        liability that cannot be limited by law.
      </p>

      <h2>11. Indemnification</h2>
      <p>
        You will defend and indemnify rootmail against third-party claims arising from your Customer
        Content, your use of the Services in breach of these Terms or applicable law, or your
        sub-tenants&apos; use.
      </p>

      <h2>12. Term &amp; termination</h2>
      <p>
        These Terms apply while you use the Services. You may stop and cancel at any time from the
        dashboard. Either party may terminate for the other&apos;s material breach not cured within 30
        days&apos; notice; we may suspend or terminate immediately for AUP violations, non-payment, or
        risk. On termination, your right to use the Services ends; you may export your data for 30 days,
        after which we may delete it per our <a href="/legal/privacy">Privacy Policy</a> and{" "}
        <a href="/legal/dpa">DPA</a>. Sections that by their nature should survive (e.g. fees,
        IP, disclaimers, liability, indemnity) survive termination.
      </p>

      <h2>13. Changes to these Terms</h2>
      <p>
        We may update these Terms; we will post the updated version with a new date and, for material
        changes, provide reasonable notice. Continued use after changes take effect constitutes
        acceptance.
      </p>

      <h2>14. Governing law &amp; disputes</h2>
      <p>
        These Terms are governed by the laws of the State of Delaware, USA, without regard to conflict-
        of-laws rules. The state and federal courts located in Delaware have exclusive jurisdiction,
        and each party consents to venue there, except that either party may seek injunctive relief in
        any court of competent jurisdiction to protect its intellectual property or confidential
        information.
      </p>

      <h2>15. General</h2>
      <p>
        These Terms (with the Privacy Policy and DPA) are the entire agreement and supersede prior
        agreements on this subject. If a provision is unenforceable, the rest remains in effect. Neither
        party may assign these Terms without the other&apos;s consent, except to a successor in a merger
        or asset sale. Neither party is liable for delays caused by events beyond its reasonable
        control. Notices to you may be sent by email or posted in-app.
      </p>

      <h2>16. Contact</h2>
      <p>
        Questions about these Terms: <a href="mailto:legal@rootmail.io">legal@rootmail.io</a>.
      </p>
    </DocPage>
  );
}
