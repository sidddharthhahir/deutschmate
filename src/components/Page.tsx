import Link from "next/link";
import type { ReactNode } from "react";
import AppHeader from "@/components/AppHeader";

/**
 * The shell every secondary page shares.
 *
 * Eight pages were each hand-rolling a back link, an h1 and a lead paragraph
 * with slightly different sizes and margins — 30px here, 32px there, mt-3 on
 * one and mt-2 on the next. Nobody notices any single one; together they make
 * the app feel assembled rather than designed.
 */
export default function Page({
  back,
  backLabel,
  title,
  lead,
  aside,
  width = "narrow",
  children,
}: {
  back?: string;
  backLabel?: string;
  title: string;
  lead?: ReactNode;
  /** Sits opposite the title — a count, a link, a status. */
  aside?: ReactNode;
  width?: "narrow" | "wide";
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-col">
      <AppHeader />

      <div
        className={`mx-auto w-full flex-1 px-6 py-10 md:px-10 ${
          width === "wide" ? "max-w-[880px]" : "max-w-[760px]"
        }`}
      >
        {back && (
          <Link
            href={back}
            className="font-mono text-muted hover:text-secondary inline-block text-[12px] transition-colors"
          >
            ← {backLabel ?? "Zurück"}
          </Link>
        )}

        <div
          className={`flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 ${
            back ? "mt-4" : ""
          }`}
        >
          <h1 className="font-serif text-[32px] leading-[1.1] font-semibold tracking-[-0.015em]">
            {title}
          </h1>
          {aside && <div className="flex-none">{aside}</div>}
        </div>

        {lead && (
          <p className="text-secondary mt-3 max-w-[62ch] text-[15px] leading-relaxed">{lead}</p>
        )}

        <div className="mt-8">{children}</div>
      </div>
    </main>
  );
}

/** A titled band. The horizontal rule is the only separator in the app. */
export function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-line-sub mt-10 border-t pt-6">
      <h2 className="font-mono text-muted mb-4 text-[11.5px] tracking-[0.14em] uppercase">
        {title}
      </h2>
      {note && (
        <p className="text-muted mb-4 max-w-[62ch] text-[12.5px] leading-relaxed">{note}</p>
      )}
      {children}
    </section>
  );
}

/**
 * What to show when there is genuinely nothing.
 *
 * An empty screen reads as broken. Each of these says what the emptiness means
 * and what would fill it, which is usually good news rather than a failure.
 */
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: { href: string; label: string };
}) {
  return (
    <div className="border-line rounded-[14px] border border-dashed p-8 text-center">
      <p className="font-serif text-[20px]">{title}</p>
      <p className="text-muted mx-auto mt-2 max-w-[46ch] text-[14px] leading-relaxed">
        {children}
      </p>
      {action && (
        <Link
          href={action.href}
          className="bg-fg mt-6 inline-block rounded-xl px-6 py-3.5 font-medium text-[#16211E] transition-colors hover:bg-white"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}

/** The standard clickable card. */
export function Tile({
  href,
  title,
  sub,
  flag,
}: {
  href: string;
  title: string;
  sub: string;
  /** Something is waiting. A dot, never a red badge count. */
  flag?: boolean;
}) {
  return (
    <Link
      href={href}
      className="border-line hover:border-line-strong hover:bg-raised group rounded-[14px] border p-5 transition-all hover:-translate-y-0.5"
    >
      <p className="font-serif flex items-center gap-2 text-[20px] font-medium">
        {title}
        {flag && <span className="bg-accent h-[6px] w-[6px] rounded-full" />}
      </p>
      <p className="font-mono text-muted mt-1 text-[12.5px]">{sub}</p>
    </Link>
  );
}
