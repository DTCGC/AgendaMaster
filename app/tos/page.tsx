/** Terms of Service page — required for Google OAuth verification compliance. */
import Link from "next/link";
import { LegalPage, LegalContact } from "@/components/common/legal-page";

export default function TermsOfService() {
  return (
    <LegalPage title="Terms of Service" updated="April 1, 2026">

        <p className="legal-lead">
          By accessing or using the AgendaMaster portal at <strong>agendas.coquitlamgavel.com</strong>, 
          you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the application.
        </p>

        <section>
          <h2>1. Use of Service</h2>
          <p>
            AgendaMaster is a tool built specifically for the Downtown Coquitlam Gavel Club (&ldquo;the Club&rdquo;). 
            Its purpose is to automate club meeting agendas, manage member roles, and facilitate club communications.
          </p>
          <ul>
            <li><strong>User Responsibilities:</strong> You must provide your own real first and last name during registration. If you are using a parent&apos;s or family member&apos;s Google account to sign in, you must still enter your personal name during the profile completion step — not the name associated with the Google account.</li>
            <li><strong>Account Approval:</strong> Registration does not guarantee access. All accounts are subject to manual approval by the Club administrators.</li>
            <li><strong>Permitted Use:</strong> Use the application only for lawful purposes in accordance with these terms and any applicable laws or regulations.</li>
          </ul>
        </section>

        <section>
          <h2>2. Intellectual Property</h2>
          <p>
            The software, design, and content of AgendaMaster are the property of the Club or its licensors. 
            Members are granted a limited, non-transferable license to use the application for its intended purpose within the Club.
          </p>
        </section>

        <section>
          <h2>3. Accuracy of Information</h2>
          <p>
            While we strive for accuracy, AgendaMaster utilizes automation and third-party APIs (such as Google Cloud). 
            We do not guarantee the absolute accuracy of auto-generated content, including AI-corrected grammar or role assignments. 
            All final documents and communications should be reviewed by a human before distribution.
          </p>
        </section>

        <section>
          <h2>4. Privacy</h2>
          <p>
            Your use of AgendaMaster is also governed by our <Link href="/privacy">Privacy Policy</Link>, 
            which is incorporated into these Terms by reference.
          </p>
        </section>

        <section>
          <h2>5. Limitation of Liability</h2>
          <p>
            The Club and the developers of AgendaMaster shall not be liable for any direct, indirect, incidental, or consequential damages 
            arising out of your use of the application, including but not limited to data loss or service interruptions.
          </p>
        </section>

        <section>
          <h2>6. Changes to Terms</h2>
          <p>
            We reserve the right to modify these Terms at any time. Significant changes will be communicated via notice on the application&apos;s home page. 
            Your continued use of the application following the posting of changes constitutes your acceptance of such changes.
          </p>
        </section>

        <LegalContact title="Contact Us">
          For questions about these Terms, please contact us at:
        </LegalContact>

    </LegalPage>
  );
}
