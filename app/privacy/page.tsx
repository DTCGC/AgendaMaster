/** Privacy Policy page — required for Google OAuth verification compliance. */
import { LegalPage, LegalContact } from "@/components/common/legal-page";

export default function PrivacyPolicy() {
  return (
    <LegalPage title="Privacy Policy" updated="October 2, 2026">

        <section>
          <h2>1. Introduction</h2>
          <p>
            Welcome to AgendaMaster, the management portal for the Downtown Coquitlam Gavel Club (&ldquo;the Club&rdquo;). 
            We are committed to protecting your privacy and ensuring that your personal information is handled in a safe and responsible manner. 
            This Privacy Policy explains how we collect, use, and safeguard your information when you use our web application at 
            <strong> agendas.coquitlamgavel.com</strong>.
          </p>
        </section>

        <section>
          <h2>2. Information We Collect</h2>
          <p>We collect information to provide a better experience for our members. This includes:</p>
          <ul>
            <li>
              <strong>Account Information:</strong> Your self-reported first and last name, provided during the profile completion step after your first sign-in. This name may differ from the name on the Google account used to authenticate, as members may use a parent or family Google account.
            </li>
            <li>
              <strong>Google Account Data:</strong> Your Google account email address is used for authentication. When you use our Google-integrated features, we access specific data with your permission:
              <ul>
                <li><strong>Gmail:</strong> To send club agendas and announcements on your behalf.</li>
                <li><strong>Google Drive/Sheets:</strong> To create and manage agenda templates for club meetings.</li>
              </ul>
              <p className="legal-note">Note: Your Google profile name is not used as your club identity. Only the email address from your Google account is stored for authentication purposes.</p>
            </li>
            <li>
              <strong>Subscriber Data:</strong> Email addresses of parents or public members who subscribe to our mailing list.
            </li>
          </ul>
        </section>

        <section>
          <h2>3. How We Use Your Information</h2>
          <p>We use the collected data for the following purposes:</p>
          <ul>
            <li>To manage club meeting rosters and role assignments.</li>
            <li>To automate the creation of meeting agendas in Google Sheets.</li>
            <li>To facilitate club-wide communication via email.</li>
            <li>To verify your identity and maintain security via Google OAuth.</li>
          </ul>
        </section>

        <section>
          <h2>4. Google Limited Use Disclosure</h2>
          <p className="legal-callout">
            AgendaMaster&apos;s use and transfer to any other app of information received from Google APIs will adhere to the 
            <a href="https://developers.google.com/terms/api-services-user-data-policy" className="mx-1" target="_blank" rel="noopener noreferrer">
              Google API Services User Data Policy
            </a>, including the Limited Use requirements.
          </p>
        </section>

        <section>
          <h2>5. Data Sharing and Transfer</h2>
          <p>
            AgendaMaster does not sell, trade, or otherwise transfer your personal information to third parties. 
            Information is only shared with service providers (like Google) as necessary to perform the application&apos;s core functions.
          </p>
        </section>

        <section>
          <h2>6. Security</h2>
          <p>
            We implement standard security measures to protect your information. 
            All authentication is handled via Google OAuth, and we do not store your Google password. 
            Sensitive database entries (like admin accounts) use secure hashing. Data in transit is protected using industry-standard SSL/TLS encryption.
          </p>
        </section>

        <section>
          <h2>7. Data Retention and Deletion</h2>
          <ul>
            <li>
              <strong>Retention:</strong> We retain your club identity (name) and authentication metadata for as long as you remain a member of the Downtown Coquitlam Gavel Club.
            </li>
            <li>
              <strong>Deletion:</strong> You may request the deletion of your account and all associated personal data at any time by contacting us at 
              <strong> coquitlamgavel@gmail.com</strong>. Once requested, your data will be permanently removed from our production database within 30 days.
            </li>
          </ul>
        </section>

        <section>
          <h2>8. Applicable Legislation</h2>
          <ul>
            <li>
              <strong>BC Privacy Law:</strong> The Club collects, uses and discloses personal information in keeping with British Columbia&apos;s{" "}
              <a href="https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/96165_00" target="_blank" rel="noopener noreferrer">
                Freedom of Information and Protection of Privacy Act
              </a>{" "}
              [RSBC&nbsp;1996] c.&nbsp;165 (FIPPA).
            </li>
            <li>
              <strong>Access and Correction:</strong> You may ask to see, or to correct, the personal information we hold about you by contacting us at
              <strong> coquitlamgavel@gmail.com</strong>.
            </li>
          </ul>
        </section>

        <LegalContact title="Questions or Concerns?">
          If you have any questions regarding this Privacy Policy, please contact us at:
        </LegalContact>

    </LegalPage>
  );
}
