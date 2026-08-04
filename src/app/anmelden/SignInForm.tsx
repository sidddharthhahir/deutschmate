"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The address field.
 *
 * Posts and then navigates to `?sent=1`, rather than being a plain form POST,
 * so the "check your email" screen is reached without the browser re-submitting
 * on refresh. The response never contains the link — see /api/auth.
 */
export default function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "That did not work.");
        setBusy(false);
        return;
      }
      router.push(`/anmelden?sent=1&e=${encodeURIComponent(email.trim())}`);
    } catch {
      setError("Could not reach the server.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-8">
      <label
        htmlFor="email"
        className="font-mono text-muted mb-2 block text-[11.5px] tracking-[0.14em] uppercase"
      >
        E-Mail
      </label>
      <input
        id="email"
        type="email"
        required
        autoFocus
        autoComplete="email"
        value={email}
        onChange={(ev) => setEmail(ev.target.value)}
        placeholder="du@beispiel.de"
        className="border-line bg-bg text-fg focus:border-line-strong placeholder:text-muted font-serif w-full rounded-xl border px-4 py-3.5 text-[17px] outline-none transition-colors"
      />
      <button
        type="submit"
        disabled={busy}
        className="bg-fg mt-3 w-full rounded-xl py-3.5 font-medium text-[#16211E] transition-colors hover:bg-white disabled:opacity-40"
      >
        {busy ? "…" : "Link schicken"}
      </button>
      {error && <p className="text-das mt-3 text-[13px]">{error}</p>}
    </form>
  );
}
