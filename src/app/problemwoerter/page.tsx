import Page from "@/components/Page";
import { requireUser } from "@/lib/user";
import { LEECH_THRESHOLD, leeches } from "@/lib/leech";
import LeechList from "./LeechList";

export const dynamic = "force-dynamic";

/** Problemwörter. */
export default async function LeechPage() {
  const user = await requireUser();
  const rows = leeches(user.id);
  const active = rows.filter((r) => r.suspended === 0).length;

  return (
    <Page
      back="/ueben"
      backLabel="Üben"
      title="Problemwörter"
      lead={
        active > 0 ? (
          <>
            {active} {active === 1 ? "word is" : "words are"} fighting you — you
            have forgotten each of them at least {LEECH_THRESHOLD} times.
            Reviewing them more often will not help: that is exactly what you
            are already doing.
          </>
        ) : (
          <>Words you have forgotten at least {LEECH_THRESHOLD} times.</>
        )
      }
    >
      <>
        <LeechList initial={rows} threshold={LEECH_THRESHOLD} />

        {rows.length > 0 && (
          <div className="border-line-sub text-muted mt-10 space-y-2 border-t pt-6 text-[13px] leading-relaxed">
            <p>
              <span className="text-secondary">Im Satz üben</span> — turns the
              example sentence into a gap-fill. A word with no context is the
              commonest reason it won&apos;t stick.
            </p>
            <p>
              <span className="text-secondary">Neu anfangen</span> — resets the
              card as if you had never seen the word. The forgotten-count
              deliberately stays: it is the word&apos;s history, not its score.
            </p>
            <p>
              <span className="text-secondary">Pausieren</span> — takes it out
              of rotation. Nothing is lost; it simply stops coming back until
              you bring it in again.
            </p>
          </div>
        )}
      </>
    </Page>
  );
}
