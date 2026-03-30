import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";
import { TopNav } from "@/components/top-nav";
import { auth } from "@/auth";

const montserrat = Montserrat({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AgendaMaster - DTCGC",
  description: "Downtown Coquitlam Gavel Club Management App",
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
      </body>
    </html>
  );
}
