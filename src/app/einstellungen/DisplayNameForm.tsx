"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MAX_DISPLAY_NAME } from "@/lib/display-name";

/** How to be greeted — optional, skippable, never the login name. */
export default function DisplayNameForm({
  initial,
}: {
  initial: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "display-name", displayName: name }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setNote(data.error ?? "Ging nicht.");
        return;
      }
      setNote(name.trim() ? "Gespeichert." : "Zurückgesetzt.");
      router.refresh();
    } catch {
      setNote("Server nicht erreichbar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <label
        htmlFor="dm-display-name"
        className="font-mono text-muted text-[11.5px] tracking-[0.14em] uppercase"
      >
        Wie sollen wir dich nennen? · optional
      </label>
      <div className="flex gap-2">
        <input
          id="dm-display-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={MAX_DISPLAY_NAME}
          placeholder="z. B. Mira"
          className="border-line bg-surface focus:border-line-strong placeholder:text-muted flex-1 rounded-xl border px-4 py-3 text-[15px] outline-none"
        />
        <button
          type="submit"
          disabled={busy}
          className="border-line hover:border-line-strong hover:text-fg text-secondary rounded-xl border px-5 py-3 text-[14px] transition-colors disabled:opacity-50"
        >
          {busy ? "…" : "Speichern"}
        </button>
      </div>
      {note && <p className="text-muted text-[12.5px]">{note}</p>}
      <p className="text-muted text-[12.5px] leading-relaxed">
        Nur für die Begrüßung — dein Benutzername zum Anmelden bleibt gleich.
        Leer lassen und speichern setzt es zurück.
      </p>
    </form>
  );
}
