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
    <header className="border-line-sub flex h-[68px] flex-none items-center justify-between border-b px-6 md:px-10">
      <Link
        href="/"
        className="font-serif text-[19px] font-semibold tracking-[0.01em]"
      >
        DeutschMate
      </Link>

      <nav className="font-mono flex gap-5 text-[12.5px] md:gap-8">
        {NAV.map((n) => {
          const active =
            n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "text-fg border-fg border-b pb-[3px]"
                  : "text-muted hover:text-secondary border-b border-transparent pb-[3px] transition-colors"
              }
            >
              {n.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
