"use client";

import { useState } from "react";
import GermanText from "@/components/GermanText";
import { GermanTextarea } from "@/components/GermanInput";
import Noun from "@/components/Article";

type ScanWord = {
  form: string;
  count: number;
  wordId: string | null;
  lemma: string | null;
  article: string | null;
  en: string | null;
  level: string | null;
  known: boolean;
  queued: boolean;
};

type Scan = {
  tokens: number;
  distinct: number;
  known: number;
  queued: number;
  course: number;
  unknown: number;
  coverage: number;
  words: ScanWord[];
};

const SAMPLE = `Sehr geehrte Damen und Herren,

hiermit kündige ich meinen Vertrag zum nächstmöglichen Zeitpunkt. Bitte bestätigen Sie mir die Kündigung schriftlich und teilen Sie mir das genaue Datum mit.

Mit freundlichen Grüßen`;

export default function TextTool() {
  const [text, setText] = useState("");
  const [scan, setScan] = useState<Scan | null>(null);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(input: string) {
    const body = input.trim();
    if (!body) return;
    setBusy(true);
    setError(null);
    setAdded(null);
    try {
      const res = await fetch("/api/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: body }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Konnte den Text nicht lesen.");
        setScan(null);
      } else {
        setScan(data as Scan);
      }
    } catch {
      setError("Keine Verbindung — der Abgleich läuft auf dem Server.");
    } finally {
      setBusy(false);
    }
  }

  async function addAll(ids: string[]) {
    if (!ids.length) return;
    setBusy(true);
    try {
      const res = await fetch("/api/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", wordIds: ids }),
      });
      const data = (await res.json()) as { added?: number };
      setAdded(data.added ?? 0);
      // Re-scan so the counts reflect the deck as it is now, not as it was.
      await run(text);
    } catch {
      setError("Nicht gespeichert.");
    } finally {
      setBusy(false);
    }
  }

  // ------------------------------------------------------------------ input
  if (!scan) {
    return (
      <div>
        <GermanTextarea
          value={text}
          onChange={setText}
          rows={12}
          placeholder="Deutschen Text hier einfügen — eine WG-Anzeige, eine E-Mail von der Uni, ein Brief vom Amt, eine Speisekarte…"
          ariaLabel="Dein Text"
          className="border-line bg-surface font-serif focus:border-line-strong placeholder:text-muted w-full resize-none rounded-[14px] border p-5 text-[17px] leading-relaxed outline-none"
        />

        {error && <p className="text-das mt-3 text-[14px]">{error}</p>}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={() => void run(text)}
            disabled={busy || !text.trim()}
            className="bg-fg rounded-xl px-7 py-3.5 font-medium text-[#16211E] transition-colors hover:bg-white disabled:bg-[#243330] disabled:text-[#5C6B65]"
          >
            {busy ? "Wird gelesen…" : "Text durchgehen"}
          </button>
          <button
            onClick={() => {
              setText(SAMPLE);
              void run(SAMPLE);
            }}
            disabled={busy}
            className="font-mono text-muted hover:text-secondary text-[12px] transition-colors"
          >
            Beispiel ausprobieren
          </button>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------------- result
  const newInCourse = scan.words.filter((w) => w.wordId && !w.known && !w.queued);
  const queued = scan.words.filter((w) => w.queued);
  const notInCourse = scan.words.filter((w) => !w.wordId);

  return (
    <div>
      <div className="border-line bg-surface rounded-[14px] border p-6">
        <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
          <Stat n={scan.tokens} label="Wörter" hint={`${scan.distinct} verschiedene`} />
          <Stat n={scan.coverage} label="verstehst du" suffix="%" hint="der laufenden Wörter" />
          <Stat
            n={newInCourse.length}
            label="neu im Kurs"
            hint={queued.length ? `${queued.length} liegen schon bereit` : "kannst du sofort lernen"}
          />
          <Stat n={notInCourse.length} label="nicht im Kurs" hint="kennt die App nicht" />
        </div>

        <p className="text-muted mt-5 max-w-[62ch] text-[13px] leading-relaxed">
          „verstehst du“ zählt nur Wörter, die du wirklich schon geübt hast. Wörter ins
          Deck zu legen ändert die Zahl bewusst nicht — gelernt sind sie damit ja noch
          nicht. Und Grammatik ist gar nicht mitgezählt: du kannst 90 % der Wörter kennen
          und den Satz trotzdem nicht verstehen.
        </p>

        {queued.length > 0 && (
          <p className="text-secondary mt-3 text-[13.5px]">
            {queued.length} {queued.length === 1 ? "Wort wartet" : "Wörter warten"} schon in
            deinem Deck auf die nächste Sitzung.
          </p>
        )}

        {added !== null && (
          <p className="text-accent mt-3 text-[13.5px]">
            {added === 0
              ? "Nichts hinzugefügt — die waren alle schon im Deck."
              : `${added} ${added === 1 ? "Wort" : "Wörter"} ins Deck gelegt. Kommen in der nächsten Sitzung.`}
          </p>
        )}

        {newInCourse.length > 0 && (
          <button
            onClick={() => void addAll(newInCourse.map((w) => w.wordId!))}
            disabled={busy}
            className="border-line-strong text-fg hover:bg-raised mt-5 rounded-xl border px-5 py-3 text-[14px] transition-colors disabled:opacity-50"
          >
            Alle {newInCourse.length} neuen Wörter ins Deck
          </button>
        )}
      </div>

      {/* -------------------------------------------------------- the text */}
      <div className="border-line bg-surface mt-4 rounded-[14px] border p-6 md:p-8">
        <GermanText body={text} sourceRef="eigener-text" />
      </div>

      {/* ------------------------------------------------------ word lists */}
      {newInCourse.length > 0 && (
        <WordList
          title={`Neu für dich · ${newInCourse.length}`}
          note="Diese Wörter unterrichtet der Kurs — du bist nur noch nicht dort angekommen."
          words={newInCourse}
        />
      )}

      {notInCourse.length > 0 && (
        <WordList
          title={`Kennt die App nicht · ${notInCourse.length}`}
          note="Nicht in den 1.225 Wörtern. Das sagt etwas über die App, nicht über dein Deutsch — Eigennamen, Fachwörter, seltene Formen."
          words={notInCourse}
        />
      )}

      <button
        onClick={() => {
          setScan(null);
          setAdded(null);
        }}
        className="border-line text-secondary hover:border-line-strong hover:text-fg mt-6 w-full rounded-xl border py-3.5 text-[14px] transition-colors"
      >
        Anderen Text einfügen
      </button>
    </div>
  );
}

function WordList({
  title,
  note,
  words,
}: {
  title: string;
  note: string;
  words: ScanWord[];
}) {
  return (
    <section className="border-line-sub mt-8 border-t pt-6">
      <h2 className="font-mono text-muted mb-2 text-[11.5px] tracking-[0.14em] uppercase">
        {title}
      </h2>
      <p className="text-muted mb-4 max-w-[62ch] text-[12.5px] leading-relaxed">{note}</p>
      <div className="flex flex-wrap gap-1.5">
        {words.slice(0, 120).map((w) => (
          <span
            key={w.form}
            title={w.en ?? undefined}
            className="border-line-sub text-secondary rounded-full border px-3 py-1.5 text-[13px]"
          >
            {w.lemma ? (
              <Noun article={w.article}>{w.lemma}</Noun>
            ) : (
              w.form
            )}
            {w.en && <span className="text-muted ml-2 text-[11.5px]">{w.en}</span>}
            {w.count > 1 && (
              <span className="text-muted/60 font-mono ml-2 text-[10.5px]">{w.count}×</span>
            )}
          </span>
        ))}
        {words.length > 120 && (
          <span className="text-muted self-center text-[12px]">
            … und {words.length - 120} weitere
          </span>
        )}
      </div>
    </section>
  );
}

function Stat({
  n,
  label,
  hint,
  suffix,
}: {
  n: number;
  label: string;
  hint: string;
  suffix?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-serif text-[34px] leading-none font-semibold tracking-[-0.03em] tabular-nums">
        {n}
        {suffix && <span className="text-[20px]">{suffix}</span>}
      </span>
      <span className="font-mono text-secondary text-[11px] tracking-[0.08em] uppercase">
        {label}
      </span>
      <span className="text-muted/70 text-[11px] leading-tight">{hint}</span>
    </div>
  );
}
