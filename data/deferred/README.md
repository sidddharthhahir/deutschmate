# Deferred content

Everything in this directory is real, previously-shipped curriculum content
for A1.2 through B1.2 — units, grammar points, readings, survival scenarios,
and the blueprints that generated some of it. None of it is deleted; it's
just not read by `scripts/seed.mts` right now, so the running app is A1.1
only, per the 2026-09 decision to get the Momente-based A1.1 rewrite fully
solid before extending it upward again.

`curriculum-a1-full.json` and `vocab-a1-full.json` are snapshots of
`data/curriculum-a1.json` and `data/vocab-a1.json` taken right before those
two were trimmed down to their A1.1-only slice — they carried the reconciled
A1.2 renumbering (ord 13–32) done during the A1.1 rewrite, which existed only
in the working tree and not in any prior commit, so trimming the live files
without this copy would have lost that work permanently.

## Bringing a level back

1. Move its files back to `data/` (reverse of how they got here — check
   `scripts/seed.mts`'s `WORD_FILES`/`GRAMMAR_FILES`/`UNIT_FILES`/
   `READING_FILES` lists for the exact filenames each level needs).
2. Add the file back to the relevant list in `scripts/seed.mts`.
3. For A1.2 specifically: merge `curriculum-a1-full.json`'s and
   `vocab-a1-full.json`'s A1.2 entries (`ord`/`unit` > 12) back into the live
   `data/curriculum-a1.json` / `data/vocab-a1.json` — don't just restore the
   whole file, since A1.1 may have changed since this snapshot was taken.
4. Re-run `npm run seed` and the test suite; fix whatever the tests that
   assert "A1.1 only" (unit counts, level lists, etc.) now correctly flag as
   stale.

Word content (`data/words-*.json`) was never touched by this — the full
vocabulary deck across all six levels still seeds and is browsable in
Wortschatz regardless of which levels have an actual course built on top of
it.

## `blueprints-a1-old-goethe-plan.json` is different

Not deferred — superseded. It's the old Goethe-based A1.1 blueprint (20
units, starting at ord 13 for what's shown here), fully replaced by the
hand-written `data/units-a1-1.json` and `data/curriculum-a1.json`. A1.1 is
never generated from a blueprint again, so this file won't come back into
`scripts/build-units.mts`'s input list the way A2/B1's will — it's kept only
because deleting authored content outright wasn't this session's call to
make unilaterally.
