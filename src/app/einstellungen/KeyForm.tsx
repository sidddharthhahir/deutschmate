"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type State =
  | { state: "none" }
  | { state: "set"; hint: string; at: string }
  | { state: "unreadable" }
  | { state: "unavailable" };

/**
 * Paste a key, remove it, set a cap.
 *
 * The field is `type="password"` and is cleared the instant the key is stored —
 * there is no state in this component that holds it after the request, and the
 * server never sends one back. What comes back is the last four characters.
 */
export default function KeyForm({
  state,
  spend,
  cap,
  isDefault,
}: {
  state: State;
  spend: number;
  cap: number;
  isDefault: boolean;
}) {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; tone: "ok" | "warn" } | null>(null);
  const [budget, setBudget] = useState(isDefault ? "" : String(cap));

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; verified?: boolean };
      if (!res.ok || !data.ok) {
        setNote({ text: data.error ?? "Ging nicht.", tone: "warn" });
        return null;
      }
      return data;
    } catch {
      setNote({ text: "Server nicht erreichbar.", tone: "warn" });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim() || busy) return;
    const data = await post({ action: "key", key });
    if (!data) return;
    setKey(""); // never kept after the request
    setNote(
      data.verified
        ? { text: "Gespeichert und geprüft.", tone: "ok" }
        : { text: "Gespeichert — konnte gerade nicht bei Anthropic geprüft werden.", tone: "warn" },
    );
    router.refresh();
  }

  async function remove() {
    if (!(await post({ action: "key:remove" }))) return;
    setNote({ text: "Entfernt.", tone: "ok" });
    router.refresh();
  }

  async function saveBudget(e: React.FormEvent) {
    e.preventDefault();
    if (!(await post({ action: "budget", budget: budget.trim() === "" ? null : budget }))) return;
    setNote({
      text: budget.trim() === "" ? "Auf den Standard zurückgesetzt." : "Limit gesetzt.",
      tone: "ok",
    });
    router.refresh();
  }

  if (state.state === "unavailable") {
    return (
      <div className="border-line bg-raised mt-8 rounded-xl border p-5">
        <p className="font-serif text-[19px]">Dieser Server speichert keine Schlüssel</p>
        <p className="text-muted mt-2 max-w-[52ch] text-[13.5px] leading-relaxed">
          Es ist kein <code className="font-mono">DEUTSCHMATE_SECRET</code> gesetzt, also gibt
          es nichts, womit dein Schlüssel verschlüsselt werden könnte — und unverschlüsselt
          wird er nicht abgelegt. <code className="font-mono">npm run setup</code> erzeugt
          eins.
        </p>
      </div>
    );
  }

  return (
    <>
      <section className="mt-8">
        <h2 className="font-mono text-muted mb-3 text-[11.5px] tracking-[0.14em] uppercase">
          Anthropic-Schlüssel
        </h2>

        {state.state === "set" && (
          <div className="border-line bg-raised flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
            <div>
              <p className="font-mono text-[14px]">sk-ant-…{state.hint}</p>
              <p className="text-muted mt-0.5 text-[12px]">
                seit {state.at ? state.at.slice(0, 10) : "—"}
              </p>
            </div>
            <button
              onClick={remove}
              disabled={busy}
              className="border-line text-secondary hover:border-line-strong hover:text-fg rounded-full border px-4 py-1.5 text-[13px] transition-colors disabled:opacity-40"
            >
              Entfernen
            </button>
          </div>
        )}

        {state.state === "unreadable" && (
          <div className="border-das/40 bg-raised rounded-xl border p-4">
            <p className="text-das text-[14px]">Dein Schlüssel ist nicht mehr lesbar</p>
            <p className="text-muted mt-1 max-w-[52ch] text-[12.5px] leading-relaxed">
              Gespeichert ist etwas, aber dieser Server kann es nicht entschlüsseln — meist
              heißt das, <code className="font-mono">DEUTSCHMATE_SECRET</code> hat sich
              geändert. Füg ihn einfach nochmal ein.
            </p>
          </div>
        )}

        <form onSubmit={save} className="mt-3">
          <div className="flex gap-2">
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={state.state === "set" ? "Neuen Schlüssel einfügen" : "sk-ant-…"}
              autoComplete="off"
              spellCheck={false}
              className="border-line bg-bg text-fg focus:border-line-strong placeholder:text-muted font-mono flex-1 rounded-xl border px-4 py-3 text-[14px] outline-none"
            />
            <button
              type="submit"
              disabled={busy || !key.trim()}
              className="bg-fg rounded-xl px-6 font-medium text-[#16211E] transition-colors hover:bg-white disabled:opacity-40"
            >
              {state.state === "set" ? "Ersetzen" : "Speichern"}
            </button>
          </div>
          <p className="text-muted mt-2 text-[12.5px]">
            Aus console.anthropic.com → API keys. Er wird beim Speichern einmal geprüft.
          </p>
        </form>
      </section>

      <section className="border-line-sub mt-10 border-t pt-6">
        <h2 className="font-mono text-muted mb-3 text-[11.5px] tracking-[0.14em] uppercase">
          Dein Limit · 30 Tage
        </h2>
        <p className="text-secondary text-[14px]">
          Bisher ausgegeben: <span className="font-mono">{spend.toFixed(2)} $</span> von{" "}
          <span className="font-mono">{cap.toFixed(2)} $</span>
          {isDefault && <span className="text-muted"> (Standard)</span>}
        </p>
        <form onSubmit={saveBudget} className="mt-3 flex gap-2">
          <input
            type="number"
            min={0}
            max={1000}
            step="0.5"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder={`Standard: ${budgetPlaceholder(cap, isDefault)}`}
            className="border-line bg-bg text-fg focus:border-line-strong placeholder:text-muted font-mono w-[180px] rounded-xl border px-4 py-3 text-[14px] outline-none"
          />
          <button
            type="submit"
            disabled={busy}
            className="border-line text-secondary hover:border-line-strong hover:text-fg rounded-xl border px-5 text-[14px] transition-colors disabled:opacity-40"
          >
            Setzen
          </button>
        </form>
        <p className="text-muted mt-2 max-w-[56ch] text-[12.5px] leading-relaxed">
          Wird durchgesetzt, nicht nur angezeigt: Ist es aufgebraucht, gehen Gespräch,
          Schreibkorrektur und neue Erklärungen denselben Weg wie ohne Schlüssel — der Rest
          der App läuft weiter. Leer lassen für den Standard, 0 für gar keine Ausgaben.
        </p>
      </section>

      {note && (
        <p
          className={`dm-fade mt-6 text-[13px] ${note.tone === "ok" ? "text-accent" : "text-das"}`}
        >
          {note.text}
        </p>
      )}
    </>
  );
}

function budgetPlaceholder(cap: number, isDefault: boolean) {
  return isDefault ? `${cap.toFixed(2)} $` : "leer = Standard";
}
