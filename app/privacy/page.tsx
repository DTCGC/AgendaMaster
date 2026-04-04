import Link from "next/link";

export default function PrivacyPolicy() {
  return (
    <div className="flex-1 bg-background py-16 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl font-bold text-brand-loyal-blue mb-8 border-b pb-4">Privacy Policy</h1>
        <p className="text-slate-600 mb-6 italic">Last Updated: April 1, 2026</p>

        <section className="mb-10">
          <h2 className="text-2xl font-semibold text-brand-loyal-blue mb-4">1. Introduction</h2>
          <p className="text-slate-700 leading-relaxed">
            Welcome to AgendaMaster, the management portal for the Downtown Coquitlam Gavel Club ("the Club"). 
            We are committed to protecting your privacy and ensuring that your personal information is handled in a safe and responsible manner. 
            This Privacy Policy explains how we collect, use, and safeguard your information when you use our web application at 
            <span className="font-medium text-brand-loyal-blue"> agendas.coquitlamgavel.com</span>.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-semibold text-brand-loyal-blue mb-4">2. Information We Collect</h2>
          <p className="text-slate-700 mb-4">We collect information to provide a better experience for our members. This includes:</p>
          <ul className="list-disc pl-6 text-slate-700 space-y-2">
            <li>
              <strong>Account Information:</strong> Your self-reported first and last name, provided during the profile completion step after your first sign-in. This name may differ from the name on the Google account used to authenticate, as members may use a parent or family Google account.
            </li>
            <li>
              <strong>Google Account Data:</strong> Your Google account email address is used for authentication. When you use our Google-integrated features, we access specific data with your permission:
              <ul className="list-circle pl-6 mt-2 space-y-1">
                <li><strong>Gmail:</strong> To send club agendas and announcements on your behalf.</li>
                <li><strong>Google Drive/Sheets:</strong> To create and manage agenda templates for club meetings.</li>
              </ul>
              <p className="text-sm text-slate-500 mt-2 italic">Note: Your Google profile name is not used as your club identity. Only the email address from your Google account is stored for authentication purposes.</p>
            </li>
            <li>
              <strong>Subscriber Data:</strong> Email addresses of parents or public members who subscribe to our mailing list.
            </li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-semibold text-brand-loyal-blue mb-4">3. How We Use Your Information</h2>
          <p className="text-slate-700 mb-4">We use the collected data for the following purposes:</p>
          <ul className="list-disc pl-6 text-slate-700 space-y-2">
            <li>To manage club meeting rosters and role assignments.</li>
            <li>To automate the creation of meeting agendas in Google Sheets.</li>
            <li>To facilitate club-wide communication via email.</li>
            <li>To verify your identity and maintain security via Google OAuth.</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-semibold text-brand-loyal-blue mb-4">4. Google Limited Use Disclosure</h2>
          <p className="text-slate-700 leading-relaxed border-l-4 border-brand-happy-yellow pl-4 bg-yellow-50 py-4 rounded-r-lg">
            AgendaMaster&apos;s use and transfer to any other app of information received from Google APIs will adhere to the 
            <a href="https://developers.google.com/terms/api-services-user-data-policy" className="text-brand-loyal-blue underline mx-1" target="_blank" rel="noopener noreferrer">
              Google API Services User Data Policy
            </a>, including the Limited Use requirements.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-semibold text-brand-loyal-blue mb-4">5. Data Sharing and Transfer</h2>
          <p className="text-slate-700">
            AgendaMaster does not sell, trade, or otherwise transfer your personal information to third parties. 
            Information is only shared with service providers (like Google) as necessary to perform the application&apos;s core functions.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-semibold text-brand-loyal-blue mb-4">6. Security</h2>
          <p className="text-slate-700">
            We implement standard security measures to protect your information. 
            All authentication is handled via Google OAuth, and we do not store your Google password. 
            Sensitive database entries (like admin accounts) use secure hashing. Data in transit is protected using industry-standard SSL/TLS encryption.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-semibold text-brand-loyal-blue mb-4">7. Data Retention and Deletion</h2>
          <ul className="list-disc pl-6 text-slate-700 space-y-2">
            <li>
              <strong>Retention:</strong> We retain your club identity (name) and authentication metadata for as long as you remain a member of the Downtown Coquitlam Gavel Club.
            </li>
            <li>
              <strong>Deletion:</strong> You may request the deletion of your account and all associated personal data at any time by contacting us at 
              <span className="font-bold"> info@coquitlamgavel.com</span>. Once requested, your data will be permanently removed from our production database within 30 days.
            </li>
          </ul>
        </section>

        <section className="mb-10 text-center bg-slate-50 p-8 rounded-lg border border-slate-200">
          <h2 className="text-xl font-bold text-brand-loyal-blue mb-2">Questions or Concerns?</h2>
          <p className="text-slate-600 mb-4">
            If you have any questions regarding this Privacy Policy, please contact us at:
          </p>
          <a 
            href="mailto:info@coquitlamgavel.com" 
            className="text-brand-loyal-blue font-bold hover:underline"
          >
            info@coquitlamgavel.com
          </a>
        </section>

        <div className="mt-12 text-center text-sm text-slate-500">
          <Link href="/" className="hover:text-brand-loyal-blue transition-colors">Return to Home</Link>
        </div>
      </div>
    </div>
  );
}
