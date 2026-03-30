import Link from "next/link";
import { auth } from "@/auth";

export default async function LandingPage() {
  const session = await auth();
  
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 bg-brand-cool-grey/20 relative overflow-hidden">
      {/* Decorative Branding Elements */}
      <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-brand-loyal-blue/5 rounded-full blur-3xl"></div>
      <div className="absolute bottom-[-10%] left-[-10%] w-96 h-96 bg-brand-true-maroon/5 rounded-full blur-3xl"></div>

      <div className="max-w-4xl w-full text-center z-10 space-y-8">
        <div className="inline-block px-4 py-1.5 bg-brand-happy-yellow/20 text-yellow-800 rounded-full text-xs font-bold tracking-widest uppercase mb-4 animate-bounce">
          2023 - Downtown Coquitlam Gavel Club
        </div>
        
        <h1 className="text-6xl md:text-7xl font-extrabold text-brand-loyal-blue tracking-tighter leading-none">
          DTCGC <span className="text-brand-true-maroon font-black">Portal</span>
        </h1>
        
        <p className="text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed font-medium">
          The ultimate command center for the <span className="font-bold underline decoration-brand-happy-yellow underline-offset-4">Downtown Coquitlam Gavel Club</span>. 
          Automating agendas, roles, and communications.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-8">
          {session ? (
            <Link 
                href="/agenda" 
                className="bg-brand-loyal-blue text-white px-10 py-4 rounded-xl font-bold text-lg shadow-2xl hover:scale-105 transition-transform duration-300 flex items-center gap-2"
            >
                Enter Dashboard
            </Link>
          ) : (
            <>
                <Link 
                    href="/login" 
                    className="bg-brand-loyal-blue text-white px-10 py-4 rounded-xl font-bold text-lg shadow-2xl hover:scale-105 transition-transform duration-300"
                >
                    Member Login
                </Link>
                <Link 
                    href="/login" 
                    className="bg-white text-brand-true-maroon border-2 border-brand-true-maroon px-10 py-4 rounded-xl font-bold text-lg hover:bg-brand-true-maroon hover:text-white transition-all duration-300"
                >
                    Admin Access
                </Link>
            </>
          )}
        </div>

        <div className="pt-20 grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
            <div className="p-6 bg-white/50 backdrop-blur-sm rounded-2xl border border-gray-200">
                <h3 className="font-bold text-brand-loyal-blue mb-2">Automated Roles</h3>
                <p className="text-sm text-gray-500">Heuristic-based role assignment based on historical participation data.</p>
            </div>
            <div className="p-6 bg-white/50 backdrop-blur-sm rounded-2xl border border-gray-200">
                <h3 className="font-bold text-brand-loyal-blue mb-2">Agenda Engine</h3>
                <p className="text-sm text-gray-500">One-click Google Sheet generation and Gmail automation for Toastmasters.</p>
            </div>
            <div className="p-6 bg-white/50 backdrop-blur-sm rounded-2xl border border-gray-200">
                <h3 className="font-bold text-brand-loyal-blue mb-2">Member Matrix</h3>
                <p className="text-sm text-gray-500">Manage subscriptions, account approvals, and club-wide communications.</p>
            </div>
        </div>
      </div>
    </div>
  );
}
