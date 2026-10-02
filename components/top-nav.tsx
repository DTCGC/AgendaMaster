/**
 * Top Navigation Bar
 *
 * Role-aware navigation rendered in the root layout. Blue for members and
 * maroon for admins, so the permission level is always visible. Below the
 * md breakpoint the links collapse into a menu panel, so every page stays
 * reachable on a phone.
 *
 * Sign-out asks for confirmation to prevent accidental logouts.
 */
'use client'

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { LogOut, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { cn } from "@/lib/utils";

type NavLink = { href: string; label: string };

function linksFor(role?: string): NavLink[] {
  const isAdmin = role === 'ADMIN';
  const isMember = role === 'MEMBER' || isAdmin;
  return [
    ...(isMember ? [{ href: '/agenda', label: 'Agenda' }] : []),
    ...(isAdmin
      ? [
          { href: '/admin/calendar', label: 'Calendar' },
          { href: '/admin/roles', label: 'Roles' },
          { href: '/admin/accounts', label: 'Approvals' },
          { href: '/admin/comms', label: 'Comms' },
        ]
      : []),
    // Open to everyone: the getting-started half is public, and the page
    // itself decides what a visitor may read.
    { href: '/tutorial', label: 'Tutorial' },
  ];
}

export function TopNav({ role }: { role?: string }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const isAdmin = role === 'ADMIN';
  const links = linksFor(role);
  // A section stays highlighted on its sub-pages (/agenda/create → Agenda).
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const linkClass = (href: string) =>
    cn(
      "rounded-full px-4 py-2 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/70",
      isActive(href)
        ? cn("bg-white shadow-sm", isAdmin ? "text-brand-true-maroon" : "text-brand-loyal-blue")
        : "text-white/80 hover:bg-white/10 hover:text-white"
    );

  return (
    <header
      className={cn(
        "relative z-40 border-b-4 border-brand-happy-yellow text-white shadow-md",
        isAdmin ? "bg-brand-true-maroon" : "bg-brand-loyal-blue"
      )}
    >
      <div className="mx-auto flex h-18 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        {/* Equal-width sides keep the links centred on the page, whatever the
            widths of the logo and the right-hand button. */}
        <div className="flex flex-1 basis-0">
          <Link href="/" className="group flex items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-white/70">
            <Image
              src={isAdmin ? "/assets/images/TrueMaroon/GavelClubLogoTrueMaroon-RGB.png" : "/assets/images/LoyalBlue/GavelClubLogoLoyalBlue-RGB.png"}
              alt=""
              width={1140}
              height={1140}
              priority
              sizes="40px"
              className="h-10 w-auto drop-shadow-sm transition-transform group-hover:scale-105"
            />
            <span className="leading-none select-none">
              <span className="block text-xl font-black tracking-wider">DTCGC</span>
              <span className="mt-1 hidden text-xs font-semibold tracking-wide text-white/80 sm:block">AgendaMaster</span>
            </span>
          </Link>
        </div>

        <nav aria-label="Main" className={cn(role ? "hidden md:block" : "block")}>
          <ul className="flex items-center gap-1">
            {links.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={linkClass(link.href)} aria-current={isActive(link.href) ? "page" : undefined}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex flex-1 basis-0 items-center justify-end gap-2">
          {role ? (
            <>
              <Button variant="on-brand" className="hidden md:inline-flex" onClick={() => setConfirmSignOut(true)}>
                <LogOut /> Sign Out
              </Button>
              <Button
                variant="on-brand"
                size="icon"
                className="md:hidden"
                aria-label={menuOpen ? "Close menu" : "Open menu"}
                aria-expanded={menuOpen}
                aria-controls="mobile-menu"
                onClick={() => setMenuOpen((open) => !open)}
              >
                {menuOpen ? <X /> : <Menu />}
              </Button>
            </>
          ) : (
            <Link href="/login" className={buttonVariants({ variant: "on-brand" })}>
              Login
            </Link>
          )}
        </div>
      </div>

      {role && menuOpen && (
        <nav id="mobile-menu" aria-label="Main" className="border-t border-white/15 px-4 pt-2 pb-4 md:hidden">
          <ul className="space-y-1">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  aria-current={isActive(link.href) ? "page" : undefined}
                  className={cn(linkClass(link.href), "block rounded-xl px-4 py-3")}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <Button
            variant="on-brand"
            className="mt-3 w-full"
            onClick={() => {
              setMenuOpen(false);
              setConfirmSignOut(true);
            }}
          >
            <LogOut /> Sign Out
          </Button>
        </nav>
      )}

      <ConfirmDialog
        open={confirmSignOut}
        onOpenChange={setConfirmSignOut}
        tone={isAdmin ? "maroon" : "brand"}
        icon={LogOut}
        title="Leaving so soon?"
        description="Confirm your departure from the DTCGC portal."
        confirmLabel="Sign Out"
        busy={signingOut}
        onConfirm={() => {
          setSigningOut(true);
          signOut({ callbackUrl: '/' });
        }}
      />
    </header>
  );
}
