"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TAP } from "@/lib/ui";

/**
 * Window header — four text links, active one underlined.
 *
 * Each carries its English underneath. The nav is the first German a beginner
 * meets and it is the one place where guessing wrong is expensive: at A1.1 you
 * cannot yet read "Wortschatz" or "Fortschritt", so four unreadable words were
 * standing between the learner and every screen behind them. German stays
 * primary — this is a German course and the words are worth learning — but it
 * is no longer a puzzle you have to solve before you can navigate.
 */
const NAV = [
  { href: "/", label: "Home", en: "start" },
  { href: "/wortschatz", label: "Wortschatz", en: "vocabulary" },
  { href: "/ueben", label: "Üben", en: "practise" },
  { href: "/fortschritt", label: "Fortschritt", en: "progress" },
];

export default function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="border-line-sub bg-bg/90 sticky top-0 z-30 flex h-[60px] flex-none items-center justify-between gap-4 border-b px-4 backdrop-blur-sm md:h-[68px] md:px-10">
      {/* The wordmark is the least useful thing on a 375px screen — the "DM"
          keeps the home link without eating the space the nav needs. */}
      <Link
        href="/"
        className={`font-serif flex-none text-[19px] font-semibold tracking-[0.01em] ${TAP}`}
      >
        <span className="hidden sm:inline">DeutschMate</span>
        <span className="sm:hidden">DM</span>
      </Link>

      <nav className="font-mono flex min-w-0 items-center gap-4 text-[12.5px] md:gap-8">
        {NAV.map((n) => {
          const active =
            n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={`flex shrink-0 flex-col items-start border-b pb-[3px] leading-tight transition-colors ${TAP} ${
                active
                  ? "text-fg border-fg"
                  : "text-muted hover:text-secondary border-transparent"
              }`}
            >
              <span>{n.label}</span>
              {/* Desktop only: on a 375px screen four second lines cost more
                  room than the nav has, and the phone is the one place the
                  labels are already familiar from the laptop. */}
              <span className="hidden text-[9.5px] tracking-[0.06em] opacity-55 md:block">
                {n.en}
              </span>
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
