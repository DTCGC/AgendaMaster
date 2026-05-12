/**
 * 404 Not Found Page
 *
 * Rendered when a user navigates to a route that doesn't exist.
 * Provides links back to home and the login page.
 */
import Link from "next/link";
import { ArrowLeft, MapPinOff } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex-1 flex items-center justify-center p-8 bg-brand-cool-grey/20 relative overflow-hidden">
      {/* Decorative blobs */}
      <div className="absolute top-[-15%] right-[-10%] w-[500px] h-[500px] bg-brand-loyal-blue/5 rounded-full blur-3xl"></div>
      <div className="absolute bottom-[-15%] left-[-10%] w-[500px] h-[500px] bg-brand-true-maroon/5 rounded-full blur-3xl"></div>

      <div className="relative z-10 max-w-lg text-center space-y-8">
        <div className="mx-auto w-24 h-24 bg-brand-loyal-blue/10 rounded-full flex items-center justify-center">
          <MapPinOff size={48} className="text-brand-loyal-blue" />
        </div>

        <div className="space-y-2">
          <h1 className="text-8xl font-black text-brand-loyal-blue tracking-tighter">404</h1>
          <p className="text-xl font-bold text-gray-600">Page Not Found</p>
        </div>

        <p className="text-gray-500 leading-relaxed max-w-sm mx-auto">
          The page you&apos;re looking for doesn&apos;t exist in the DTCGC portal, or may have been moved to a different location.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
          <Link 
            href="/" 
            className="bg-brand-loyal-blue text-white px-8 py-3 rounded-xl font-bold shadow-lg hover:bg-opacity-90 transition-all flex items-center justify-center gap-2"
          >
            <ArrowLeft size={18} />
            Back to Home
          </Link>
          <Link 
            href="/login" 
            className="bg-white text-brand-loyal-blue border-2 border-brand-loyal-blue px-8 py-3 rounded-xl font-bold hover:bg-brand-loyal-blue hover:text-white transition-all flex items-center justify-center gap-2"
          >
            Portal Login
          </Link>
        </div>

        <p className="text-[10px] text-gray-300 uppercase tracking-widest font-bold pt-8">
          Downtown Coquitlam Gavel Club — AgendaMaster
        </p>
      </div>
    </div>
  );
}
