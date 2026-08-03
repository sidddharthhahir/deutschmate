"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Window header — four text links, active one underlined.
 *
 * Desktop gets a header rather than a bottom tab bar, because a bottom bar is
 * a phone convention that means nothing on a 27" screen. Exactly four targets,
 * as specified: any fifth would start turning Home into a menu.
 */
const NAV = [
  { href: "/", label: "Home" },
  { href: "/wortschatz", label: "Wortschatz" },
  { href: "/ueben", label: "Üben" },
  { href: "/fortschritt", label: "Fortschritt" },
];

export default function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="border-line-sub bg-bg/90 sticky top-0 z-30 flex h-[60px] flex-none items-center justify-between gap-4 border-b px-4 backdrop-blur-sm md:h-[68px] md:px-10">
      {/* The wordmark is the least useful thing on a 375px screen — the "DM"
          keeps the home link without eating the space the nav needs. */}
      <Link href="/" className="font-serif flex-none text-[19px] font-semibold tracking-[0.01em]">
        <span className="hidden sm:inline">DeutschMate</span>
        <span className="sm:hidden">DM</span>
      </Link>

      <nav className="font-mono flex min-w-0 gap-4 text-[12.5px] md:gap-8">
        {NAV.map((n) => {
          const active =
            n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 border-b pb-[3px] transition-colors ${
                active
                  ? "text-fg border-fg"
                  : "text-muted hover:text-secondary border-transparent"
              }`}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
