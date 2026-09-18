# Desktop UX Verification Report

## 1. Verification Environment

- **Browser:** Google Chrome 153.0.8010.50, headless (`--headless=new`), driven directly over the Chrome DevTools Protocol (raw WebSocket + CDP commands from a small Node script — no Playwright/Puppeteer dependency was added to the project; the driver lives outside the repo, in the session's scratch directory).
- **Viewport sizes tested:**
  - 1280 × 800 (primary — most flows driven here)
  - 1440 × 900
  - 1536 × 864
  - 1024 × 768
  - 768, 390, 375 wide (responsive safety checks only, per the brief)
- **Operating system:** macOS (Darwin), Chrome running natively, not emulated.
- **AI API-key state:** No Anthropic key configured for any test account. `POST /api/chat` was confirmed to return `{"offline":true,"reason":"no-api-key"}`, which is what forces every conversation into the scripted fallback — this is the actual condition under which the whole app was exercised.
- **Test-user setup:** Real accounts created through the real sign-up form (not seeded directly), e.g. `browserqa1`, `speakqa1`. One account was advanced past unit 1 via a direct `unit_progress` row (`status='complete'` for `a1-1-u01`) so the "easeIn" first-day simplification wouldn't suppress the Builder/Speaking/Conversation blocks — everything else (signup, onboarding, hearts, XP, cards, session plan) went through the real app, not a shortcut. All test accounts and their rows (`attempt`, `event`, `card`, `session_log`, `unit_progress`, `user_stats`, `user`) were deleted after verification.
- **Microphone:** Chrome was launched with `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`, which auto-grants microphone permission and feeds a silent synthetic audio device. This verifies the UI states (idle → listening → timeout) faithfully, but it **cannot** show what the real, first-time "This site wants to use your microphone" browser permission prompt looks like, nor test an actual denied-permission click. That one specific moment is flagged as unverified in §4 and §7.
- **Unavailable testing capability:** No real hardware microphone/human speech was used (see above). No screen reader (VoiceOver/NVDA) was run — accessibility findings below are from computed styles, DOM structure, and programmatic label association, not from an actual assistive-technology pass. No visual regression tool — all layout claims are from the actual rendered screenshots taken during this session, individually inspected.

## 2. Core Flow Results

| Flow | Result | Evidence | Severity |
|---|---|---|---|
| Signup | Pass | Real form (username + password) completed via the browser at 1280×800; landed on the first-run tour as expected. | — |
| Situation onboarding | Pass (1 bug found & fixed) | Reached via the tour's last step; all 6 options render; picking "I just arrived in Germany" persisted (`GET /api/session` returned `situation: "just_arrived"`) and correctly redirected home. Bug: the tour's Next/Back bar was clipped off-screen on two of the four required viewports before a fix (see §6). | P1 (fixed) |
| Home-page paths | Pass | Both paths visible without scrolling at every tested desktop width: the primary pink "Heutige Sitzung" CTA and, directly below it, the new secondary "German for real life" card, personalized to "You're here now — practice the conversations you'll have this week." for the `just_arrived` situation. No XP/streak clutter on this screen. | — |
| A1.1 course (session) | Pass | Drove a real session (`/session?tag=0`, plan: Aufwärmen → Fix → Hören → Sätze bauen → Sprechen → Gespräch → Quiz) end-to-end via real keyboard/mouse interaction to the recap screen. Card review, dictation/listening, and sentence-building all render and grade correctly at 1280×800. | — |
| Alltag page | Pass | All 12 restored survival scenarios render (Anmeldung, WG, Arzt, Bank, Vertrag, Uni, Apotheke, Krankenkasse, Ausländerbehörde, Paket, Handwerker, Nebenkosten) — none of this session's work, just confirming the app the last task shipped still renders correctly at desktop widths. | — |
| Anmeldung scenario | Pass | Scripted fallback banner shown immediately (no key). Completed the full 5-turn scripted dialogue via real mouse clicks and via real keyboard digit-key presses (tested both). Reached "Gespräch beendet." | — |
| WG scenario | Pass | Same as above; side-by-side German/English phrase lists ("Das sagst du" / "Das hörst du") render correctly. | — |
| University / bank scenario | Pass | `surv-uni` ("Im Prüfungsamt") and `surv-bank` ("Konto eröffnen") both load, show the scripted-fallback banner, and render their phrase lists and "Mitbringen" checklist. | — |
| Scripted fallback (no AI key) | Pass | Verified at the API level (`/api/chat` → `offline:true`) and in the UI (every conversation opened straight into "Offline-Variante — vorbereiteter Dialog" instead of hanging or erroring). | — |
| Speaking / microphone interaction | Pass (1 clarity bug found & fixed) | Reached the real Speaking block in a live session. Mic button: idle → click (mouse) → visibly "listening" (label changes to "Sprich jetzt…", button disabled) → after ~8s of silence, a plain-language failure message ("Nichts gehört. · Nothing was recognised. Try again?"), never a fabricated score. Bug: the listening-state color change was invisible because two design-system colors are identical (see §6). | P1 (fixed) |
| Scenario completion / return navigation | Pass (1 bug found & fixed) | Completing an Alltag scenario and pressing "Zurück" landed on `/ueben` instead of back on `/alltag` — a real return-navigation break for the one flow this task named explicitly. Fixed (see §6); course-unit roleplay's return-to-`/ueben` behavior is unchanged. | P1 (fixed) |
| Progress / recap | Pass | Reached the real end-of-session recap. Can-do checkmarks lead the screen; the numeric stat grid (minutes, new words, reviews, accuracy) follows; a single small "★ XP total" line comes last. Confirms the intended "capability before XP" hierarchy renders as built. | — |
| Analytics event creation | Pass | Verified against the live database, not just code: `signup_completed`, `scenario_started` (both `surv-anmeldung` and `surv-wg`), and prior events all landed as real rows during this session's own driving of the app. | — |

## 3. Desktop Layout Findings

- **Information hierarchy:** the home screen leads with "Heute lernst du" (today's can-do statements), then the single session CTA, then the secondary Alltag card — no stat grid, no leaderboard, nothing that reads as a generic analytics dashboard. This matches the intended product experience directly.
- **Use of horizontal space:** at 1440–1536px the centered content column leaves large empty margins on both sides. This reads as a deliberate, calm restraint (explicitly asked for: "should not feel like a generic dashboard... do not make the interface crowded") rather than a bug — nothing looks broken or unfinished, just spacious. Worth a note, not a fix.
- **Navigation:** a persistent top header (logo, Home / Wortschatz / Üben / Fortschritt) is present on every authenticated page and never overlaps content at any tested width.
- **Lesson readability:** German vocabulary is rendered large (26–52px serif) with English glosses directly beneath in a smaller, muted weight — good contrast of *size*, not just color, between the language being learned and its explanation. Long compound nouns and umlauts (`Wohnungsgeberbestätigung`, `Aufenthaltstitel`, `Ausländerbehörde`) were not clipped or overflowed at any tested width, including 375px.
- **Scenario / dialogue layout:** the Alltag detail page correctly puts "Das sagst du" (what you say) and "Das hörst du" (what they say back) side by side with English translations, exactly the "side-by-side German and English" pattern the brief asked to check for.
- **Audio and speaking controls:** "vorhören" (pre-listen) and the mic button are both large, clearly labeled, and keyboard-reachable (`R` to replay, `Enter` to start listening). See §6 for the one real bug found here.
- **Progress visibility:** confirmed live on the recap screen (see §2); `/fortschritt` (not re-verified pixel-by-pixel in this pass, but unchanged since the last commit) already leads with "Was kannst du?" ahead of any XP.
- **Error and loading states:** the home page's skeleton loader matches the eventual layout's proportions (no layout jump). A `?tag=` network hiccup already has a distinct "Tagesplan nicht geladen — lokal weiter" banner with a retry button (pre-existing, not re-broken).
- **Empty states:** `/alltag`'s empty-state copy was corrected in the prior task (no longer claims a now-false "A1.1 only" reason) and is not currently reachable in the shipped state (12 scenarios always load) — this was verified logically, not by artificially deleting the data file to check the exact wording renders since that file is real shipped content and deleting it even temporarily was judged an unnecessary risk to a live server directory.

## 4. Keyboard and Accessibility Findings

- **Keyboard navigation:** `Tab` from the home page moves through the logo, all four nav links, the primary session CTA, the shorter-session link, and the new "German for real life" card, in that exact visual order — no keyboard traps, nothing skipped.
- **Visible focus states:** every one of the above showed a clear solid 2px pink outline when reached by a genuine `Tab` key press. (An earlier check using a scripted `element.focus()` call showed no outline — this turned out to be Chrome's own `:focus-visible` heuristic correctly treating a programmatic focus differently from a keyboard-driven one, not a product bug. Re-tested with real `Tab` key events and confirmed the outline is there.)
- **Form labels:** `Benutzername`/`Passwort`/`Wiederherstellungscode` on the sign-in/register form were plain `<label>` text with no `for`/`id` link to their `<input>`s — a screen reader would not announce the field's purpose on focus. **Fixed** (see §6).
- **Button labels:** the Speaking block's 🎤 button had no `aria-label` (relying on the emoji alone). **Fixed** (see §6). The equivalent hands-free mic button in the Conversation block already had one (`aria-label={listening ? "Hört zu" : "Sprechen"}`) — used the same pattern.
- **Tab order:** logical everywhere checked (header → primary content → secondary actions), including on the willkommen/tour screen after the sticky-footer fix.
- **Microphone permission messaging:** `lib/speech.ts`'s `micProblem()` already maps seven distinct failure codes (`not-allowed`, `audio-capture`, `network`, `insecure-context`, `unsupported`, `timeout`, `already-running`) to plain bilingual sentences that say what actually happened and what to do about it — this is unusually good, and nothing here needed changing.
- **Color contrast:** computed against the actual rendered styles, the primary CTA button (`bg-accent` fill, `text-accent-fg` text — used on essentially every primary button across the app) measures **2.84:1**, below WCAG AA's 4.5:1 requirement for normal text. This is a design-system-wide color choice (the same pair appears in on the order of 48 files per the prior session's own redesign work), not a local bug, so it was **documented, not changed**, in line with "only make targeted fixes." See §7.
- **Screen-reader-friendly labels:** spot-checked, not exhaustively audited with an actual screen reader. The two gaps found (form labels, mic button) are fixed; no time remained to run a full VoiceOver pass across every screen, which is named as a limitation rather than claimed as done.

## 5. Responsive Safety Check

Checked at 768px, 390px, and 375px on the home page, `/alltag`, an Alltag scenario detail page, and the first-run tour:

- **Horizontal scrolling:** none found at any of the three widths on any of the four pages (`document.documentElement.scrollWidth` never exceeded `window.innerWidth`).
- **Unusably small buttons:** none that block a real task. Two pre-existing, non-blocking small tap targets were noted for the record: the tour's step-progress dots (a 4px-tall clickable rail) and the top-nav links (~20px tall hit area). Both are fully usable with a mouse (the primary audience) and not part of any change made in this pass — logged as P2, not fixed, per the brief's explicit de-prioritization of mobile polish.
- **Clipped text:** none found, including long compound nouns and umlaut-heavy words at 375px.
- **Broken modal/dialog behavior:** no modal dialogs exist in the flows tested; the closest analogue (the session's "resume where you left off?" and block-intro doorway screens) rendered and dismissed correctly at every width checked.
- **Inaccessible navigation:** the top nav remains reachable and fully functional at all three widths.
- **Content hidden behind fixed elements:** none found. The one place a fixed/sticky element was *added* in this pass (the tour's sticky footer, see §6) was specifically checked at 375px and does not cover any interactive content there either.

## 6. Bugs Fixed

**1. First-run tour's primary navigation was clipped below the fold at two of the four required desktop viewports**
- **User problem:** on a 1280×800 or 1024×768 laptop — both explicitly named target viewports — the tour's first step (four paragraphs of body copy plus a sidebar) pushed the "Next" button below the visible viewport, with no visual cue that scrolling would reveal it. In an app whose entire onboarding pitch is "press Enter, that's the whole daily decision," the one button was invisible.
- **Root cause:** the footer nav bar (`Back` / step counter / `Next`) was laid out in normal document flow at the bottom of a content block whose height varies per step; on the taller steps it landed past the viewport's bottom edge on shorter screens.
- **File changed:** `src/app/willkommen/Tour.tsx`
- **Fix:** made the footer nav `sticky bottom-0` with an opaque background, so it is always pinned to the visible viewport regardless of how long any given step's content is (present and future). Moved the "Skip" link inside this same sticky bar (it was a separate block below the footer, which would have scrolled out from under the now-pinned bar and become unreachable).
- **Verification:** re-measured programmatically — the `Next` button's bounding box is now fully inside the viewport (`visible: true`) at 1280×800, 1440×900, 1536×864, and 1024×768, versus `visible: false` at the first and last of those before the fix. Re-screenshotted and visually confirmed.

**2. Completing an Alltag scenario returned to the wrong page**
- **User problem:** after finishing e.g. the Anmeldung roleplay from `/alltag`, pressing "Zurück" landed on `/ueben` (the general practice hub) instead of back on `/alltag` where the user actually came from — breaking the "browse Alltag → practice a scenario → back to Alltag" loop this task named as a core flow to verify.
- **Root cause:** `ScenarioRunner`'s "Zurück" button was hardcoded to `router.push("/ueben")`, written when the component only had one caller (a course unit's own roleplay, reached from `/ueben`).
- **Files changed:** `src/app/szenario/[id]/ScenarioRunner.tsx`, `src/app/alltag/[id]/page.tsx`
- **Fix:** added an optional `backHref` prop (defaulting to `/ueben`, preserving the existing course-unit behavior exactly) and passed `backHref="/alltag"` from the Alltag detail page.
- **Verification:** re-ran the full scripted Anmeldung conversation to completion and confirmed "Zurück" now lands on `/alltag`; separately re-ran a course unit's own conversation (`/szenario/a1-1-u01`) and confirmed its "Zurück" still lands on `/ueben`, unchanged.

**3. The Speaking block's "listening" indicator was invisible**
- **User problem:** while recording, the mic button was supposed to change color to signal "you're being recorded" — but it didn't visibly change at all, so the only signal that recording had started was a small line of text below the button.
- **Root cause:** the "listening" state uses `bg-das` and the idle state uses `bg-accent`; both design-system tokens resolve to the identical hex value `#ff5d8f`. The code's intent (a color change) was correct; the color values it referenced happened to collide.
- **Files changed:** `src/app/globals.css` (new `.dm-rec` utility, reusing the existing `dm-pulse` keyframe already used for skeleton loaders), `src/components/blocks/SpeakingBlock.tsx`
- **Fix:** the listening state now also gets a pulsing animation, which reads as "active" through motion rather than relying on a color difference that doesn't exist. Respects the site-wide `prefers-reduced-motion` override already in place.
- **Verification:** screenshotted idle vs. listening states; confirmed via computed styles that the button is `disabled` and shows the pulse class while listening, and that after Chrome's fake silent microphone times out (~8s), the UI shows "Nichts gehört. · Nothing was recognised. Try again?" rather than hanging or erroring.

**4. Sign-in/registration form fields had no programmatic label**
- **User problem:** a screen reader user tabbing into the username or password field would not hear "Benutzername" / "Passwort" announced — the label was only visually adjacent, not linked.
- **Root cause:** `<label>` elements with no `htmlFor`, `<input>` elements with no matching `id`.
- **File changed:** `src/app/anmelden/SignInForm.tsx`
- **Fix:** added `id`/`htmlFor` pairs for all three fields (username, password, recovery code).
- **Verification:** re-queried the DOM after the fix; every input now resolves a matching `label[for=...]`.

**5. Speaking block's mic button had no accessible name**
- **File changed:** `src/components/blocks/SpeakingBlock.tsx`
- **Fix:** added `aria-label={listening ? "Hört zu" : "Sprechen"}`, matching the pattern already used by the equivalent button in the Conversation block's voice mode.

All five fixes were verified with `tsc --noEmit`, `eslint`, `npm run build`, and the full existing test suite (`node tests/run.mts` — 41/41 passed, unchanged) after the changes.

## 7. Remaining Issues

**P0:** None found.

**P1 (documented, not fixed in this pass):**
- The app-wide primary-button color pair (`bg-accent` / `text-accent-fg`) measures 2.84:1 contrast, below WCAG AA's 4.5:1 for normal text. Fixing this properly means adjusting a brand color used across roughly 48 files and would change the app's visual identity — a design decision beyond the scope of a "targeted fixes" verification pass. Flagged for a deliberate follow-up decision rather than changed unilaterally.
- The real, first-time browser microphone-permission prompt (and a genuinely *denied* permission, as opposed to a silent fake device) was not observed directly — headless Chrome with `--use-fake-ui-for-media-stream` auto-grants it. This is the single most important thing to check with a real human on a real laptop before a pilot.

**P2 (noted, not fixed):**
- Tour progress-dot buttons are a 4px-tall clickable rail — fine with a mouse, tight for a fingertip. Pre-existing, not part of this pass's scope (mobile is explicitly de-prioritized).
- Top-nav links have a modest (~20px) vertical hit area. Pre-existing, fully usable with a pointer.
- Opening any scenario/conversation page auto-scrolls the whole page down slightly on load (the chat log's own `scrollIntoView` call pulls more than just its own scroll container). Mildly disorienting, not a broken flow.
- Large unused horizontal margins at 1440–1536px widths — read as deliberate calm restraint given the product's explicit "not a generic dashboard" goal, not a defect, but worth a second opinion once real users are looking at it on their own big monitors.

**Product questions (for the team, not this task):**
- Is the 2.84:1 accent-button contrast an acceptable trade-off for the current "Playful Pop" branding, or should the accent color be darkened before a wider pilot?
- Should Alltag's return-to-`/alltag` behavior (this task's fix) also change the shorter-session "Kürzere Sitzung" escape valve's destination, or is landing on the home screen there still correct? (Not touched in this pass — out of scope, flagging only because the same "where does this button actually go" question applies.)

## 8. Launch Readiness

**Ready for small desktop/laptop pilot.**

No P0s were found. The three P1s that were genuinely fixable within this pass's scope (tour navigation clipped on two named viewports, Alltag return-navigation going to the wrong page, and the Speaking block's invisible recording indicator) are fixed and verified. The one P1 left open (button contrast) is a visible, known, documented trade-off rather than a hidden defect, and doesn't block a small pilot with sighted users on normal displays — it should be resolved before a wider or accessibility-focused rollout. The one verification gap (a real browser's actual microphone permission prompt) is exactly the kind of thing a small human pilot will surface immediately and cheaply, which is the recommended next step below.

## 9. Recommended Next Step

Run a small, moderated pilot with 3–5 international students (the actual target user), each on their own laptop or desktop, doing the following in one sitting with no help:

1. Sign up, go through onboarding, and pick the situation that best matches them.
2. From the home screen, choose *either* "Heutige Sitzung" or "German for real life" — do not tell them which; watch which one they pick and why.
3. Complete one Alltag scenario relevant to their actual situation (e.g. Anmeldung for someone who just arrived).
4. Try the microphone at least once, on their own machine, with their own browser permission prompt — this is exactly the moment that could not be verified in this pass.

Watch for, specifically: whether they ever look confused about what to do next (the tour-clipping bug's category of problem), whether the "German for real life" card actually gets chosen or gets ignored in favor of the course, and whether the real (non-fake) microphone permission prompt and first recording attempt go smoothly. A five-person pilot where at least four complete steps 1–3 without asking for help, and where the microphone works for at least three of them on the first real attempt, would be a reasonable bar for moving from "small pilot" to "wider rollout."

## 10. Post-Verification Follow-Up

Two small, targeted items after this report's first draft, no new findings:

1. **Microphone permission-denied messaging** — checked against the request to "add or verify an explicit error state." It already existed and was already correct: `lib/speech.ts`'s `micProblem()` maps `not-allowed`/`service-not-allowed` to *"Mikrofon nicht erlaubt. · Microphone blocked. Allow it for this site — and if the setting already says allowed, the block is coming from the operating system or a workplace policy rather than the browser,"* rendered directly beneath the mic button in `SpeakingBlock.tsx` (`{error && (...)}`, right after the mic button in source order). Bilingual, names the problem, says what to do, never invents a score. Per the standing instruction not to change behavior that already exists and already works, **nothing was changed here**. What was added: `tests/mic-permission.test.mts`, a new permanent test that pins this behavior — it checks every failure code gets its own distinct, non-generic message (the exact regression this function's own doc comment says it once had), that the permission-denied codes are bilingual and mention enabling/allowing the microphone, that no message contains a fabricated score, and that the error line renders after the mic button in the component's source (a structural proxy for "near the control," not a full render). All 21 checks pass.
   - **What this does not claim:** no real microphone was denied by an actual person in an actual browser permission dialog in this step — that remains the gap named in §7 and §9, unchanged.
2. **Accessibility documentation** — added a short "Accessibility" section to `README.md` stating the ~2.84:1 primary-button contrast, that it falls below WCAG AA for normal text, and that it is a deliberate, undecided trade-off to revisit before a wider rollout, not an oversight. The color itself was not touched.

Full regression after both changes: `tsc --noEmit` clean, `eslint` clean, `npm run build` succeeds, and the full test suite is **42/42 passing** (41 from the original pass, plus the new `mic-permission.test.mts`).
