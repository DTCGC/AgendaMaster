import Link from "next/link";

export default function TermsOfService() {
  return (
    <div className="flex-1 bg-background py-16 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl font-bold text-slate-900 mb-8 border-b pb-4">Terms of Service</h1>
        <p className="text-slate-600 mb-6 italic">Last Updated: April 1, 2026</p>

        <p className="text-slate-700 mb-10 leading-relaxed font-medium">
          By accessing or using the AgendaMaster portal at <span className="font-bold text-[#772432]">agendas.coquitlamgavel.com</span>, 
          you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the application.
        </p>

        <section className="mb-10">
          <h2 className="text-2xl font-semibold text-[#772432] mb-4">1. Use of Service</h2>
          <p className="text-slate-700 mb-4">
            AgendaMaster is a tool built specifically for the Downtown Coquitlam Gavel Club ("the Club"). 
            Its purpose is to automate club meeting agendas, manage member roles, and facilitate club communications.
          </p>
          <ul className="list-disc pl-6 text-slate-700 space-y-2">
            <li><strong>User Responsibilities:</strong> You must provide your own real first and last name during registration. If you are using a parent&apos;s or family member&apos;s Google account to sign in, you must still enter your personal name during the profile completion step — not the name associated with the Google account.</li>
            <li><strong>Account Approval:</strong> Registration does not guarantee access. All accounts are subject to manual approval by the Club administrators.</li>
            <li><strong>Permitted Use:</strong> Use the application only for lawful purposes in accordance with these terms and any applicable laws or regulations.</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-semibold text-[#772432] mb-4">2. Intellectual Property</h2>
          <p className="text-slate-700">
            The software, design, and content of AgendaMaster are the property of the Club or its licensors. 
            Members are granted a limited, non-transferable license to use the application for its intended purpose within the Club.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-semibold text-[#772432] mb-4">3. Accuracy of Information</h2>
          <p className="text-slate-700">
            While we strive for accuracy, AgendaMaster utilizes automation and third-party APIs (such as Google Cloud). 
            We do not guarantee the absolute accuracy of auto-generated content, including AI-corrected grammar or role assignments. 
            All final documents and communications should be reviewed by a human before distribution.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-semibold text-[#772432] mb-4">4. Privacy</h2>
          <p className="text-slate-700">
            Your use of AgendaMaster is also governed by our <Link href="/privacy" className="text-[#004165] hover:underline font-medium">Privacy Policy</Link>, 
            which is incorporated into these Terms by reference.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-semibold text-[#772432] mb-4">5. Limitation of Liability</h2>
          <p className="text-slate-700">
            The Club and the developers of AgendaMaster shall not be liable for any direct, indirect, incidental, or consequential damages 
            arising out of your use of the application, including but not limited to data loss or service interruptions.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-semibold text-[#772432] mb-4">6. Changes to Terms</h2>
          <p className="text-slate-700">
            We reserve the right to modify these Terms at any time. Significant changes will be communicated via notice on the application's home page. 
            Your continued use of the application following the posting of changes constitutes your acceptance of such changes.
          </p>
        </section>

        <section className="mb-10 text-center bg-slate-50 p-8 rounded-lg border border-slate-200">
          <h2 className="text-xl font-bold text-slate-900 mb-2">Contact Us</h2>
          <p className="text-slate-600">
            For questions about these Terms, please contact us at:
          </p>
          <a href="mailto:info@coquitlamgavel.com" className="text-[#772432] font-bold hover:underline">info@coquitlamgavel.com</a>
        </section>

        <div className="mt-12 text-center text-sm text-slate-500">
          <Link href="/" className="hover:text-[#004165] transition-colors underline decoration-slate-300">Return to Home</Link>
        </div>
      </div>
    </div>
  );
}
