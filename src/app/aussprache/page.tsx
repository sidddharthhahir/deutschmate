import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { all } from "@/lib/db";
import { requireUser } from "@/lib/user";
import { pairsFor, SOUNDS, SOUND_SPELLING } from "@/lib/pairs";
import PairDrill from "./PairDrill";

export const dynamic = "force-dynamic";

/** Explicitly "everything", as opposed to "whatever is weakest". */
const MIXED = "alle";

/**
 * Which sound is actually failing for this learner.
 *
 * Counted from real speaking attempts: for every word the recogniser was
 * given, did it come back? Grouped by the sounds each word contains. The
 * weakest group with a real sample is what the drill opens on.
 */
function weakestSound(userId: string): { sound: string; ok: number; total: number } | null {
  const rows = all<{ expected: string; user_answer: string }>(
    `SELECT expected, user_answer FROM attempt
      WHERE user_id = ? AND kind = 'speaking' AND expected IS NOT NULL`,
    userId,
  );
  if (!rows.length) return null;

  const tally = new Map<string, { ok: number; total: number }>();
  for (const r of rows) {
    const heard = new Set(
      (r.user_answer ?? "").toLowerCase().replace(/[.,!?]/g, "").split(/\s+/),
    );
    for (const w of r.expected.toLowerCase().replace(/[.,!?]/g, "").split(/\s+/)) {
      for (const [sound, re] of Object.entries(SOUND_SPELLING)) {
        if (!re.test(w)) continue;
        const t = tally.get(sound) ?? { ok: 0, total: 0 };
        t.total++;
        if (heard.has(w)) t.ok++;
        tally.set(sound, t);
      }
    }
  }

  const ranked = [...tally.entries()]
    // Five is not a lot, but below that a single mumble decides the answer.
    .filter(([, v]) => v.total >= 5)
    .sort((a, b) => a[1].ok / a[1].total - b[1].ok / b[1].total);

  if (!ranked.length) return null;
  const [sound, v] = ranked[0];
  return { sound, ...v };
}

export default async function PronunciationPage({
  searchParams,
}: {
  searchParams: Promise<{ laut?: string }>;
}) {
  const { laut } = await searchParams;
  const user = await requireUser();
  const weak = weakestSound(user.id);

  /* Explicit choice wins; otherwise open on whatever the data says is worst.
     "gemischt" is an explicit choice too — it used to link to ?laut=alle,
     which is not in SOUNDS, so it fell through to the auto-picked weak sound.
     On a new account `weak` is null and it happened to give the mixed spread,
     which is exactly why nobody noticed: the chip stopped working only once
     you had enough speaking attempts for the page to have an opinion. */
  const mixed = laut === MIXED;
  const chosen = mixed ? null : laut && SOUNDS.includes(laut) ? laut : (weak?.sound ?? null);
  const pairs = pairsFor(chosen, 10);

  return (
    <main className="flex min-h-screen flex-col">
      <AppHeader />

      <div className="mx-auto w-full max-w-[700px] flex-1 px-6 py-10 md:px-10">
        <Link
          href="/ueben"
          className="font-mono text-muted hover:text-secondary text-[12px] transition-colors"
        >
          ← Üben
        </Link>

        <h1 className="font-serif mt-4 text-[32px] font-semibold tracking-[-0.015em]">
          Minimalpaare
        </h1>

        {weak && !laut ? (
          <p className="text-secondary mt-3 max-w-[62ch] text-[15px] leading-relaxed">
            Bei <span className="font-serif text-fg text-[17px]">{weak.sound}</span> hat die
            Erkennung {weak.ok} von {weak.total} deiner Wörter verstanden — von allen Lauten
            mit genug Daten der schwächste. Deshalb fängt die Übung hier an.
          </p>
        ) : (
          <p className="text-secondary mt-3 max-w-[62ch] text-[15px] leading-relaxed">
            Zwei Wörter, ein Laut Unterschied. Wenn beide gleich klingen, sagst du nicht
            ungenau — du sagst ein anderes Wort.
          </p>
        )}

        {/* Every sound stays reachable; the data only picks the starting point. */}
        <div className="mt-6 flex flex-wrap gap-1.5">
          {SOUNDS.map((s) => (
            <Link
              key={s}
              href={`/aussprache?laut=${encodeURIComponent(s)}`}
              className={`rounded-full border px-3.5 py-1.5 text-[13px] transition-colors ${
                s === chosen
                  ? "border-fg text-fg"
                  : "border-line text-secondary hover:border-line-strong hover:text-fg"
              }`}
            >
              {s}
            </Link>
          ))}
          <Link
            href={`/aussprache?laut=${MIXED}`}
            className={`rounded-full border px-3.5 py-1.5 text-[13px] transition-colors ${
              mixed
                ? "border-fg text-fg"
                : "border-line text-secondary hover:border-line-strong hover:text-fg"
            }`}
          >
            gemischt
          </Link>
        </div>

        <div className="mt-8">
          <PairDrill pairs={pairs} sound={chosen} />
        </div>

        <p className="text-muted mt-10 max-w-[62ch] text-[12.5px] leading-relaxed">
          Die Erkennung ist keine Phonetikerin. Sie sagt dir, welches der beiden Wörter bei
          einer Maschine ankommt — ein echtes Signal, aber kein Aussprache-Score, und
          gelegentlich irrt sie sich.
        </p>
      </div>
    </main>
  );
}
