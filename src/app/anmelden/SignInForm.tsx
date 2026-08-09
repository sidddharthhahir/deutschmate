"use client";

import { useState } from "react";
import { MIN_PASSWORD } from "@/lib/password-rules";

type Mode = "signin" | "register" | "reset";

const TITLE: Record<Mode, string> = {
  signin: "Willkommen zurück",
  register: "Konto erstellen",
  reset: "Passwort vergessen",
};

const LEAD: Record<Mode, string> = {
  signin: "Benutzername und Passwort. Danach fragt dieses Gerät nicht mehr.",
  register: `Benutzername und ein Passwort mit mindestens ${MIN_PASSWORD} Zeichen. Keine E-Mail, keine Bestätigung.`,
  reset: "Dein Wiederherstellungscode und ein neues Passwort.",
};

export default function SignInForm({ first }: { first: boolean }) {
  const [mode, setMode] = useState<Mode>(first ? "register" : "signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* Shown once, and only here. The server cannot show it again — it stores a
     hash — so this screen does not navigate away on its own. */
  const [recovery, setRecovery] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: mode, username, password, code }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        recoveryCode?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Das hat nicht geklappt.");
        setBusy(false);
        return;
      }
      if (data.recoveryCode) {
        setRecovery(data.recoveryCode);
        setBusy(false);
        return;
      }
      /* A full load, not a router push: the session cookie was just set and
         every server component needs to see it. Next 16.3's lint rule wants a
         router push here, and it is wrong for this one case — crossing from
         signed-out to signed-in is exactly when a cached RSC payload rendered
         for the previous state must be thrown away rather than reused. */
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/";
    } catch {
      setError("Der Server hat nicht geantwortet.");
      setBusy(false);
    }
  }

  if (recovery) {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <p className="font-mono text-muted mb-2 text-[11.5px] tracking-[0.14em] uppercase">
            Wiederherstellungscode
          </p>
          <p className="font-mono border-line bg-surface selection:bg-accent/30 rounded-xl border px-4 py-4 text-center text-[19px] tracking-[0.12em]">
            {recovery}
          </p>
        </div>
        <p className="text-secondary text-[14px] leading-relaxed">
          <strong className="text-fg">Schreib ihn auf.</strong> Er wird nur
          einmal angezeigt und ist der einzige Weg zurück, wenn du dein Passwort
          vergisst — es gibt keine E-Mail, an die wir etwas schicken könnten.
        </p>
        <button
          /* Same reason as above: this is the first load after registering. */
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          onClick={() => (window.location.href = "/")}
          className="bg-fg w-full rounded-xl py-3.5 font-medium text-[#16211E] transition-colors hover:bg-white"
        >
          Hab ich — los geht&apos;s
        </button>
      </div>
    );
  }

  return (
    <>
      <h1 className="font-serif mt-2 text-[30px] font-semibold tracking-[-0.015em]">
        {TITLE[mode]}
      </h1>
      <p className="text-secondary mt-3 text-[15px] leading-relaxed">
        {LEAD[mode]}
      </p>

      <form onSubmit={submit} className="mt-7 flex flex-col gap-3">
        <label className="font-mono text-muted text-[11.5px] tracking-[0.14em] uppercase">
          Benutzername
        </label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          placeholder="mira"
          className="border-line bg-surface focus:border-line-strong placeholder:text-muted rounded-xl border px-4 py-3 text-[15px] outline-none"
        />

        {mode === "reset" && (
          <>
            <label className="font-mono text-muted mt-2 text-[11.5px] tracking-[0.14em] uppercase">
              Wiederherstellungscode
            </label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              required
              placeholder="X7K2-9PQR-M4TW-BH3D"
              className="border-line bg-surface font-mono focus:border-line-strong placeholder:text-muted rounded-xl border px-4 py-3 text-[15px] outline-none"
            />
          </>
        )}

        <label className="font-mono text-muted mt-2 text-[11.5px] tracking-[0.14em] uppercase">
          {mode === "reset" ? "Neues Passwort" : "Passwort"}
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          required
          minLength={mode === "signin" ? undefined : MIN_PASSWORD}
          className="border-line bg-surface focus:border-line-strong rounded-xl border px-4 py-3 text-[15px] outline-none"
        />

        {error && (
          <p className="text-[14px] text-[#E4A0A0]" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="bg-fg mt-2 w-full rounded-xl py-3.5 font-medium text-[#16211E] transition-colors hover:bg-white disabled:opacity-50"
        >
          {busy
            ? "…"
            : mode === "register"
              ? "Konto erstellen"
              : mode === "reset"
                ? "Passwort neu setzen"
                : "Anmelden"}
        </button>
      </form>

      <div className="font-mono text-muted mt-6 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px]">
        {mode !== "signin" && (
          <button
            onClick={() => {
              setMode("signin");
              setError(null);
            }}
            className="hover:text-secondary py-2 transition-colors"
          >
            ← Anmelden
          </button>
        )}
        {mode === "signin" && (
          <>
            <button
              onClick={() => {
                setMode("register");
                setError(null);
              }}
              className="hover:text-secondary py-2 transition-colors"
            >
              Konto erstellen
            </button>
            <button
              onClick={() => {
                setMode("reset");
                setError(null);
              }}
              className="hover:text-secondary py-2 transition-colors"
            >
              Passwort vergessen?
            </button>
          </>
        )}
      </div>
    </>
  );
}
