import Link from "next/link";
import type { ReactNode } from "react";
import AppHeader from "@/components/AppHeader";
import { TAP } from "@/lib/ui";

/** The shell every secondary page shares. */
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
            className={`font-mono text-muted hover:text-secondary inline-block text-[12px] transition-colors ${TAP}`}
          >
            ← {backLabel ?? "Zurück"}
          </Link>
        )}

        <div
          className={`flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 ${
            back ? "mt-4" : ""
          }`}
        >
          {/* break-de: titles come from content, and a German compound at 32px
              is wider than a 375px screen. */}
          <h1 className="font-serif break-de text-[32px] leading-[1.1] font-semibold tracking-[-0.015em]">
            {title}
          </h1>
          {aside && <div className="flex-none">{aside}</div>}
        </div>

        {lead && (
          <p className="text-secondary mt-3 max-w-[62ch] text-[15px] leading-relaxed">
            {lead}
          </p>
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
        <p className="text-muted mb-4 max-w-[62ch] text-[12.5px] leading-relaxed">
          {note}
        </p>
      )}
      {children}
    </section>
  );
}

/** A named band of sections, with the question it answers. */
export function Group({
  title,
  question,
  when = true,
  children,
}: {
  title: string;
  /** One line, in the learner's voice. Shown, not just documentation. */
  question: string;
  /** False when every section inside is data-gated and there is no data yet. */
  when?: boolean;
  children: ReactNode;
}) {
  if (!when) return null;
  return (
    <section className="mt-14 first:mt-4">
      <h2 className="font-serif text-[24px] leading-tight font-semibold tracking-[-0.015em]">
        {title}
      </h2>
      <p className="text-muted mt-1.5 max-w-[62ch] text-[13.5px] leading-relaxed">
        {question}
      </p>
      {children}
    </section>
  );
}

/** What to show when there is genuinely nothing. */
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
      {/* A div, not a p. Callers pass prose that is sometimes already a <p>, and
          a <p> inside a <p> is invalid HTML — the browser closes the outer one
          and React reports a hydration mismatch on a page that looked fine. */}
      <div className="text-muted mx-auto mt-2 max-w-[46ch] text-[14px] leading-relaxed">
        {children}
      </div>
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
