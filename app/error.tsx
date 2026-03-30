'use client'

import { useEffect } from "react";
import Link from "next/link";
import { AlertOctagon, ArrowLeft, RefreshCw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error:", error);
  }, [error]);

  return (
    <div className="flex-1 flex items-center justify-center p-8 bg-brand-cool-grey/20 relative overflow-hidden min-h-[calc(100vh-80px)]">
      {/* Decorative blobs */}
      <div className="absolute top-[-15%] right-[-10%] w-[500px] h-[500px] bg-brand-true-maroon/5 rounded-full blur-3xl"></div>
      <div className="absolute bottom-[-15%] left-[-10%] w-[500px] h-[500px] bg-brand-loyal-blue/5 rounded-full blur-3xl"></div>

      <div className="relative z-10 max-w-lg text-center space-y-8">
        <div className="mx-auto w-24 h-24 bg-brand-true-maroon/10 rounded-full flex items-center justify-center">
          <AlertOctagon size={48} className="text-brand-true-maroon" />
        </div>

        <div className="space-y-2">
          <h1 className="text-8xl font-black text-brand-true-maroon tracking-tighter">500</h1>
          <p className="text-xl font-bold text-gray-600">Internal Server Error</p>
        </div>

        <p className="text-gray-500 leading-relaxed max-w-sm mx-auto">
          Something went wrong on our end. This issue has been logged. Please try again, or contact the VP of Education if the problem persists.
        </p>

        {error.digest && (
          <div className="bg-gray-100 border border-gray-200 rounded-lg px-4 py-2 inline-block">
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Error Reference: </span>
            <code className="text-xs text-gray-600 font-mono">{error.digest}</code>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
          <button
            onClick={() => reset()}
            className="bg-brand-true-maroon text-white px-8 py-3 rounded-xl font-bold shadow-lg hover:bg-opacity-90 transition-all flex items-center justify-center gap-2"
          >
            <RefreshCw size={18} />
            Try Again
          </button>
          <Link 
            href="/" 
            className="bg-white text-brand-loyal-blue border-2 border-brand-loyal-blue px-8 py-3 rounded-xl font-bold hover:bg-brand-loyal-blue hover:text-white transition-all flex items-center justify-center gap-2"
          >
            <ArrowLeft size={18} />
            Back to Home
          </Link>
        </div>

        <p className="text-[10px] text-gray-300 uppercase tracking-widest font-bold pt-8">
          Downtown Coquitlam Gavel Club — AgendaMaster
        </p>
      </div>
    </div>
  );
}
