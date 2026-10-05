/**
 * Site Footer
 *
 * White band under every page: club identity, the public links, and the
 * build the server is running (APP_BUILD_ID, set in next.config.ts from the
 * deploy's commit SHA) so a bug report can say which version it came from.
 */
import Image from "next/image";
import Link from "next/link";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/tutorial", label: "Tutorial" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/tos", label: "Terms of Service" },
  { href: "mailto:coquitlamgavel@gmail.com", label: "Contact" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-gray-200 bg-white">
      {/* Stacked and centred until there is room for three columns; the
          equal outer columns then keep the links centred on the page. */}
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 px-4 py-8 text-sm text-gray-500 sm:px-6 xl:grid xl:grid-cols-[1fr_auto_1fr]">
        <div className="flex items-center gap-3 xl:justify-self-start">
          <Image
            src="/assets/images/LoyalBlue/GavelClubLogoLoyalBlue-RGB.png"
            alt=""
            width={1140}
            height={1140}
            sizes="36px"
            className="h-9 w-auto"
          />
          <div>
            <p className="font-bold text-brand-loyal-blue">AgendaMaster</p>
            <p className="text-xs">© {new Date().getFullYear()} Downtown Coquitlam Gavel Club</p>
          </div>
        </div>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2">
            {LINKS.map((link) => (
              <li key={link.href}>
                {link.href.startsWith("mailto:") ? (
                  <a href={link.href} className="font-medium transition-colors hover:text-brand-loyal-blue">{link.label}</a>
                ) : (
                  <Link href={link.href} className="font-medium transition-colors hover:text-brand-loyal-blue">{link.label}</Link>
                )}
              </li>
            ))}
          </ul>
        </nav>
        <p className="text-xs text-gray-400 xl:justify-self-end">Build {process.env.APP_BUILD_ID}</p>
      </div>
    </footer>
  );
}
