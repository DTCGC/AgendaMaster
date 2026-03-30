import { auth, signIn } from "@/auth";
import Image from "next/image";
import { redirect } from "next/navigation";
import GuestSubscribe from "@/components/login/guest-subscribe";

export default async function LoginPage() {
  const session = await auth();

  if (session) {
    redirect("/agenda");
  }

  return (
    <div className="flex min-h-[calc(100vh-80px)] items-center justify-center p-4 bg-brand-cool-grey/20">
      <div className="w-full max-w-sm p-8 bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col items-center">
        
        <div className="mb-8">
            <Image 
                src="/assets/GavelClubLogo/LoyalBlue/GavelClubLogoLoyalBlue.svg" 
                alt="DTCGC Logo" 
                width={180} 
                height={60} 
                className="w-48 h-auto"
            />
        </div>

        <h1 className="text-2xl font-black mb-8 text-center text-brand-loyal-blue tracking-tighter uppercase">Portal Access</h1>
        
        <form
          className="space-y-4 w-full"
          action={async (formData) => {
            "use server"
            await signIn("credentials", formData, { redirectTo: '/admin/calendar' })
          }}
        >
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 ml-1">Admin Identity</label>
            <input name="email" type="email" placeholder="Email Address" required className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-brand-true-maroon/20 outline-none transition-all placeholder:text-gray-300" />
          </div>
          <div>
            <input name="password" type="password" placeholder="Access Key" required className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-brand-true-maroon/20 outline-none transition-all placeholder:text-gray-300" />
          </div>
          <button type="submit" className="w-full bg-brand-true-maroon text-white font-bold rounded-xl p-3.5 hover:opacity-90 transition-opacity shadow-lg shadow-brand-true-maroon/20 text-sm">
            Authenticate Admin
          </button>
        </form>

        <div className="my-10 flex items-center w-full">
            <div className="flex-grow border-t border-gray-100"></div>
            <span className="px-4 text-[10px] font-bold text-gray-300 uppercase tracking-widest">or</span>
            <div className="flex-grow border-t border-gray-100"></div>
        </div>

        <form
          className="w-full"
          action={async () => {
            "use server"
            await signIn("google", { redirectTo: '/agenda' })
          }}
        >
          <button type="submit" className="w-full bg-white border-2 border-gray-100 text-gray-700 font-bold rounded-xl p-3.5 hover:bg-gray-50 transition-all flex items-center justify-center gap-2 text-sm">
            <Image src="https://authjs.dev/img/providers/google.svg" alt="G" width={18} height={18} />
            Continue with Google
          </button>
        </form>

        {/* Guest Subscription Section */}
        <div className="w-full pt-10 border-t border-dashed mt-10">
            <GuestSubscribe />
        </div>

        <div className="text-center mt-6">
            <p className="text-[10px] text-gray-400 leading-relaxed max-w-[240px] italic">
                Authorized use only. Standard member applications are screened by the Executive Team after initial Google verification.
            </p>
        </div>
      </div>
    </div>
  );
}
