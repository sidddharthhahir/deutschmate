# Product Strategy Audit

**Repository:** DeutschMate (Next.js 16 / React 19 / TypeScript / SQLite via `node:sqlite`)
**Audit date:** 2026-09-18
**Method:** Static inspection of source, schema, seed data, tests, and existing project documentation (`DEUTSCHMATE-SPEC.md`, `DESIGN-BRIEF.md`, `DESIGN-ANSWERS.md`, `FRICTION.md`, `README.md`, `START-HERE.md`). No code was run beyond what was already seeded from prior sessions; no code was changed for this audit.

---

## 1. Executive Verdict

**Verdict: Weakly aligned**, leaning toward **Partially aligned** on engine/infrastructure and **Fundamentally misaligned** on business model.

This is not currently a generic Duolingo clone in its *engine* — the AI layer is genuinely constrained (vocabulary-limited roleplay, not open chat), the content model supports scenario-based dialogue natively, and there is a real, already-built feature that matches the thesis almost exactly. But it is also not, today, a "practical German for international students moving to Germany" product in what a user actually experiences. It is a general A1.1→B1.2 self-study course, built and documented explicitly as **a personal, non-commercial tool for the founder and a flatmate** (`DEUTSCHMATE-SPEC.md:5`: *"Users: me + roommate now; anyone later"*; `DESIGN-BRIEF.md:17`: *"Not a commercial product."*), onto which a Germany-life scenario pack was added once as an experiment and a Duolingo-style gamification layer was added more recently, on top of a spec that explicitly rejected both approaches.

**The single biggest strategic mismatch:** the feature that most closely matches the product thesis already exists — `/alltag`, twelve scripted-and-AI-backed scenarios named exactly like the thesis's own list (Anmeldung, WG-Besichtigung, Bank, Vertrag, Uni, Apotheke, Krankenkasse, Ausländerbehörde, Paket, Handwerker, Nebenkosten) — and it currently **ships nothing**. Every one of those scenarios is tagged A1.2 or later, and A1.2+ was deliberately unseeded in the most recent work on this repository (`data/deferred/README.md`, `scripts/seed.mts`). A user opening `/alltag` today sees an empty state (`src/app/alltag/page.tsx:24-30`). The most differentiated, thesis-aligned content in the whole codebase is switched off.

**The highest-leverage improvement, by a wide margin:** re-seed and ship the twelve `/alltag` scenarios (they don't require new engineering — they reuse the existing `ScenarioRunner`; see §4 and §10 item 1) and restructure the home/onboarding experience to lead with "what situation are you preparing for" instead of the current one-button, no-choice, unit-sequence flow that the founding spec deliberately built (`DEUTSCHMATE-SPEC.md:43-44`, principle 1: *"Never ask the user to choose a lesson, a skill, or a difficulty."*). That single principle is in direct tension with thesis principle 1 (scenario-first) and the V1 checklist's "fast onboarding with student-specific goals" — this document treats that tension as the central open question the team needs to resolve (see §12).

---

## 2. What Exists Today

| Product area | What exists in the code | Relevant files/routes | Completeness | Evidence |
|---|---|---|---|---|
| Onboarding | Username + password signup, a 6-step English-language app-mechanics tour, no goal/situation capture | `src/app/anmelden/SignInForm.tsx`, `src/app/willkommen/Tour.tsx` | Partial | Signup form fields are `username`, `password`, `code` only (`SignInForm.tsx:22-25`). No `goal`, `country`, `timeline` field anywhere in the `user` table (`src/lib/schema.sql:179-222`). |
| Curriculum and lesson path | Fixed-rhythm daily session builder; one unit at a time, in order, no lesson picker | `src/lib/session-builder.ts`, `src/lib/session-progression.ts` | Production-ready (mechanically) | `currentUnit()` in `session-progression.ts:69-97` always returns the single next unit; there is no lesson-selection UI anywhere in `src/app`. |
| A1.1 content | 12 hand-written units based on the Momente textbook's structure, real dialogue per unit, one pronunciation primer | `data/units-a1-1.json`, `data/curriculum-a1.json` | Production-ready for what it is | Unit titles: "Ich heiße Miriam", "Was machst du beruflich?", "Das ist meine Schwester", "Das Bild ist so schön" (furniture), "Wir haben einen Termin" (office), "Sie können super tanzen!" (hobbies), "Ich habe leider keine Zeit" (scheduling), "Ich mag Hamburger" (café), "Wann kommst du denn an?" (travel), "Was hast du gestern gemacht?", "Im Frühling..." — generic beginner-course topics, not Germany-bureaucracy or student-specific. |
| Vocabulary | ~3,120 words across all six levels, Goethe/Wiktextract-sourced, FSRS-scheduled | `data/words-*.json`, `src/lib/srs.ts`, `/wortschatz` | Production-ready (breadth), Weak (curation) | `README.md:7` states "the deck is 3,120 words". No topic tag or filter for "bureaucracy" or "student life" in `src/app/wortschatz/page.tsx`. |
| Grammar | 15 A1.1 points, short markdown explanations in English, tied to specific unit dialogue, drills per point | `data/grammar-a1.json`, `src/components/blocks/GrammarBlock.tsx` | Partial (only A1.1 currently ships) | `data/grammar-a1.json` entries such as `g-sein` explain in English ("heißen (to be called), sein (to be)...") with a conjugation table and drills. |
| Listening | Video (Deutsche Welle "Nicos Weg" embeds), audio-only commute mode, dictation drills, real slow-spoken news | `src/components/blocks/VideoBlock.tsx`, `src/app/unterwegs/WalkMode.tsx`, `src/components/blocks/ListeningBlock.tsx`, `src/app/nachrichten` | Partial | `src/app/nachrichten/page.tsx:13`: "Real news, slowly spoken... not course material" — general current-affairs content, not situational. |
| Speaking | Browser Web Speech recording + recognition, minimal-pair pronunciation drills, honest (no invented accuracy score) | `src/lib/speech.ts`, `src/components/blocks/SpeakingBlock.tsx`, `src/app/aussprache/PairDrill.tsx`, `src/lib/pairs.ts` | Usable but incomplete | `DEUTSCHMATE-SPEC.md:685-703` explicitly documents the decision not to fabricate a pronunciation percentage — a real strength — but there is no persona-constrained speaking practice (landlord call, interview) currently reachable, because that content lives in the deferred `/alltag` scenarios. |
| AI features | Constrained roleplay (`converse`), post-conversation correction, writing correction, sentence explanation, mnemonics, error explanation — all vocabulary-limited, none open-ended chat | `src/lib/ai.ts` (`converse` 235-265, `reviewConversation` 283+, `correctWriting` 347+, `explainSentence` 413+, `mnemonicFor` 441+, `explainMistake` 471+) | Usable but incomplete | `converse()` builds its system prompt from a fixed `Scenario` (`role`, `goal`, `opener`) and a fixed vocabulary list, not free text. This is the right shape for the thesis; the content fed into it (which personas exist) is the gap, not the mechanism. |
| Scenario-based learning | A full scenario engine (`ScenarioRunner`) reused by both regular units and a purpose-built "Alltag" survival pack; the survival pack is currently unseeded | `src/app/szenario/[id]/ScenarioRunner.tsx`, `src/app/alltag/page.tsx`, `src/app/alltag/[id]/page.tsx`, `src/lib/survival.ts`, `data/deferred/scenarios-survival.json` | Prototype (shipped state) / Partial (built state) | `src/lib/survival.ts:38-51` reads `data/scenarios-survival.json`, which no longer exists at that path — it was moved to `data/deferred/scenarios-survival.json` this session. `survivalScenarios()` therefore always returns `[]` today. |
| Progress tracking | Per-unit can-do statements, a visual "skill path", streak, words mastered vs. seen (kept separate on principle) | `src/app/weg/page.tsx`, `src/components/SkillPath.tsx`, `src/lib/journey.ts`, `src/lib/mastery.ts` | Production-ready | `unit.can_do_json` is rendered ahead of unit numbers throughout (`session/page.tsx`, `SessionRecap.tsx`) — a genuine, already-built instance of "progress = capability," per thesis principle 8. |
| Gamification | XP on every correct answer, hearts that gate new material, a header HUD, streak (pre-existing) | `src/lib/gamification.ts`, `src/lib/gamification-client.ts`, `src/components/HeartsAndXp.tsx` | Production-ready (mechanically), Strategically contested | `DEUTSCHMATE-SPEC.md:306-310` lists "XP · badges · achievements · leaderboards" under **"Cut, deliberately."** This was reintroduced in the most recent development pass without reconciling that decision. |
| Personalization | None beyond "your top 3 error tags get drilled tomorrow" | `src/lib/errors.ts` `topErrorTags()` | Not started (for thesis-relevant personalization) | No goal, situation, or self-reported context is ever captured or read anywhere in `src/`. |
| Student-life content | Twelve well-scoped scenarios matching the thesis almost verbatim, currently unshipped | `data/deferred/scenarios-survival.json` | Prototype (unshipped) | Scenario ids: `surv-anmeldung`, `surv-wg`, `surv-arzt`, `surv-bank`, `surv-vertrag`, `surv-uni`, `surv-apotheke`, `surv-krankenkasse`, `surv-auslaenderbehoerde`, `surv-paket`, `surv-handwerker`, `surv-nebenkosten` (12 entries, confirmed via `grep -c '"id":' data/deferred/scenarios-survival.json`). |
| Mobile UX | PWA manifest + service worker, touch-specific CSS, LAN dev mode for phone testing | `public/manifest.webmanifest`, `public/sw.js`, `src/app/globals.css` (`.touch-hint`/`.kbd-hint`), `npm run dev:lan` | Partial | Deployment is explicitly scoped to "localhost only, Mac only, for now" per this project's own recent working decisions (not in a doc file, but the app has no hosted deployment configuration in the repo). |
| Analytics | None | — | Not started | No analytics library in `package.json`, no event table in `src/lib/schema.sql`, no `track()`/`logEvent()` function anywhere (`grep` returned zero matches). |
| Paywall/subscription | None | — | Not started | No plan/subscription/payment table in the schema; no Stripe or billing package in `package.json`; `DEUTSCHMATE_BUDGET` env var caps *API cost*, not revenue (`README.md:14`, `src/lib/config.ts`). |
| Notifications | None | — | Not started | No push notification code, no email-sending code, no reminder scheduling. `FRICTION.md:52` lists "a voice for the app" as an unevaluated future idea, not notifications. |
| Referral/community | None | — | Not started | No referral code, invite link, or social feature anywhere in `src/`. |
| Admin/content-management | One page: video linking | `src/app/admin/video/page.tsx` | Prototype | All other content (units, vocab, grammar, scenarios) is authored by hand-editing JSON files and running TypeScript scripts in `scripts/` — there is no in-app content authoring tool. |

---

## 3. Alignment With Product Thesis

| Item | Score | Evidence |
|---|---|---|
| International student focus | **1** | README's own tagline ("practical, everyday use in Germany", `README.md:3`) gestures at this, but the founding spec states the actual user is "me + roommate" (`DEUTSCHMATE-SPEC.md:5`) and no code path asks who the learner is or why they're learning. |
| First-90-days-in-Germany journey | **1** | No structured "first 90 days" path exists. The one feature that would deliver this (`/alltag`, 12 scenarios) is unshipped (`data/deferred/scenarios-survival.json`). |
| Real-life German scenarios | **2** | The *mechanism* is strong (`ScenarioRunner`, constrained AI, scripted offline fallback per scenario) but the *content that ships* (units 1–12) is generic beginner-textbook material; the Germany-specific content (`/alltag`) is off. |
| A1.1 pedagogical quality | **3** | Real can-do statements per unit (`data/units-a1-1.json`), grammar sequencing enforced by `tests/curriculum.test.mts`'s "nothing is used before it is taught" section — mechanically sound, but written for general A1.1, not a student audience. |
| Clear learning progression | **3** | `/weg`'s skill path and prerequisite chain are real and tested (`tests/progression.test.mts`), but "why it matters" is framed as "you finished a unit," not "you can now do X in Germany" beyond the can-do list itself. |
| Grammar in context | **3** | Grammar points are tied to the unit that introduces them and explained in English (`data/grammar-a1.json`, e.g. `g-sein`), a real strength — but the phrases used to teach them are generic ("Ich heiße Sam"), not situational (a landlord conversation, a doctor's appointment). |
| Practical vocabulary | **2** | The deck is general-frequency vocabulary (`data/words-a1-1.json`), not curated around Anmeldung/WG/bank terms — that vocabulary exists only inside the unshipped `data/deferred/scenarios-survival.json` phrase lists. |
| Listening quality | **3** | Multiple real, working mechanisms (video, audio-only commute mode, dictation, slow news) — genuine breadth — but none scenario-targeted at the thesis's situations. |
| Speaking practice | **3** | Real recording + recognition (`src/lib/speech.ts`), minimal-pair drills, and an explicit no-fake-score design principle (a strength, `DEUTSCHMATE-SPEC.md §18`) — but no persona-constrained speaking practice (interviewer, landlord) is currently reachable. |
| AI usefulness | **3** | Genuinely constrained and purposeful (`src/lib/ai.ts`), matching thesis principle 10's letter closely — held back only by which personas/scenarios are live, which is a content-availability problem, not an AI-design problem. |
| Personalization | **0** | No goal, country, timeline, or self-reported context is captured anywhere. "Personalization" in the codebase means "your 3 most common mistakes" (`topErrorTags()`), which is real but orthogonal to the thesis's meaning of the word. |
| Mobile-first UX | **2** | PWA infrastructure exists (`public/manifest.webmanifest`, `public/sw.js`) and touch handling is real (`globals.css`), but the product's actual deployment scope this session was explicitly "localhost only, Mac only, for now," which is the opposite of mobile-first in practice. |
| Outcome-based progress | **3** | Can-do statements ahead of unit numbers is a genuine, tested strength (`SessionRecap.tsx`, `tests/curriculum.test.mts`) — undercut somewhat by XP/hearts now sharing the same screens. |
| Lean V1 discipline | **2** | The founding spec (`DEUTSCHMATE-SPEC.md`) is *unusually* disciplined about this and says so explicitly — the most recent development pass moved away from that discipline by adding gamification the spec explicitly rejected, and by building a full 6-level general curriculum before validating the one differentiated scenario pack that already existed. |
| Monetization readiness | **0** | Zero infrastructure of any kind — no plan table, no billing integration, no trial state, and an architecture (self-hosted, bring-your-own-API-key, SQLite file per install) that does not map onto a hosted subscription product without real re-architecture. |
| Analytics readiness | **0** | No analytics library, no event table, no `track()` call anywhere in the codebase. |

---

## 4. Generic App vs Differentiated Product

### What currently makes the product feel generic

**4.1 — The shipping A1.1 curriculum is a general beginner course, not a student-arrival course**
- **What exists:** 12 units teaching greetings, jobs, family, furniture shopping, an office scheduling scene, hobbies, cinema/free time, café ordering, airport travel, and a seasonal trip (`data/units-a1-1.json`).
- **Why it's strategically weak:** none of these are wrong to know, but none of them are *the* first things an international student needs (Anmeldung, opening a bank account, a WG viewing, understanding a university email). A learner can finish all of A1.1 today without ever seeing the word "Anmeldung."
- **Location:** `data/units-a1-1.json`, `data/curriculum-a1.json`.
- **Suggested change:** re-sequence or supplement A1.1 so at least 3–4 of the 12 units map directly onto the thesis's situations, using the vocabulary and phrasing already written for `/alltag`.
- **Priority: P0**

**4.2 — The most thesis-aligned feature exists and is switched off**
- **What exists:** `/alltag`, 12 scenarios named `surv-anmeldung`, `surv-wg`, `surv-arzt`, `surv-bank`, `surv-vertrag`, `surv-uni`, `surv-apotheke`, `surv-krankenkasse`, `surv-auslaenderbehoerde`, `surv-paket`, `surv-handwerker`, `surv-nebenkosten`, each with phrases, "what they'll say back" lines, a "what to bring" checklist, and a full AI/scripted roleplay via the shared `ScenarioRunner`.
- **Why it's strategically weak (in its current state):** it produces an empty page. `src/lib/survival.ts:41` reads `data/scenarios-survival.json`, which was relocated to `data/deferred/scenarios-survival.json` earlier this session as part of an unrelated "ship A1.1 only" scoping decision, because every survival scenario happens to be tagged A1.2 or later.
- **Location:** `src/lib/survival.ts:41`, `data/deferred/scenarios-survival.json`, `src/app/alltag/page.tsx:24-30` (empty-state copy).
- **Suggested change:** move the file back to `data/scenarios-survival.json` and add it back to whatever reads it (it's read directly by `survival.ts`, not through `seed.mts`, so this is a one-line, low-risk change). See §10 item 1.
- **Priority: P0**

**4.3 — Gamification without a stated learning-value connection**
- **What exists:** XP awarded per correct answer, hearts that gate new material, a header HUD (`src/lib/gamification.ts`, `src/components/HeartsAndXp.tsx`).
- **Why it's strategically weak:** the founding spec explicitly rejected this ("Cut, deliberately: XP · badges · achievements · leaderboards," `DEUTSCHMATE-SPEC.md:306-310`), reasoning that invented numbers dilute the product's "never fake progress" principle. XP is not a fake number in the sense that spec worried about (it's derived from real attempts), but it is exactly the kind of generic, could-belong-to-any-app signal the thesis's "Generic App" checklist calls out, and it now competes for visual attention with the can-do statements that *are* differentiated.
- **Location:** `src/lib/gamification.ts`, `src/components/HeartsAndXp.tsx`, `src/app/session/page.tsx`.
- **Suggested change:** either remove it, or re-frame it so XP/hearts are visibly subordinate to can-do capability messaging, and reconsider before adding more Duolingo-style mechanics (leagues, streaks-as-currency, etc.).
- **Priority: P1**

**4.4 — Visual identity modeled explicitly on Duolingo**
- **What exists:** the "Playful Pop" redesign (hot pink/teal/yellow, rounded Baloo 2/Nunito typefaces, pill buttons, a winding skill-path) applied this session, chosen for "Duolingo's energy."
- **Why it's strategically weak:** the thesis's first line is *"We are not building a generic Duolingo-style German-learning app."* A visual identity that reads as Duolingo's is the most visible possible signal of the opposite positioning, regardless of what the content underneath actually is.
- **Location:** `src/app/globals.css`, `src/components/SkillPath.tsx`.
- **Suggested change:** not necessarily reverted, but the visual identity question should be re-opened against the new thesis rather than assumed settled.
- **Priority: P2**

**4.5 — No student-specific onboarding or goal capture**
- **What exists:** username + password + recovery code, then a 6-step tour explaining app mechanics.
- **Why it's strategically weak:** the thesis's target user is specific (international student, A0–A1.1, moving to or newly in Germany) and the V1 checklist asks for "fast onboarding with student-specific goals." Nothing in the signup flow or `user` table captures this.
- **Location:** `src/app/anmelden/SignInForm.tsx`, `src/lib/schema.sql:179-222` (`user` table).
- **Suggested change:** add a single onboarding question (or a short set) that captures situation/timeline and use it to order the first sessions — this is in direct tension with the founding "one button, no decisions" principle, and that tension should be resolved explicitly (see §12), not by quietly adding a screen.
- **Priority: P0**

### What is genuinely differentiated already

- **The AI is already constrained correctly.** `converse()` in `src/lib/ai.ts` builds its system prompt from a fixed scenario and vocabulary whitelist, not open text — this is exactly what thesis principle 10 asks for and is rare to see already built.
- **Every scenario has a scripted, offline-safe fallback.** `data/units-a1-1.json`'s `dialogue` field and `data/deferred/scenarios-survival.json`'s `dialogue` field both ship a branching decision tree alongside the AI version, so a landlord roleplay works with no API key and no network. This is a real, non-trivial engineering strength directly relevant to a student who may not have German mobile data on day one.
- **Progress is honestly computed.** `mastery.ts`'s "complete vs. mastered" split, and the recap's refusal to show invented percentages, are a genuine point of trust-building differentiation from apps that show a fabricated "92% fluent" number.
- **The `/alltag` content itself**, where it exists, is well-written for the thesis: each scenario has a stated stake ("why this one matters," per `src/lib/survival.ts`'s `Survival.why` field), a "what to bring" checklist, and both sides of the conversation (what you say and what they say back) — this is the single best evidence in the repository that the team already knows how to build exactly what the thesis is asking for.

---

## 5. User Journey Audit

**Persona:** an international student from India, arriving in Berlin with near-zero German, needing daily life, university, accommodation, and eventually a working-student job.

| Stage | What actually happens (from the code) | Friction / gaps | Supports thesis? | Smallest useful improvement |
|---|---|---|---|---|
| 1. First visit & onboarding | Lands on `/`, redirected to `/anmelden` if not signed in (`src/lib/user.ts:50`, `requireUser()`); creates a username + password + writes down a recovery code; takes a 6-step English tour of app mechanics (`Tour.tsx`) | No question about who they are or why they're here. The tour explains *how the app works*, not *what it's for them specifically*. | No | Add one onboarding screen: "What's your situation?" with options like the thesis's own list, stored on `user`. |
| 2. Choosing a goal | Does not happen — by design. `currentUnit()` always returns unit 1 for a new account. | The founding spec explicitly forbids this step (principle 1). The thesis explicitly wants it. | No (actively designed against) | This is the central open question in §12, not a small fix. |
| 3. First lesson | Unit 1, "Ich heiße Miriam": a pronunciation primer, then greetings/name/origin vocabulary, a video, a quiz. No sentence-building/speaking/conversation yet (eased in this session). | Reasonable pedagogy, generic content. A student's actual first need (Anmeldung, WG search) is 11 units away and, as shipped, never arrives at all since A1.2+ is unseeded. | Partially | Swap unit 3 or 4 (currently furniture shopping) for a light Anmeldung/WG-adjacent unit using existing `/alltag` phrases. |
| 4. First useful real-life outcome | The unit's can-do list is real ("introduce yourself and ask someone's name," "say where you're from," "greet and say goodbye at any time of day" — `data/units-a1-1.json`) | These are genuinely useful, just not distinctively *for this student's actual week 1 in Berlin* (registering an address, finding a room). | Partially | — |
| 5. Returning the next day | Home shows "Heutige Sitzung," a fixed block sequence, a streak count if any, and (new this session) a banner if hearts ran out or pace was cut (`src/app/page.tsx`) | Functionally solid; the honesty principle here (banners explain *why*, not just *what*) is a real strength. | Neutral | — |
| 6. Reaching the end of A1.1 | 12 units, ~175 words, then `currentUnit()` returns `null` — the course stops (A1.2 is deferred). | A student who finishes A1.1 hits a hard wall with no path to their actual goal (working-student job interviews, deeper bureaucracy) since A1.2+ content is currently unseeded. | No | Ship `/alltag` regardless of A1.2 seeding status — it's independent content, not gated on level progression. |
| 7. Preparing for a real-world interaction | `/alltag` is the intended feature for this ("practice before you go") — currently shows "No scenarios loaded" / an explanation that the content is deferred (`src/app/alltag/page.tsx:24-30`). | This is the single worst dead end in the current experience relative to the thesis: the exact feature a student would open the night before an Anmeldung appointment is empty. | No | §10 item 1 — this is the fix with the best ratio of effort to strategic impact in this entire audit. |
| 8. Understanding progress | `/fortschritt` and `/weg` show units done, words mastered vs. seen, streak, and (new) XP/hearts | Mixed signal: can-do capability (thesis-aligned) sits next to XP/streak (generic) with no visual hierarchy favoring one over the other. | Partially | De-emphasize XP relative to can-do statements, or make can-do statements the primary progress artifact on `/fortschritt`. |
| 9. Encountering a paywall | Never happens. There is no paywall, trial, or subscription anywhere in the code. | Not a UX bug, but a business-model gap: nothing in the codebase would let this product make money from a market of students without new infrastructure. | Unknown from codebase whether monetization is even a near-term goal | See §6 and §9. |
| 10. Using the product on a phone | PWA manifest + service worker exist; `npm run dev:lan` allows LAN access; touch CSS is real | The product is not currently deployed anywhere reachable from a phone on cellular data — it runs on `localhost`/LAN only per this project's current operating scope. A student on a train has no way to open it unless someone hosts it. | No, in current deployment | Deploying a hosted instance is a business decision, not a code change this audit can score — flagged as Unknown in §12. |

---

## 6. V1 Must-Have Checklist

| Requirement | Status | Evidence | "Good enough for launch" | Smallest implementation | Priority |
|---|---|---|---|---|---|
| Fast onboarding with student-specific goals | **Missing** | `SignInForm.tsx` captures only username/password | One screen, 3–5 options, stored on `user`, used to pick the first unit or `/alltag` scenario | Add a `goal` column to `user`, one onboarding step, branch `currentUnit()`/home CTA on it | P0 |
| A clear A1.1 learning path | **Good** (mechanically) | `session-progression.ts`, `tests/curriculum.test.mts` | Already met | — | — |
| Practical lessons tied to German life | **Weak** | Units are general-topic (§4.1); the practical set exists but is unshipped (§4.2) | 3–4 of 12 A1.1 units and/or `/alltag` visibly reachable, on the thesis's situations | Re-seed `/alltag` (§10.1); consider one unit swap | P0 |
| Clear grammar explanations in English | **Good** | `data/grammar-a1.json` entries, e.g. `g-sein` | Already met | — | — |
| Useful vocabulary review | **Partial** | `/wortschatz`, FSRS via `src/lib/srs.ts` — general vocabulary, not situationally curated | Add a "Student Life" or "Bureaucracy" filter/topic once `/alltag` vocabulary is live | Tag `/alltag` phrase vocabulary with a topic and expose it in `/wortschatz` | P1 |
| Listening exercises with understandable audio | **Good** | `ListeningBlock.tsx`, `VideoBlock.tsx`, `/nachrichten` | Already met | — | — |
| At least one meaningful speaking mechanism | **Good** | `SpeakingBlock.tsx`, `src/lib/speech.ts`, `/aussprache` | Already met | — | — |
| Real-life Germany scenarios | **Weak** (built, not shipped) | `data/deferred/scenarios-survival.json` | Twelve scenarios reachable from `/alltag` with zero empty states | Re-seed (§10.1) | P0 |
| Progress based on practical capability | **Partial** | Can-do statements exist and are real; XP/hearts now share the screen | Can-do statements are the visually primary progress signal | Re-order `/fortschritt`/recap layout | P1 |
| Mobile responsiveness | **Partial** | PWA + touch CSS exist; not hosted anywhere reachable from a phone off-network | A deployed, phone-reachable instance | Business/infra decision, not a code fix | P1 (infra) |
| Event tracking for activation and retention | **Missing** | No analytics library or event table anywhere | Minimum schema in §8 wired to the 5–6 highest-value events | Add an `event` table + a `track()` helper called from the handful of key routes | P0 |
| A simple free-to-paid model | **Missing** | No plan/subscription concept in schema or code | Unknown from codebase whether this is even wanted for V1 (see §12) | Out of scope until product/business decision is made | Unknown |

---

## 7. What Should Not Be Built Yet

- **A full 6-level (A1.1–B1.2) curriculum.** The engine already supports it, and the founding spec was built around exactly this scope (`DEUTSCHMATE-SPEC.md §1, §4`). Building it out before the one differentiated, thesis-matching feature (`/alltag`) even ships is solving the wrong problem first. **Recommendation: defer further level content; A1.2–B1.2 are already parked in `data/deferred/` from this session's own work — leave them there until `/alltag` and a student-specific onboarding are validated.**
- **Further gamification (leagues, virtual currency, avatars).** None of this exists yet, which is correct — the thesis explicitly asks to avoid it (principle 9), and the founding spec independently arrived at the same conclusion before XP/hearts were added anyway. **Recommendation: do not add more; reconsider what's already there (§4.3).**
- **A general-purpose AI chatbot beyond the current constrained roleplay.** Does not exist today (`src/lib/ai.ts` is entirely task-specific) — this is correct and should stay this way.
- **Subscription tiers, billing, trials.** None exist. Building this before validating that students want the product at all (or before deciding this is even a commercial product — see §12) would be premature; the current self-hosted, BYO-API-key model is a reasonable placeholder for a pre-PMF stage.
- **A tutor marketplace, social community, or referral system.** None exist. No evidence in the codebase suggests demand for these; do not build them before the core scenario loop is proven.
- **City-specific expansion (Munich-specific bureaucracy, etc.).** Not present, and the current `/alltag` content is already Germany-general rather than Berlin-specific, which is the right level of abstraction for now.

**Dependencies/technical debt from what's already been built:** the gamification system (`src/lib/gamification.ts`, `user_stats` table) is now wired into `session-builder.ts`'s block-gating logic (hearts block new material). Removing or de-emphasizing it later is not free — it would require re-touching the same session-builder gating logic and the test suite that now covers it (`tests/mastery.test.mts`, `tests/progression.test.mts` indirectly). This is worth knowing before deciding whether to keep it.

---

## 8. Data and Analytics Audit

No analytics or event-tracking infrastructure exists anywhere in this codebase. Every row below is **Does not exist**.

| Event | Status | Implementation location | Recommended event name/properties | Priority |
|---|---|---|---|---|
| Landing page viewed | Does not exist | — | `landing_viewed {referrer}` | P1 |
| Signup started | Does not exist | `src/app/anmelden/SignInForm.tsx` has the form but no tracking call | `signup_started {}` | P0 |
| Signup completed | Does not exist | `src/app/api/auth/route.ts` handles the POST, no tracking | `signup_completed {user_id}` | P0 |
| Onboarding completed | Does not exist | No onboarding step exists yet at all | `onboarding_completed {goal}` (once §6 onboarding is built) | P0 |
| Goal selected | Does not exist | No goal concept exists | `goal_selected {goal}` | P0 |
| First lesson started | Does not exist | `src/app/api/session/route.ts` `GET` builds the plan, no tracking | `lesson_started {unit_id, block_kinds}` | P0 |
| First lesson completed | Does not exist | `src/app/api/session/route.ts` `POST` (`logSession`) is the natural hook | `lesson_completed {unit_id, minutes, blocks_done}` | P0 |
| First speaking attempt | Does not exist | `src/app/api/attempt/route.ts` handles all attempt kinds including `speaking` | `speaking_attempted {kind: "speaking"}` | P1 |
| First scenario completed | Does not exist | `src/app/api/chat/route.ts` (`action: "review"`) is the natural hook | `scenario_completed {scenario_id, source: "unit"|"alltag"}` | P0 |
| Day 1 return | Does not exist | `src/lib/session-log.ts` `currentStreak()` computes this but never emits an event | `day_n_return {n: 1}` derivable from `session_log` retroactively, but not tracked in real time | P1 |
| Day 7 return | Does not exist | Same table, same gap | `day_n_return {n: 7}` | P1 |
| Lesson-path completion | Does not exist | `unit_progress` table has the data; no event fires on completion | `unit_completed {unit_id, ord}` | P1 |
| Paywall shown | Does not exist | No paywall exists | N/A until a paywall is built | — |
| Trial started | Does not exist | No trial concept exists | N/A | — |
| Subscription started | Does not exist | No subscription concept exists | N/A | — |
| Subscription canceled | Does not exist | No subscription concept exists | N/A | — |
| Referral sent | Does not exist | No referral concept exists | N/A | — |
| Referral completed | Does not exist | No referral concept exists | N/A | — |
| Feedback submitted | Does not exist | `START-HERE.md` tells users to "tell Sid" directly — no in-app feedback mechanism | `feedback_submitted {text}` | P2 |

**Recommended minimum analytics schema for validating PMF:**
1. A single `event(id, user_id, name, props_json, created_at)` table in `schema.sql`'s PROGRESS half (it's per-user data, never shared).
2. A one-function `track(userId, name, props?)` helper in a new `src/lib/analytics.ts`, called from exactly the routes above (`/api/auth`, `/api/session`, `/api/attempt`, `/api/chat`).
3. At minimum, instrument: `signup_completed`, `goal_selected` (once it exists), `lesson_completed`, `scenario_completed`, and a derived daily-return count from `session_log` (already exists, just needs a dashboard query, not new tracking).
4. This does not require a third-party analytics vendor — the existing local-first, self-hosted architecture (`node:sqlite`) can hold this the same way it holds everything else, consistent with the codebase's own stated principles.

---

## 9. Technical Quality Risks

**P0 — can break the product or user trust**
- **The most differentiated content is silently empty, not erroring.** `src/app/alltag/page.tsx` renders a graceful "no scenarios" message rather than crashing (a deliberate design choice per `src/lib/survival.ts:47-50`'s comment, "missing or malformed content must not take a page down") — but graceful degradation of the product's best feature into invisibility is itself a trust risk if nobody notices it's off.
- **No environment variable validation for the AI key path is visible beyond `aiAvailable()`** (`src/lib/ai.ts:74`) — this appears to degrade gracefully (per the offline-first design principle), which is correct, but was not independently re-verified in this audit beyond reading the function.
- **No monetization or user-data-export path exists** — if this becomes a commercial product, GDPR obligations (the target market is students in Germany) around data export/deletion should be designed in before any paid launch, not retrofitted. **Unknown from codebase** whether this has been considered.

**P1 — should fix before meaningful user acquisition**
- **Zero analytics** means the team cannot currently measure activation, retention, or which of the two competing product visions (general course vs. scenario-first) is actually working, at all. This is the single highest-priority technical gap relative to the stated goal of "validating retention" (thesis principle 9).
- **Content authoring requires engineering skill.** Every unit, scenario, and vocabulary item is edited via hand-written JSON and run through TypeScript scripts (`scripts/*.mts`). There is no in-app content tool beyond `/admin/video`. This will bottleneck content iteration (especially producing more `/alltag`-style scenarios) on developer time.
- **The deployment model (`localhost`/LAN) is incompatible with real user acquisition.** A hosted, phone-reachable instance is a prerequisite for testing the thesis's "students learn while commuting" claim at all.

**P2 — can wait**
- **The visual redesign (Playful Pop) was done before the content strategy was settled**, meaning design work may need to be partially redone once the product decision in §12 is made — not urgent, but worth sequencing correctly next time.
- **Test coverage is extensive for mechanical correctness (39 test files) but validates zero product-strategy claims** — no test asserts "a new student can complete an Anmeldung scenario," because that scenario doesn't ship. This is a coverage gap worth naming even though it isn't a bug.

---

## 10. Recommended Prioritized Backlog

| Rank | Feature/fix | User problem solved | Strategic reason | Effort | Impact | Priority | Code areas | Approach |
|---|---|---|---|---|---|---|---|---|
| 1 | Re-seed the 12 `/alltag` survival scenarios | Student has no practical scenario to prepare for a real appointment | It's the single feature that already matches the thesis; it's currently off by accident of an unrelated scoping decision | S | High | P0 | `data/deferred/scenarios-survival.json` → back to `data/`, `src/lib/survival.ts` | Move the file back; verify `survivalById()`/`survivalScenarios()` resolve; smoke-test `/alltag` end to end |
| 2 | Add a one-question onboarding goal capture | Product doesn't know who the learner is or why | Directly required by thesis principle 1 and the V1 checklist; currently the biggest onboarding gap | S–M | High | P0 | `src/app/anmelden`, `src/lib/schema.sql` (`user` table), new onboarding step | Add `goal` column, one screen after signup, store and read it |
| 3 | Resolve the "one button, no decisions" vs. "goal-first" tension explicitly | Prevents building onboarding that contradicts the founding spec silently | This is a product-strategy decision, not a code task, and every subsequent onboarding decision depends on it | S (discussion) | High | P0 | `DEUTSCHMATE-SPEC.md` principle 1 vs. thesis principle 1 | Team decision, documented in the spec, before more onboarding work |
| 4 | Add minimum event tracking | Team cannot currently measure activation/retention at all | Directly blocks validating the thesis's own "lean V1, validate retention" principle | M | High | P0 | New `event` table, `src/lib/analytics.ts`, calls from `/api/auth`, `/api/session`, `/api/attempt`, `/api/chat` | Per §8's minimum schema |
| 5 | Swap 2–3 of the 12 A1.1 units for student-situation content | New A1.1 curriculum doesn't reflect the thesis at all right now | A1.1 is the only level currently shipping; it should carry the differentiation | M | High | P0 | `data/units-a1-1.json`, `data/curriculum-a1.json` | Reuse `/alltag`'s phrase content and can-do framing for 2–3 units (e.g. Anmeldung basics, WG search) |
| 6 | De-emphasize XP/hearts relative to can-do capability on progress screens | Progress currently mixes a genuine differentiator with a generic signal | Directly serves thesis principle 8 | S | Medium | P1 | `src/app/fortschritt/page.tsx`, `src/components/SessionRecap.tsx`, `src/app/session/page.tsx` (HUD placement) | Visual re-ordering, not a data-model change |
| 7 | Expose `/alltag` from the home screen, not only via `/ueben` | "Practice before a real interaction" is a headline use case, currently 2 clicks deep | Thesis principle 2 (practical outcomes) | S | Medium | P1 | `src/app/page.tsx` | Add a visible entry point once item 1 ships |
| 8 | Tag and surface student-life vocabulary in `/wortschatz` | Vocabulary review is generic today | Thesis principle "practical vocabulary" | S–M | Medium | P1 | `src/app/wortschatz/page.tsx`, `data/deferred/scenarios-survival.json` phrase extraction | Derive a topic tag from scenario phrases once they're live |
| 9 | Decide and document the monetization model (or explicitly defer it) | Nobody can build the right V1 without knowing if this is a commercial product | Thesis's own V1 checklist assumes "a simple free-to-paid model" exists | S (discussion) | High | P0 | Business decision; touches `src/lib/schema.sql`, deployment | Team decision — do not build billing speculatively |
| 10 | Deploy a hosted, phone-reachable instance | Mobile-first claim is unverifiable while the app is `localhost`-only | Thesis principle 7 | M | High | P1 | Deployment/infra, not application code | Vercel or similar, gated behind the goal-onboarding and re-seeded `/alltag` landing first |
| 11 | Add a lightweight in-app feedback capture | No product-quality signal exists beyond "tell Sid" | Supports lean-V1 learning loop | S | Medium | P1 | New route/component; `FRICTION.md`'s existing philosophy applies | A single "this was confusing" button on any screen, logged with context |
| 12 | Build a minimal content-authoring path for scenarios | Content iteration is currently developer-only | Unblocks producing more `/alltag`-style content quickly once demand is proven | M | Medium | P2 | `scripts/`, no in-app admin exists | A script or lightweight admin form specifically for scenario JSON, not a general CMS |
| 13 | Add day-1/day-7 return dashboards from existing `session_log` data | Retention is the metric the thesis explicitly asks to validate before adding features | Already-collected data, just needs a report | S | Medium | P1 | `src/lib/session-log.ts`, a new admin/reporting view | Query existing table; no schema change needed |
| 14 | Reconsider the Duolingo-inflected visual identity against the thesis | Visual identity is the most visible signal of positioning | Directly contradicts the thesis's opening sentence | S (discussion), M (rework) | Medium | P2 | `src/app/globals.css`, `src/components/SkillPath.tsx` | Revisit after the content/onboarding decisions above, not before |
| 15 | Add GDPR data export/delete for `user` | Legal risk for a product targeting students living in Germany | Table stakes for any EU-facing product, absent today | M | Medium | P1 | `src/lib/schema.sql`, new `/api/settings` capability | Standard export-then-delete flow |
| 16 | Explicitly reconcile gamification against the founding spec's rejection of it | Avoid building further on a contested decision | Prevents compounding technical debt on a feature whose strategic fit is unresolved | S (discussion) | Medium | P1 | `src/lib/gamification.ts` | Team decision: keep, simplify, or remove |
| 17 | Add a "prepare for X" quick-start flow from the home screen | Directly matches thesis principle 2's practical-outcomes framing | High-leverage, low-effort once `/alltag` ships | S | Medium | P2 | `src/app/page.tsx`, `/alltag` | A single CTA: "Practice for an appointment" linking straight into `/alltag` |
| 18 | Instrument AI cost per feature, not just per user | `DEUTSCHMATE_BUDGET` caps total spend but doesn't show which feature drives it | Relevant once `/alltag`'s AI roleplay is a headline feature, for cost planning | S | Low | P2 | `src/lib/config.ts`, `usage` table (already has `kind`) | Add a report grouping `usage` by `kind` |
| 19 | Write at least one test asserting a thesis scenario actually works end to end | 39 tests validate mechanics, zero validate the product thesis | Closes the coverage gap named in §9 | S | Low | P2 | `tests/` | A new test that completes an `/alltag` scenario and asserts real output |
| 20 | Revisit A1.2+ re-seeding timeline explicitly | Currently an implicit "later," with no stated trigger | Avoid drifting back into "build breadth before validating depth" | S (discussion) | Low | P2 | `data/deferred/README.md` | Add an explicit criterion (e.g., "after `/alltag` retention data exists") |

---

## 11. Recommended Next Sprint

**Maximum 5 tasks, 1–2 weeks.**

1. **Re-seed and ship `/alltag`'s 12 survival scenarios.**
   - *Acceptance criteria:* `/alltag` lists 12 scenarios with no empty state; each opens and completes (scripted-dialogue path, no API key required) without error; `tests/content.test.mts`'s "the six survival scenarios can be run without a network" section passes without the current SKIP.
   - *Files:* `data/deferred/scenarios-survival.json` → `data/scenarios-survival.json`; `src/lib/survival.ts`; `tests/content.test.mts`, `tests/scene.test.mts`.
   - *Metric improved:* first useful real-life outcome (§5 stage 4), practical-usefulness score (§3).
   - *Do not* also re-seed A1.2–B1.2 units/grammar/readings in the same pass — keep this change isolated to the scenario pack, which is independent of level progression.

2. **Add a single onboarding "what's your situation" step.**
   - *Acceptance criteria:* after signup, a new user answers one question (e.g. "moving soon" / "just arrived" / "settling in"); the answer is stored on `user`; the home screen's first CTA reflects it (e.g. points at `/alltag` for "just arrived").
   - *Files:* `src/lib/schema.sql`, `src/app/anmelden/SignInForm.tsx` or a new post-signup step, `src/app/page.tsx`.
   - *Metric improved:* activation (§5 stages 1–3), personalization score (§3).
   - *Do not* build a full multi-step goal wizard or a placement quiz in this sprint — one question, stored, read once.

3. **Instrument the five highest-value events.**
   - *Acceptance criteria:* `signup_completed`, `lesson_completed`, `scenario_completed` fire and are queryable from SQLite; a day-1/day-7 return count can be produced from existing `session_log` data.
   - *Files:* new `event` table in `src/lib/schema.sql`, new `src/lib/analytics.ts`, calls added to `/api/auth`, `/api/session`, `/api/chat`.
   - *Metric improved:* ability to learn from user behavior (§3, §8) — this sprint task is what makes every future prioritization decision evidence-based instead of guessed.
   - *Do not* integrate a third-party analytics vendor this sprint — the local table is sufficient to start.

4. **Add a visible entry point from home to `/alltag`.**
   - *Acceptance criteria:* the home screen (`src/app/page.tsx`) has a CTA (e.g. "Practice for a real appointment") that goes straight to `/alltag`, not buried inside `/ueben`.
   - *Files:* `src/app/page.tsx`.
   - *Metric improved:* practical usefulness, first-session activation.
   - *Do not* redesign the whole home screen in this sprint — one additional, clearly-labeled link.

5. **Re-order `/fortschritt` and the session recap so can-do statements lead, XP/hearts follow.**
   - *Acceptance criteria:* on `/fortschritt` and `SessionRecap.tsx`, the first thing a learner sees after a session is what they can now do, not their XP total.
   - *Files:* `src/app/fortschritt/page.tsx`, `src/components/SessionRecap.tsx`.
   - *Metric improved:* outcome-based progress score (§3); a proxy for whether the product *feels* differentiated rather than generic.
   - *Do not* remove XP/hearts in this sprint — that's the larger decision in backlog item 16, which needs a team conversation first, not a quiet code change.

**Explicitly out of scope for this sprint:** any A1.2+ content work, any billing/paywall work, any visual redesign work, any new AI feature beyond what already exists in `src/lib/ai.ts`.

---

## 12. Questions and Unknowns

**Product questions that cannot be answered from the repository:**
- Is this intended to become a commercial product at all, or does it remain the personal/small-group tool the founding spec describes? The thesis's monetization, paywall, and analytics asks only make sense if the answer has changed from what `DEUTSCHMATE-SPEC.md` and `DESIGN-BRIEF.md` state.
- How should the founding "one button, never make the user choose" principle coexist with the thesis's "choose a goal" onboarding requirement? These are not obviously reconcilable, and no document in the repo resolves the tension — it reads as an unresolved pivot in progress.
- Was the recent addition of gamification (XP/hearts) a deliberate reversal of the founding spec's explicit rejection of it, or an oversight? **Unknown from codebase** — no commit message or doc references the earlier decision.
- Is "international students moving to Germany" the *entire* target market, or a wedge into a broader general-learner product? This changes whether A1.2+ general content should ever be prioritized again.

**Assumptions that need user interviews or analytics:**
- Whether students actually want a curated "survival scenario" pack over a general grammar-first course — the codebase currently has evidence of *building* this (once) but zero evidence of *measuring* whether it worked, because no analytics exist.
- Whether the "one button, no decisions" flow is a strength or a source of drop-off for a self-directed, goal-driven student audience — currently unmeasurable.
- Whether gamification (XP/hearts) helps or hurts retention for this specific audience, versus the general-learner audience the founding spec was written for.

**Technical questions that need clarification:**
- Is a hosted, multi-tenant deployment planned, or does the self-hosted/BYO-key model remain the intended shape of the product? This single decision determines whether items like billing, referral, and analytics infrastructure are even the right thing to build, or whether they belong to a different product entirely.
- What triggers re-seeding A1.2 through B1.2 (currently in `data/deferred/`)? No explicit criterion exists (backlog item 20).

**Content-quality questions requiring a German teacher or curriculum expert:**
- Whether the current A1.1 sequencing (Momente-based) is pedagogically appropriate to interleave with the `/alltag` survival content, or whether they need a genuinely re-thought combined syllabus rather than a unit swap.
- Whether the `/alltag` scenarios' language level (currently tagged A1.2 and above) is accurate, or whether they could be simplified to be reachable earlier — this matters a great deal given the audit's #1 recommendation is to ship them, and they are currently gated at a level this product doesn't yet serve.
- Whether twelve scenarios are the right *set* for the stated persona (an Indian student in Berlin) — `FRICTION.md` itself already flags three more as "waiting for evidence": Kita-Platz, Steuererklärung, Jobcenter, none of which fit a first-90-days student use case as well as, say, a **student visa/residence permit appointment**, a **course registration (Prüfungsamt)** scenario, or a **working-student job interview** — none of which currently exist anywhere in the codebase, deferred or otherwise.

---

*End of audit.*
