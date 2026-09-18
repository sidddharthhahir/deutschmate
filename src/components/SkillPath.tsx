export type PathUnit = {
  id: string;
  ord: number;
  title: string;
  done: boolean;
  mastered: boolean;
  pct: number;
  current: boolean;
};

/**
 * The Duolingo-style winding path, replacing the old one-tick-per-unit bar
 * rail. Three lanes (left/centre/right), cycling every three units, so the
 * path curves rather than running in a straight column — done with plain
 * flex alignment rather than an SVG curve, which is enough to read as a path
 * at the sizes this renders at and needs no new asset pipeline.
 *
 * State colours mirror the old rail exactly (same meaning, same tokens):
 * current = accent, mastered = der (filled + ring), done-but-not-mastered =
 * der at low opacity, locked/not-yet = line.
 *
 * A plain `title` attribute carries the tooltip, same as the old rail — it's
 * in the server-rendered HTML with no hover-state JS involved, which is what
 * a screen reader announces and what tests/mastery.test.mts scrapes to check
 * the mastery percentage Der Weg reports.
 */
export default function SkillPath({ units }: { units: PathUnit[] }) {
  const LANES = ["items-start", "items-center", "items-end"] as const;

  return (
    <div className="flex flex-col items-stretch">
      {units.map((u, i) => {
        const lane = LANES[i % 3];
        const isLast = i === units.length - 1;
        return (
          <div key={u.id} className={`flex flex-col ${lane}`}>
            <div
              title={
                `Unit ${u.ord} · ${u.title}` +
                (u.done ? ` — ${u.pct}% der Wörter sitzen` : "")
              }
              className="group flex flex-col items-center gap-1 px-2 py-1"
            >
              <span
                className={`dm-pill flex h-12 w-12 flex-none items-center justify-center rounded-full text-[15px] font-bold transition-transform group-hover:scale-105 ${
                  u.current
                    ? "bg-accent text-accent-fg dm-pop"
                    : u.mastered
                      ? "bg-der text-accent-fg ring-warm-line ring-4"
                      : u.done
                        ? "bg-der/35 text-fg"
                        : "bg-line text-muted"
                }`}
              >
                {u.mastered ? "★" : u.current ? "●" : u.ord}
              </span>
            </div>
            {!isLast && (
              <div
                className={`my-0.5 h-6 w-1 flex-none self-center rounded-full ${
                  u.done ? "bg-der/50" : "bg-line"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
