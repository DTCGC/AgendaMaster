import type { Metadata } from "next";
import Link from "next/link";
import { Montserrat } from "next/font/google";
import "./globals.css";
import { TopNav } from "@/components/top-nav";
import { auth } from "@/auth";

const montserrat = Montserrat({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AgendaMaster | Downtown Coquitlam Gavel Club Portal",
  description: "The ultimate command center for DTCGC. Automating meeting agendas, member roles, and club-wide communications with heuristic-based sequencing and Google Cloud integration.",
  keywords: ["DTCGC", "Gavel Club", "Toastmasters", "Agenda Generator", "Meeting Management"],
  icons: {
    icon: "/icon.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  
  return (
    <html lang="en" className={`${montserrat.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans bg-background text-foreground">
        <TopNav role={session?.user?.role} />
        <main className="flex-1 flex flex-col">
          {children}
        </main>
        <footer className="bg-[#A9B2B1]/10 border-t border-slate-200 py-8 px-4 font-sans text-sm text-slate-600">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex flex-col items-center md:items-start">
              <p className="font-semibold text-[#004165]">AgendaMaster</p>
              <p>© {new Date().getFullYear()} Downtown Coquitlam Gavel Club</p>
            </div>
            <nav className="flex flex-wrap justify-center gap-x-8 gap-y-2">
              <Link href="/" className="hover:text-[#004165] transition-colors">Home</Link>
              <Link href="/privacy" className="hover:text-[#004165] transition-colors">Privacy Policy</Link>
              <Link href="/tos" className="hover:text-[#004165] transition-colors">Terms of Service</Link>
              <a href="mailto:info@coquitlamgavel.com" className="hover:text-[#004165] transition-colors">Contact</a>
            </nav>
            <div className="text-xs text-slate-400">
              v1.2.0-prod
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
