/**
 * Public Landing Page
 *
 * The first page visitors see: the AgendaMaster wordmark, a CTA to the
 * login/dashboard, and the Data Transparency section Google's OAuth
 * verification requires.
 */
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { auth } from "@/auth";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

const FEATURES = [
  { title: "Automatic Roles", body: "Smart role scheduling based on past participation." },
  { title: "Agenda Engine", body: "One-click Google Sheet generation and Gmail automation for meetings." },
  { title: "Member Management", body: "Manage member lists, account approvals, and club communications." },
];

export default async function LandingPage() {
  const session = await auth();
  
  return (
    <div className="flex-1 flex flex-col items-center p-6 bg-brand-cool-grey/20 relative overflow-clip">
      {/* Decorative Branding Elements */}
      <div className="absolute -top-24 -right-24 size-96 rounded-full bg-brand-loyal-blue/5 blur-3xl" />
      <div className="absolute -bottom-24 -left-24 size-96 rounded-full bg-brand-true-maroon/5 blur-3xl" />

      <div className="max-w-4xl w-full z-10">
        {/* Hero Section - Above the fold */}
        <div className="min-h-[85vh] flex flex-col justify-center items-center text-center space-y-8 py-12">
          <div className="inline-block rounded-full bg-brand-happy-yellow/30 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-brand-loyal-blue">
            Est. 2023 · Downtown Coquitlam Gavel Club
          </div>

          <h1 className="text-[clamp(2.25rem,11vw,4.5rem)] font-black text-brand-loyal-blue tracking-tighter leading-none">
            Agenda<span className="text-brand-true-maroon">Master</span>
          </h1>

          <p className="text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed font-medium">
            The ultimate command center for the <span className="font-bold text-gray-700 underline decoration-brand-happy-yellow decoration-2 underline-offset-4">Downtown Coquitlam Gavel Club</span>.
            Automating agendas, roles, and communications.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-8">
            <Link href={session ? "/agenda" : "/login"} className={cn(buttonVariants({ size: "lg" }), "h-14 px-10 text-lg shadow-lg")}>
              {session ? "Enter Dashboard" : "Portal Access"}
            </Link>
            <Link href="/tutorial" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-14 px-10 text-lg")}>
              How it works
            </Link>
          </div>

          <div className="pt-20 grid grid-cols-1 md:grid-cols-3 gap-6 text-left w-full">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border border-gray-200 bg-white/70 p-6 shadow-sm backdrop-blur-sm">
                <h3 className="mb-2 font-bold text-brand-loyal-blue">{f.title}</h3>
                <p className="text-sm leading-relaxed text-gray-600">{f.body}</p>
              </div>
            ))}
          </div>

          <a href="#data-transparency" className="mt-10 flex flex-col items-center gap-1 text-xs font-bold uppercase tracking-widest text-gray-500 transition-colors hover:text-brand-loyal-blue">
            <span>Scroll for Data Transparency</span>
            <ChevronDown size={20} />
          </a>
        </div>

        {/* Data Transparency Section (Google OAuth Compliance) - Below the fold */}
        <section id="data-transparency" className="scroll-mt-6 pt-24 pb-20 border-t border-gray-200">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-2xl font-black tracking-tight text-brand-loyal-blue mb-4">Data Transparency</h2>
            <p className="text-gray-600 leading-relaxed mb-8 px-4">
              AgendaMaster requests access to Google Sheets, Google Drive, and Gmail strictly to automate the creation 
              and distribution of meeting agendas for the Downtown Coquitlam Gavel Club. We do not store, share, or sell 
              your Google user data for advertising, marketing, or any other commercial purposes.
            </p>
            <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 text-xs font-bold uppercase tracking-widest text-gray-500">
              <Link href="/privacy" className="transition-colors hover:text-brand-loyal-blue">Privacy Policy</Link>
              <Link href="/tos" className="transition-colors hover:text-brand-loyal-blue">Terms of Service</Link>
              <a href="mailto:info@coquitlamgavel.com" className="transition-colors hover:text-brand-loyal-blue">Contact Support</a>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
