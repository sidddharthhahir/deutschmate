# Personalization Implementation Report

## 1. What Personalization Already Existed

Before this pass, the app already had more adaptive behavior than a first
look suggests:

- **`user.situation`** — the one-question onboarding answer, already stored
  and already driving a one-line copy change on the home screen's "German
  for real life" card (`alltagPitch()` in `src/app/page.tsx`).
- **Error-driven review, already substantial.** `src/lib/session-builder.ts`
  already built a "Fix" block from `topErrorTags(userId)`
  (`src/lib/errors.ts`) — the top 3 recurring mistake tags over the last 14
  days — already skipped that block entirely when a learner had no
  recurring mistakes, already showed a "Deine häufigsten Fehler" box with
  tag and count, and was already scoped per-user via `WHERE user_id = ?`.
  What it was missing was a one-sentence *why*.
- **FSRS spaced repetition** already adapts review timing per learner, per
  card — the pacing side of personalization was solid; the *content* side
  (names, welcome, variation) had nothing.
- No display name, no situation-based recommendation beyond that one card,
  no content variation, and no explanation attached to the Fix block. That
  is the gap this pass fills.

## 2. What Was Implemented

**Task 1 — safe preferred-name handling.** The login `name`/`id` is
normalised by `lib/who.ts` (lowercased, stripped to `[a-z0-9_-]`) and is
not display-quality — "Siddharth" is stored as `siddharth`, and a name with
spaces or umlauts couldn't even be registered as a username. So: a new,
optional, skippable `user.display_name` column, a settings-page form to set
it, and a sanitiser (`src/lib/display-name.ts`) enforced both at write time
and defensively at read time. Used in exactly three places, not everywhere:
the home-screen welcome, the first recap only (`streak === 1`), and unit
1's self-introduction dialogue line.

**Task 2 — personalized welcome and recommendation.** A pure, deterministic
`recommendationFor(situation)` helper (`src/lib/recommendation.ts`) mapping
the six onboarding answers (plus null) to one recommended action each, and
a small "Empfehlung für dich" line on the home screen using it.

**Task 3/4 — deterministic content variation.** A general, tested
`src/lib/variation.ts` module (`pickVariant`, `resolveTemplate`) that
deterministically selects one pre-approved variant from a small curated
set, keyed on `(userId, exerciseId, repetition)` — same key, same result,
always; a new repetition number *can* produce a different one. Applied to
exactly one real piece of content: unit 1's "Ich heiße {{name}}." line
(`data/curriculum-a1.json`, regenerated into `data/units-a1-1.json` via the
existing `npm run build-a1` pipeline). Everything else in the curriculum
was left alone — see §9 for why.

**Task 5 — error-driven personalization, the missing half.** A pure
`reasonForTags()` helper in `src/lib/errors.ts` turns the Fix block's
existing tag data into one sentence ("Du übst das noch mal, weil die
Wortstellung zuletzt schwierig war."), rendered in `FixBlock.tsx`.

**Task 6 — AI use.** Deliberately unchanged. See §4 and §9.

## 3. User Data Used

| Data | Source | Used for |
|---|---|---|
| `user.display_name` | new column, learner-set, optional | greeting, first recap, one dialogue line |
| `user.situation` | existing column | the recommendation line |
| `topErrorTags(userId)` | existing, from `attempt.error_tags_json` | the Fix block's reason sentence |
| `userId` itself | the session | the deterministic seed for variant selection (never sent anywhere, never shown) |
| conversation repeat count | new, `COUNT(*) FROM attempt WHERE kind='conversation' AND ref_id=?` | which variant a repeat visit gets |

Nothing else was added. No new column stores a "profile," a score, or an
inferred trait — see §6.

## 4. What Remains Static

- All grammar targets, learning objectives, and curriculum sequencing —
  untouched.
- Every exact-match answer path: Builder tile order, Cloze blanks,
  dictation/Listening typed answers, Grammar drill options. None of these
  have a variant convention, and none were retrofitted with one — varying
  them without a real content-authoring pass is exactly the kind of
  correctness risk the brief warned against.
- All Alltag survival-scenario content (Anmeldung, WG, Arzt, Bank, etc.) —
  no legal, bureaucratic, medical, or financial fact was personalized, and
  none of that content has a template token in it.
- The AI system prompt (`src/lib/ai.ts`'s `tutorSystem()`) — unchanged.
  Still built from three sources only: fixed instructions, the learner's
  known vocabulary, and server-authored scenario briefs. The learner's
  actual text still lands only in `messages`, never in `system`.

## 5. Personalization Logic

**Display name** (`src/lib/display-name.ts`): trim → length check (≤40) →
character allow-list (`\p{L}` letters of any script, plain spaces, hyphen,
apostrophe — no digits, no HTML/SQL-special characters, no control
characters). Enforced at write time (`displayNameProblem`, used by
`POST /api/settings {action:"display-name"}`) and re-checked defensively at
read time (`sanitizeDisplayName`), so a value that reached the column some
other way can never render something the write-time rule wouldn't have
accepted today.

**Recommendation** (`src/lib/recommendation.ts`): a `switch` on the
situation value, one branch each, no scoring, no ranking. `university` and
`student_job` take an availability flag (`hasUniversityContent`,
`hasJobContent`) so the function stays pure and testable rather than
querying the database itself; today those default to `true`/`false`,
matching reality (a Prüfungsamt scenario exists; nothing job-specific does
yet).

**Variation** (`src/lib/variation.ts`): `pickVariant(category, {userId,
exerciseId, repetition})` hashes the three seed parts into one string,
hashes that string (a small djb2-style hash, not cryptographic — it only
has to resist a page refresh, not an attacker), and indexes into the
category's fixed array. `resolveTemplate(text, fallback, seed)` replaces
every `{{category}}` token; if a category is unknown or empty, the
*original, caller-supplied static text* is returned instead — never a raw
`{{token}}` shown to a learner.

**Reason** (`src/lib/errors.ts`'s `reasonForTags`): takes the same
`{tag, n}[]` the Fix block's drills already come from, names the single
most frequent tag in German, and returns one sentence, or `null` when
there's nothing to explain.

## 6. Privacy and Security Decisions

- **No sensitive inference.** Nothing here reads a name and infers
  nationality, ethnicity, legal status, or religion — the display name is
  never parsed for anything beyond its literal characters and length.
- **No profile is stored.** There is no `user_profile` table, no derived
  "learner type," no history of which variants were shown. Repetition count
  is *counted fresh* from `attempt` rows each time, never cached as a
  separate mutable field that could drift or leak.
- **Display name never reaches analytics.** All four new events
  (`personalization_name_used`, `recommendation_shown`,
  `personalized_variant_shown`, `error_driven_review_shown`) carry only
  enum-like context (`location`, `situation`, `category`, `tag`) — checked
  by extending `/api/track`'s existing per-event property allow-list
  (`src/app/api/track/route.ts`), the same mechanism the last security
  audit added to close an unrelated open-write issue. The name itself is
  never a permitted key.
- **AI input unchanged.** The display name is deliberately **not** sent to
  the Anthropic API in this pass — the self-introduction scenario doesn't
  need to know the learner's real name to run (the learner types whatever
  name they want in their own reply, same as before), so sending it would
  be data the feature doesn't need. If a future scenario genuinely needs it
  for a better role-play, that's a separate, deliberate decision to make,
  not a default.
- **Cross-user isolation.** `topErrorTags`, `conversationRepeatCount`,
  `displayNameFor`, and every settings mutation are all scoped by
  `WHERE user_id = ?` in the SQL itself — the same discipline the security
  audit already verified holds everywhere else in this codebase. Verified
  again here, freshly, with two real scratch accounts
  (`tests/personalization.test.mts`).
- **Account deletion is unaffected.** `user.display_name` sits on the same
  `user` row every other per-account field does; no new table, no new
  foreign key, nothing that needs a separate deletion path.

## 7. Tests Added and Run

| File | Covers | Needs |
|---|---|---|
| `tests/display-name.test.mts` | sanitization, length/character limits, fallback for corrupted values, existing users with no name | nothing |
| `tests/recommendation.test.mts` | every situation maps to a real link, the exact brief's mapping, determinism, availability-flag fallback | nothing |
| `tests/variation.test.mts` | determinism (20 repeats, identical seed), variance across repetition and user, every returned variant is in the approved set, unknown-category and missing-variant fallback, `resolveTemplate` substitution | nothing |
| `tests/personalization.test.mts` | Fix-block reason appears/doesn't appear correctly, balanced mix, cross-user isolation (errors, display name), malformed `error_tags_json` doesn't 500 the session, fresh accounts with no personalization data | server |

Two real bugs were found and fixed *by* these tests, not just documented:

1. `sanitizeDisplayName` truncated an over-length value to 40 characters
   *before* validating it, so the length check could never actually reject
   anything — fixed to validate the untruncated value.
2. The `ALLOWED` regex used `\s` (any whitespace, including newlines and
   tabs) instead of a literal space — an embedded newline passed as a
   "valid" display name. Fixed.
3. `topErrorTags()` called `JSON.parse()` on `error_tags_json` with no
   try/catch — a single malformed row would 500 the entire session-build
   endpoint for that user. Found by the "malformed data" test this brief
   explicitly asked for; fixed with a try/catch that treats an unparsable
   row as contributing no tags.

**Manual verification**, live, in a real browser (headless Chrome via CDP,
same tooling as the earlier desktop-UX pass): registered a fresh account,
opened unit 1's conversation, confirmed the rendered dialogue showed a real
picked name ("Anna") with no raw `{{name}}` token visible anywhere in the
DOM, and confirmed three page reloads in a row produced the identical name
— determinism holding end-to-end, not just in the unit test.

**Full regression**, after every change:

```
npx tsc --noEmit     → clean
npx eslint           → clean
npx knip             → clean
npm run build        → succeeds
node tests/run.mts   → 47 passed (was 43 before this pass)
node scripts/check-scenes.mts → clean (the {{name}} token is exempted, not flagged as untaught vocabulary)
```

## 8. Files Changed

**New:**
`src/lib/display-name.ts`, `src/lib/recommendation.ts`, `src/lib/variation.ts`,
`src/app/einstellungen/DisplayNameForm.tsx`,
`tests/display-name.test.mts`, `tests/recommendation.test.mts`,
`tests/variation.test.mts`, `tests/personalization.test.mts`.

**Modified:**
`src/lib/schema.sql`, `src/lib/db.ts` (the `display_name` column + migration),
`src/lib/accounts.ts`, `src/lib/user.ts` (accessors),
`src/lib/errors.ts` (`reasonForTags`, and the malformed-JSON fix),
`src/lib/session-builder.ts`, `src/lib/session-content.ts`
(`conversationRepeatCount`, threading `repetition`/`userId`/`reason` through),
`src/app/api/session/route.ts` (`displayName` in the response),
`src/app/api/settings/route.ts` (the `display-name` action),
`src/app/api/track/route.ts` (four new allow-listed events),
`src/app/page.tsx` (greeting, recommendation line, analytics — plus an
unrelated one-line bug fix found while testing at 1am: `greeting()` had no
night bucket, so 1am read as "Guten Morgen"),
`src/app/session/page.tsx`, `src/components/SessionRecap.tsx`
(first-recap name), `src/components/blocks/FixBlock.tsx` (the reason
sentence + its event), `src/components/blocks/ConversationBlock.tsx`
(template resolution), `src/app/szenario/[id]/page.tsx`,
`src/app/szenario/[id]/ScenarioRunner.tsx`, `src/app/alltag/[id]/page.tsx`
(threading `repetition`/`userId`), `src/app/einstellungen/page.tsx` (wiring
in the new form), `data/curriculum-a1.json` and `data/units-a1-1.json`
(the one `{{name}}` token, regenerated through the existing `build-a1`
pipeline), `scripts/check-scenes.mts` (exempting the token from the
vocabulary gate, the same way proper nouns already are).

## 9. Known Limitations

- **Content variation is infrastructure-plus-one-example, not broad
  coverage.** `VARIANT_SETS` currently has `name`, `city`, `country` —
  tested and correct — but only `name` is wired into any actual rendered
  content, and only in one place (unit 1's self-introduction line). Cities,
  countries, occupations, and dates/times are not yet templated anywhere in
  the curriculum. Doing that broadly means auditing every exact-match
  answer path unit by unit for collateral risk, which this pass correctly
  treated as out of scope rather than forcing.
- **`data/curriculum-a1.json` and `data/units-a1-1.json` are two files for
  one fact**, generated from the first into the second by
  `scripts/build-a1.mts`. This was true before this pass and is unrelated
  to personalization, but it means a future content edit to unit 1's
  dialogue has to happen in `curriculum-a1.json`, not the generated file,
  or it will be silently overwritten the next time `build-a1` runs. (This
  pass discovered that the hard way: an early edit landed in the generated
  file only, and running `build-a1` to add the token properly would have
  reverted it. The final state is correct — both files agree — but the
  duplication itself is a pre-existing repo characteristic, not something
  this pass fixed.)
- **The AI role-play never learns the learner's real name**, by deliberate
  choice (§6), so a live (non-scripted) conversation about "what's your
  name" still asks and waits for a typed answer rather than already
  knowing it. This is a chosen trade-off (minimum necessary data), not an
  oversight.
- **`few_months`** is a real, existing situation value
  (`src/lib/situation.ts`) that the brief's recommendation mapping doesn't
  mention. It falls through to the same default as `null` (the standard
  course). That's a safe, honest choice given the brief didn't specify one,
  but it means that one situation gets no distinct recommendation copy.
- **No screen-reader or real-microphone verification** was repeated in
  this pass — those were covered by the earlier desktop-UX and security
  audits and nothing here changes that surface.

## 10. Recommended User Experiment

**Hypothesis:** seeing your own (chosen) name in the very first
self-introduction dialogue, plus a one-line "recommended for you" nudge on
the home screen, measurably increases whether a new learner completes their
first session and returns the next day, compared to the generic version.

**Target users:** new signups over the next few weeks — compare the cohort
before this change (from existing `session_log`/`event` history) against
the cohort after, using the same day-1/day-2 completion definition the
prior V1 report already established.

**Success metric:** day-2 return rate among accounts that set a display
name and/or picked a situation during onboarding, versus those that skipped
both — using the already-tracked `personalization_name_used`,
`recommendation_shown`, and `lesson_completed`/`scenario_completed` events,
no new instrumentation needed.

**Minimum evidence:** this remains a small, self-hosted install — treat
this as qualitative until at least 15–20 new signups have had a week to
return or not, same caveat the desktop-UX report already gave for its own
recommended experiment.

**Decision it informs:** whether to invest further in broadening content
variation (cities, occupations, dates — the infrastructure already exists
and is tested) versus leaving it at this one example and putting the next
round of effort into the curriculum gaps the product-strategy audit
identified instead.
