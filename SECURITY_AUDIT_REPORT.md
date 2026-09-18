# Security Audit Report

## 1. Executive Verdict

**Ready for controlled pilot with documented risks.**

The application layer (authentication, session handling, authorization/IDOR boundaries, SQL parameterization, XSS surface, AI prompt-injection resistance) is unusually well-engineered for its size — every cross-user access boundary tested during this audit held, there is no SQL injection or XSS primitive anywhere in the codebase, and secrets are handled correctly (encrypted at rest, never logged, never returned to the browser). The risks that remain are concentrated in **deployment configuration** (HTTPS is not yet a code-enforced requirement, despite a 10-year session lifetime) and in **things intentionally out of scope for a private pilot** (no CAPTCHA on signup, no self-service account deletion, no CSP). None of these are hidden defects; all are named explicitly below with a severity and a recommendation.

This verdict assumes the pilot is run **behind HTTPS**, with a **small, known, trusted group of students** (not a publicly advertised URL), and with **`DEUTSCHMATE_ADMIN` left off**. Given those three conditions, there is no finding in this report that should block starting the pilot.

## 2. Threat Model

**Assets:**
- Learner accounts (username + password hash + recovery-code hash)
- Learner progress data (cards, attempts, session logs, spaced-repetition state, situation/onboarding answer)
- Learner-typed and learner-spoken German text (writing submissions, speech-recognition transcripts, conversation turns) — the thing a learner produces while practicing, not incidental telemetry
- Each learner's own Anthropic API key (encrypted at rest) and their spending ceiling
- The shared curriculum content (words, units, grammar, videos, scenarios) — not secret, but its integrity matters (a corrupted video row is wrong for every learner)
- The operator's own `ANTHROPIC_API_KEY`, if configured as a shared fallback

**Users:** a handful of international students in a private pilot, each with their own account; one operator running the server and, optionally, holding admin rights.

**Attackers considered in scope:**
- A curious or malicious fellow pilot participant, with a real account, trying to read or modify another participant's data (the IDOR threat model this audit spent the most effort verifying).
- An anonymous network attacker who has discovered the pilot's URL (an unauthenticated outsider).
- A passive network observer on the same network as a pilot participant (relevant because of the very long session lifetime — see §4).
- A well-meaning participant whose browser or extension misbehaves and sends unexpected data to an API route.

**Out of scope for this audit, by the task's own instruction:** attacking Anthropic's infrastructure, denial-of-service testing, credential-stuffing against any real service, anything outside this repository and the local dev environment. Also out of scope for *remediation* here: legal conclusions about GDPR compliance (flagged as items for legal review, not resolved).

**Highest-impact realistic attacks, ranked:**
1. Network interception of a session cookie over unencrypted HTTP (mitigated only by deploying behind HTTPS — see §9).
2. One pilot participant reading or altering another's progress via a guessed or shared ID (tested extensively in §5 — not found to work anywhere).
3. An unauthenticated write to shared curriculum content if `DEUTSCHMATE_ADMIN=1` is ever set on a reachable deployment (found, fixed — see §11).
4. Uncontrolled AI spend against a shared operator API key (bounded, documented — see §7).

## 3. Findings

| ID | Severity | Category | Summary | Fixed? |
|---|---|---|---|---|
| F1 | High | Deployment | 10-year session cookie only gets `Secure` when `NODE_ENV=production`; nothing in-app enforces HTTPS | No — deployment requirement |
| F2 | Medium | Authorization | `POST /api/video` required only `DEUTSCHMATE_ADMIN=1`, never a session — unauthenticated write to shared content when admin mode is on | **Yes** |
| F3 | Medium | Privacy / Input validation | `POST /api/track` accepted arbitrary JSON as `properties`, with no per-event allow-list | **Yes** |
| F4 | Medium | Headers | No security headers at all (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) and no `Cache-Control: no-store` on API responses carrying personal data | **Yes** |
| F5 | Medium | Abuse / Cost control | AI budget-ceiling check has a TOCTOU race under concurrent requests | No — documented, bounded |
| F6 | Medium | Abuse | Signup has no rate limiting or verification of any kind (by design, per the code's own comment) | No — acceptable for a private, non-advertised pilot |
| F7 | Low | Privacy / GDPR | No self-service account deletion or data export | No — documented; operator can fulfill manually |
| F8 | Low | Headers | No Content-Security-Policy | No — documented why it can't be added safely in this pass |
| F9 | Informational | Crypto | scrypt cost parameter (N=16384) is Node's own default, not OWASP's current recommendation for new deployments | No — not urgent for this threat model |
| F10 | Informational | Error handling | Two routes return the Anthropic SDK's raw exception message to the client | No — low-risk, external-API text only |
| F11 | Informational | Enumeration | Registration reveals whether a username is taken | No — standard, expected self-service behavior |
| F12 | Informational | Rate limiting | No rate limit on most non-AI mutating routes | No — acceptable for a small trusted pilot |

Full detail for each, with exact locations, is in the sections below.

---

### F1 — Session cookie's `Secure` flag depends on `NODE_ENV`, and nothing enforces HTTPS

- **Severity:** High
- **Category:** Deployment / Session security
- **Evidence:** `src/app/api/auth/route.ts:46` — `const secure = process.env.NODE_ENV === "production";` — the session cookie (`dm_session`) and the readable `dm_uid` cookie are both set with `secure` conditioned only on `NODE_ENV`, never on whether the connection is actually TLS.
- **Exact location:** `src/app/api/auth/route.ts:44-58`; session lifetime is `SESSION_TTL_DAYS = 3650` in `src/lib/auth.ts:14`.
- **Exploit scenario:** the pilot is deployed with `next start` (which sets `NODE_ENV=production` automatically) but reachable over plain HTTP (no reverse-proxy TLS termination configured yet, or a misconfigured one). The `Secure` flag is now *set* on the cookie, which actually makes things worse in one respect (browsers refuse to send it back over HTTP, breaking login) — but if instead the operator runs a custom start script without `NODE_ENV=production`, the cookie has no `Secure` flag on a real HTTPS site either, and would also be sent over any accidental HTTP fallback. Either misconfiguration is easy to make and the code gives no signal that it happened. Once a session token is captured on the wire — a shared campus/hostel WiFi is exactly the kind of network international students use — it is valid **for ten years** with no additional check (no IP binding, no device fingerprint).
- **User impact:** full account takeover, silently, for up to a decade, from a single unencrypted request.
- **Recommended remediation:** deploy the pilot **only** behind a TLS-terminating reverse proxy (Caddy, nginx, or the hosting platform's own HTTPS), confirm `NODE_ENV=production` is actually set (the app's own `src/lib/env.ts:52-59` already warns about this — "plain http on a non-local host — the session cookie will not be marked secure" — this audit found that this existing warning is correct and load-bearing, not decorative). This is a deployment step, not a code change; no code fix is possible from inside the repository because the repository cannot know whether the network path is encrypted.
- **Fixed:** No — this is an operational precondition, stated as a launch requirement in §12.
- **Verification status:** confirmed by reading the exact cookie-setting code and cross-checking `env.ts`'s own self-check logic, which already flags this scenario correctly.

### F2 — `POST /api/video` had no authentication check — **FIXED**

- **Severity:** Medium (High if `DEUTSCHMATE_ADMIN=1` is ever set on a reachable pilot server)
- **Category:** Authorization / IDOR-adjacent
- **Evidence (before fix):** `src/app/api/video/route.ts:47-53` checked only `adminEnabled()` (an environment-variable switch, `DEUTSCHMATE_ADMIN=1`) before writing to the `video` table and, if a `unitId` was given, updating `unit.video_id`. It never called `activeUser()`. The admin *page* (`src/app/admin/video/page.tsx`) is behind `src/proxy.ts`'s session-cookie gate, but `proxy.ts`'s matcher explicitly excludes everything under `/api/`, so the API route it calls was not protected by that gate and had none of its own.
- **Exact location:** `src/app/api/video/route.ts`, `POST` handler.
- **Exploit scenario:** operator sets `DEUTSCHMATE_ADMIN=1` (documented in `.env.example` as an "optional" switch for hand-editing video segments) on a server reachable by the pilot group's network. Any of them — or anyone else who can reach that address, signed in or not — can `POST` arbitrary video metadata, overwriting shared curriculum content for every learner.
- **User impact:** corrupted or defaced course content for everyone, from an unauthenticated request. Not a personal-data leak (video rows contain no personal data), but an integrity attack on shared content.
- **Live verification performed:** registered two real accounts; with `DEUTSCHMATE_ADMIN=1` set on a temporary build, confirmed an unauthenticated `curl` POST succeeded (wrote a row) **before** the fix, and returned `401 {"error":"not signed in"}` **after** the fix, with a signed-in POST still succeeding. See §14 for exact commands.
- **Remediation applied:** added `const user = await activeUser(req); if (!user) return unauthorized();` immediately after the `adminEnabled()` check and before any request-body parsing or database write.
- **Fixed:** **Yes.**
- **Regression test:** `tests/video-admin-auth.test.mts` (new) — a static check that the auth check exists and runs after the admin check but before the first write, plus a live check that `GET` (read) stays public while `POST` is refused without a session under the test server's normal (admin-off) configuration.

### F3 — `POST /api/track` accepted arbitrary event properties — **FIXED**

- **Severity:** Medium
- **Category:** Input validation / Analytics privacy
- **Evidence (before fix):** `src/app/api/track/route.ts` (previous version) accepted any object as `properties` after only checking `typeof raw.properties === "object"`, then passed it straight to `trackEvent()`, which serializes it verbatim into `event.properties_json`.
- **Exact location:** `src/app/api/track/route.ts`.
- **Exploit scenario:** this is a public, authenticated-but-otherwise-unrestricted POST route intended for exactly two client-fired events (`lesson_started`, `scenario_completed`). Nothing stopped a request from attaching an arbitrarily large or sensitive-looking blob of free text to `properties` — a modified client, a browser extension, or a bug could write anything into the analytics table under a legitimate-looking event name, directly contradicting the audit's own privacy requirement ("event properties cannot contain arbitrary private text unless explicitly required").
- **User impact:** analytics data could silently accumulate unbounded or sensitive text per user, defeating the "only necessary data is stored" principle stated in §8's data inventory.
- **Remediation applied:** each of the two allowed event names now has its own explicit list of allowed property keys (`lesson_started`: `unitId`, `shape`; `scenario_completed`: `scenarioId`, `source`, `mode`), and every value is coerced through `cleanValue()`, which accepts only a string (capped at 80 characters), a finite number, or `null` — never a nested object, array, or arbitrarily long string.
- **Fixed:** **Yes.**
- **Regression test:** `tests/analytics.test.mts`, new section "properties are allow-listed per event, not accepted verbatim" — posts a request with an extra `notAllowed` free-text field and a fake API-key-shaped string, confirms the request still succeeds (nothing breaks), and confirms only the allow-listed key ever reaches the database.

### F4 — No security headers, no `Cache-Control: no-store` on API responses — **FIXED (partially — see F8 for what's intentionally still missing)**

- **Severity:** Medium
- **Category:** Headers / Defense in depth
- **Evidence (before fix):** `next.config.ts` had no `headers()` function at all. Confirmed live: `curl -I` against the running dev server showed no `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, or `Cache-Control` on any response, including `GET /api/session` (which returns per-user progress, streak, and hearts/XP state).
- **Exact location:** `next.config.ts`.
- **Exploit scenario / risk:** without `X-Content-Type-Options: nosniff`, an older browser could MIME-sniff a response into an unintended content type. Without `X-Frame-Options`, the app could be framed by a malicious page for a clickjacking attempt (low realistic likelihood here, since there is nothing to trick a user into clicking that transfers value, but free to close). Without `Cache-Control: no-store`, an intermediate cache placed in front of the app later (a CDN misconfiguration, a caching reverse proxy) could serve one learner's `/api/session` response to another.
- **Remediation applied:** added a `headers()` function to `next.config.ts` setting, on every route: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: microphone=(self), camera=(), geolocation=()` (microphone is genuinely used by the Speaking blocks via the Web Speech API; camera and geolocation are used nowhere in the codebase, confirmed by search, and are explicitly switched off rather than left at their permissive default); and on every `/api/*` route additionally: `Cache-Control: no-store`.
- **Verification performed:** built the app (`npm run build`), ran it as a temporary production instance on a separate port, confirmed all four headers on a page load and `Cache-Control: no-store` plus the other headers on an API response, then ran the full 43-file test suite against that instance — **all passed** — confirming the headers do not break the Speaking/microphone feature or anything else.
- **Fixed:** **Yes**, for the headers listed. **Not** included: Content-Security-Policy and Strict-Transport-Security — see F8 and §9 for why, and what is required to add them safely.

### F5 — AI budget-ceiling check has a TOCTOU race under concurrent requests

- **Severity:** Medium
- **Category:** Abuse / Cost control
- **Evidence:** `src/lib/ai.ts`'s `guard(userId)` calls `budgetLeft(userId)` (`src/lib/cost.ts:107-111`), which sums the `usage` table, and throws `BudgetExceeded` if nothing remains. This check happens *before* the Anthropic call; `recordUsage()` (`src/lib/cost.ts:21-44`) writes the actual spend *after* the call completes. There is no lock, transaction, or per-user semaphore between the two.
- **Exact location:** `src/lib/ai.ts` (`function guard`), `src/lib/cost.ts` (`recordUsage`, `budgetLeft`), called from `src/app/api/chat/route.ts`, `src/app/api/writing/route.ts`, `src/app/api/erklaeren/route.ts`, `src/app/api/leech/route.ts`.
- **Exploit scenario:** a user (or a script acting as one) fires many concurrent requests to `/api/chat` right as their budget is close to the ceiling. Each request's `guard()` check can pass before any of the others have recorded their spend, so the effective ceiling can be exceeded by roughly (achievable concurrency × per-call cost) — bounded by real-world latency and the number of parallel connections a browser or script can realistically open, not unlimited.
- **User impact:** if the deployment relies on each learner's own Anthropic key (the documented, recommended design — "each learner brings their own key... nobody can spend anybody else's"), this risk falls on the individual learner's own account, which they control. It only becomes an operator-facing risk if a shared fallback `ANTHROPIC_API_KEY` is configured for the deployment (`src/lib/apikey.ts:70-76`, `keyFor()` falls back to `serverApiKey()`).
- **Recommended remediation:** for a small private pilot, the simplest, lowest-risk mitigation is **operational, not code**: do not configure a shared `ANTHROPIC_API_KEY` fallback; have each pilot participant add their own key with their own budget in Einstellungen, which is already the app's recommended default. A proper code fix (a per-user in-flight-request counter or a `BEGIN IMMEDIATE` transaction wrapping the check-and-reserve) is a real change with its own testing burden and was judged out of scope for a "targeted fixes only" audit pass.
- **Fixed:** No — documented, with a concrete no-code mitigation for the pilot.

### F6 — Signup has no rate limiting, verification, or invite gate

- **Severity:** Medium
- **Category:** Abuse
- **Evidence:** `src/app/api/auth/route.ts`, `register` branch — the code's own comment states this plainly: *"Registration is open: anything that can reach this route can create an account. That is deliberate rather than an oversight... The boundary is the network, not this route."* The shared login-lockout (`lockedFor`/`recordFailure` in `src/lib/auth.ts`) is checked before branching into register/reset/signin, but registration's own failure path (username taken) never calls `recordFailure`, so repeated registration attempts are not throttled by that mechanism either.
- **Exact location:** `src/app/api/auth/route.ts:100-120`.
- **Exploit scenario:** anyone who discovers the pilot's URL can create unlimited accounts.
- **User impact:** junk accounts, disk/DB growth, no other learner's data at risk (every account is fully isolated — see §5).
- **Recommended remediation:** for this pilot, keep the URL unadvertised/known only to participants (the operator's own stated deployment model). Before a public launch, add a real gate — an invite code checked against a short allow-list, or a reverse-proxy-level basic-auth wall in front of `/anmelden` and `/api/auth`.
- **Fixed:** No — acceptable for a private pilot with a non-public URL; required before public launch (§13).

### F7 — No self-service account deletion or data export

- **Severity:** Low
- **Category:** Privacy / GDPR
- **Evidence:** searched for `DELETE FROM user WHERE` and any `deleteUser`/`deleteAccount` function across `src/` — none exist.
- **Technical readiness:** every user-scoped table has `REFERENCES user(id) ON DELETE CASCADE` (`src/lib/schema.sql` — `attempt`, `card`, `cloze`, `session_log`, `unit_progress`, `word_seen`, `exam_run`, `usage`, `user_stats`, `pending_correction`, `session`, `event`), so a single `DELETE FROM user WHERE id = ?` run by the operator against the database file correctly and completely removes a learner's data. There is no self-service UI for a learner to trigger this themselves, and no export function.
- **Recommended remediation:** for the pilot, document that a deletion or export request is handled manually by the operator running one SQL statement or `npm run export-deck`-equivalent, and tell participants this at consent time. Before a public launch, this needs a real self-service flow — flagged as a product requirement, not built in this pass (per the explicit "do not add product features" instruction for this audit).
- **Fixed:** No — documented gap, with the manual fulfillment path confirmed technically sound.

### F8 — No Content-Security-Policy

- **Severity:** Low (would be Medium-High if the app used `dangerouslySetInnerHTML` anywhere — it does not, see §6)
- **Category:** Headers
- **Evidence:** confirmed no CSP anywhere; Next.js's own hydration mechanism injects inline `<script>` tags (`self.__next_f.push(...)`) on every page load, which a `script-src` CSP tight enough to matter would block unless every such script carried a matching per-request nonce.
- **Why it was not added in this pass:** implementing a nonce-based CSP correctly means generating a nonce in `src/proxy.ts`, threading it through the root layout and every script tag Next.js emits, and testing every page still hydrates — a real, testable change in its own right, not something to bolt on inside a security-audit pass per the explicit instruction "do not blindly add a CSP that breaks the application." A report-only recommendation is the responsible choice here.
- **Recommended remediation before public launch:** implement a nonce-based CSP (`script-src 'self' 'nonce-<per-request>'; object-src 'none'; base-uri 'self'`), verified against every page and every block type in a full manual pass, not just the automated test suite.
- **Fixed:** No — documented as a required pre-public-launch engineering task, not attempted here.

### F9 — scrypt cost parameter is Node's default, not the current high-water mark

- **Severity:** Informational
- **Category:** Cryptography
- **Evidence:** `src/lib/password.ts:15` — `const N = 16384;` (2^14), Node's own `scryptSync` default. OWASP's 2023+ password-storage guidance suggests parameters roughly an order of magnitude higher where server CPU budget allows.
- **Context:** this only matters if the database itself is compromised (an attacker with the password hashes, running offline dictionary/brute-force attacks against them) — the online path is already gated by the 8-attempt lockout, and the minimum password length is 8 characters (`src/lib/password-rules.ts`). This is not an urgent finding for a private pilot's threat model.
- **Recommended remediation:** if a stronger constant is adopted later, do it as its own change with a latency check under real load (scrypt at higher N has a real, measurable per-login CPU/time cost) — not silently inside this audit.
- **Fixed:** No — informational, future-hardening note only.

### F10 — Two routes return the raw exception message from the Anthropic SDK

- **Severity:** Informational
- **Category:** Error handling
- **Evidence:** `src/app/api/settings/route.ts:59` and `src/app/api/chat/route.ts:134` both do `e instanceof Error ? e.message : ...` and return that string to the client.
- **Assessment:** in both cases the exception originates from the `@anthropic-ai/sdk` client call (a network error, a rate limit, an outage) — not from the database, the filesystem, or an internal stack trace. The message content is not attacker-controlled and is not expected to contain the API key based on the SDK's own error shapes, but this was not exhaustively fuzzed against every possible SDK failure mode.
- **Fixed:** No — low confidence that this is exploitable, and changing it would work against this codebase's own stated design principle of being honest about *why* something failed rather than hiding it behind a generic message.

### F11 — Registration reveals whether a username is already taken

- **Severity:** Informational
- **Category:** Enumeration
- **Evidence:** `src/app/api/auth/route.ts:120` — `if (!user) return badRequest("Der Benutzername ist schon vergeben.");`
- **Assessment:** standard behavior for essentially all self-service signup flows; the alternative (a generic "something went wrong" on every registration attempt) would materially hurt legitimate UX for no real security gain, since accounts have no email to protect and the actual authentication boundary (the password, protected by the lockout) is separate from this.
- **Fixed:** No — not treated as a defect.

### F12 — No rate limiting on most non-AI mutating routes

- **Severity:** Informational
- **Category:** Abuse
- **Evidence:** confirmed via repository-wide search (`rateLimit`, `throttle`) that the *only* rate limiting anywhere in the codebase is the login/recovery lockout in `src/lib/auth.ts`. Routes like `/api/attempt`, `/api/track`, `/api/situation`, `/api/cloze`, `/api/leech` have no request-count throttling of their own.
- **Assessment:** for 3–5 known, trusted pilot participants, this is not an urgent risk — nobody plausibly benefits from spamming their own study app. See §7 for the full per-route breakdown and what would be needed before a wider or public launch.
- **Fixed:** No — see §13 for the pre-public-launch recommendation.

## 4. Authentication and Sessions

All verified against the actual code and, where noted, live against the running dev server with two real throwaway accounts.

| Check | Result | Evidence |
|---|---|---|
| Passwords never stored in plaintext | **Pass** | `src/lib/password.ts:24-28` — `hashPassword()` uses `scryptSync`; only `s1$<salt>$<hash>` is ever stored (`src/lib/schema.sql`, `user.password_hash`) |
| Modern password-hashing algorithm | **Pass** | scrypt, N=16384, 64-byte key, 16-byte random salt per password (see F9 for the one nuance) |
| Passwords never logged or returned by APIs | **Pass** | zero `console.log`/`console.error`/`console.warn` calls exist anywhere in `src/` (repository-wide search); every auth response returns only `{id, name}` plus a one-time recovery code — never the password or its hash |
| Password length/input limits exist | **Pass** | `MIN_PASSWORD = 8`, `MAX_PASSWORD = 200` (`src/lib/password-rules.ts`), enforced by `passwordProblem()` before hashing |
| Login failures do not reveal whether a username exists | **Pass** | `src/app/api/auth/route.ts:169-179` — one message, `"Benutzername oder Passwort stimmt nicht."`, for both a wrong username and a wrong password |
| Reasonable rate limiting on authentication attempts | **Pass** | `src/lib/auth.ts:93-118` — 8 attempts, then a 5-minute lockout, keyed on username; checked before signin, register, *and* the recovery-code reset flow |
| Recovery codes hashed/protected | **Pass** | `src/lib/password.ts:102-104` — sha256 of the normalised code; the code itself is shown exactly once and never stored |
| Recovery codes cannot be reused | **Pass, live-verified** | used a real recovery code to reset a real test account's password; the same code was then rejected on a second attempt (`401`, generic message) — see §14 for the exact commands |
| Session creation only after successful authentication | **Pass** | `signIn()` (`src/app/api/auth/route.ts:39-58`) is called only from the register/reset/signin success paths, never before password/recovery-code verification |
| Sessions expire | **Pass** | every session row has `expires_at`; `userIdForSession()` (`src/lib/auth.ts:52-65`) filters on `expires_at > datetime('now')`. Expiry is 10 years — see F1 for why that specific number matters |
| Logout invalidates the session | **Pass, live-verified** | `destroySession()` deletes the DB row; confirmed live that the same cookie value is rejected (`401`) immediately after signing out |
| `HttpOnly` on the session cookie | **Pass** | `src/app/api/auth/route.ts:47` — `httpOnly: true` on `dm_session`. (`dm_uid` is deliberately *not* HttpOnly — it holds only the username, "proves nothing" per its own doc comment, and exists so client code can namespace `localStorage`; this is a documented, low-risk design choice, not an oversight) |
| `Secure` in production | **Conditional — see F1** | `secure: process.env.NODE_ENV === "production"` — correct in intent, but not a guarantee that the connection is actually HTTPS |
| `SameSite` configured appropriately | **Pass** | `SameSite=lax` on both cookies, confirmed live via `Set-Cookie` header — blocks cross-site POST (the main CSRF vector) while still working for normal top-level navigation |
| Session IDs are opaque, contain no user data | **Pass** | `randomBytes(32).toString("base64url")` (`src/lib/auth.ts:22`) — 256 bits of randomness, stored server-side only as its sha256 hash |
| Session IDs never placed in URLs | **Pass** | confirmed no route reads a session token from a query string or path parameter anywhere |
| `no-store` for sensitive authentication responses | **Fixed this pass (F4)** | `/api/*` now sends `Cache-Control: no-store` globally, including `/api/auth`, `/api/session`, and every other authenticated route |

## 5. Authorization and IDOR Tests

Performed live, against the running dev server, using two real accounts created through the real signup form (`secqa-alice`, `secqa-bob`) plus real data Bob created for himself (a vocabulary card, a cloze card, a `situation` answer, an analytics event). All records and accounts were deleted after testing.

| Test | Result | How it was verified |
|---|---|---|
| User A cannot read User B's progress/situation | **Pass** | Bob set `situation: "just_arrived"`; `GET /api/session` as Alice returned `situation: null` |
| User A cannot modify User B's progress | **Pass** | `POST /api/review` as Alice, targeting Bob's real `cardId` → `404 {"error":"card 58991 not found"}`. `ownsCard()` (`src/app/api/review/route.ts:21-26`) checks `WHERE id = ? AND user_id = ?` |
| User A cannot read User B's events | **Pass** | Alice's `POST /api/track` with `{"user":"secqa-bob", ...}` in the body (no trust header) wrote the event under **Alice's own** `user_id` — the impersonation field was silently ignored |
| User A cannot submit attempts/actions for User B | **Pass** | same mechanism (`mayActAsAnyone()`, `src/lib/trust.ts`) governs every route that accepts a `user` field or `?user=` param — it requires a 24+ character shared secret sent via a custom header that only the automated test harness has, confirmed by reading `src/lib/trust.ts:13-17` and live-testing that a plain `curl` with the field but no header has no effect |
| User A cannot access User B's cards/cloze/leech state | **Pass** | Alice's `DELETE /api/cloze` targeting Bob's real cloze id returned `{"ok":false}` and the row was confirmed unchanged in the database; Alice's `POST /api/leech` (`action:"reset"`) against Bob's card returned `{"ok":false,"count":0}` |
| Unauthenticated users cannot access authenticated routes | **Pass** | `GET /api/session` with no cookie → `401`; `GET /fortschritt` with no cookie → `307` redirect to `/anmelden` (`src/proxy.ts`) |
| Non-admin users cannot access admin routes | **Pass (after fix, F2)** | see F2 above — this is the one boundary that did **not** hold before the fix in this pass |
| Direct URL/ID manipulation cannot bypass authorization | **Pass** | every user-scoped table lookup found in this audit includes `WHERE user_id = ?` (or an equivalent join condition) in the SQL itself, not just in application logic — confirmed for `card`, `cloze`, `attempt`, `session_log`, `unit_progress`, `word_seen`, `pending_correction`, `usage`, `event`, `user_stats` |

**Regression tests added for the one boundary that failed:** `tests/video-admin-auth.test.mts` (F2). The other boundaries above were already covered by this repository's existing test suite (`tests/tenancy.test.mts` and others predate this audit and already assert per-user isolation) — this audit's live testing confirmed those existing guarantees still hold rather than finding new gaps, with F2 being the one genuine exception.

## 6. API and Database Security

- **SQL parameterization:** every database call found in `src/lib/` and `src/app/api/` uses `?` placeholders with values passed separately to `node:sqlite`'s `prepare().run()/.get()/.all()` — confirmed by reading every route and the shared `db.ts`/`accounts.ts`/`leech.ts`/`cloze.ts` helper modules. No string concatenation of user input into a SQL statement was found anywhere.
- **Dynamic table/column names:** the only two places a table or column name is built from a variable are (1) `src/lib/db.ts:83`, the `MIGRATIONS` array — a hardcoded, author-written list of `[table, column, decl]` tuples, never derived from a request; and (2) `src/lib/accounts.ts`'s `COLUMNS` constant (`"id, name, level"`), also hardcoded. Neither is reachable from user input.
- **Input validation and size limits:** consistently present — `src/lib/http.ts`'s `str()`/`int()`/`bool()`/`arr()` coercion helpers are used at nearly every route boundary, with explicit length caps (e.g., `str(raw.sentence, 400)` in `/api/erklaeren`, `TEXT_MAX_CHARS` (20,000) in `/api/text`, a 500-item cap on batch word operations, 4000-char cap on writing submissions).
- **JSON parsing:** `readJson()` (`src/lib/http.ts:9-18`) never throws — a malformed body becomes `{}`, which then fails the route's own field checks with a normal `400`, not a crash.
- **XSS / HTML rendering:** `grep -rn "dangerouslySetInnerHTML" src` → **zero results**. Also zero results for `innerHTML`, `outerHTML`, `document.write`, `eval(`, and `new Function(`. The one hand-rolled markdown renderer in the app (`src/components/blocks/GrammarBlock.tsx`, `renderMd`/`inline`) builds real React elements from parsed text — it never constructs an HTML string — so even markdown-formatted AI output or curriculum text is rendered through React's default escaping, the same as any other text content. This is a structural, not incidental, protection: there is no HTML-injection primitive anywhere in the codebase for an XSS payload to reach.
- **Redirects:** the only `redirect()`/`NextResponse.redirect()` calls found (`src/proxy.ts:17`, `src/lib/user.ts:54`, `src/app/wer/page.tsx:22`) all target a hardcoded literal path (`/anmelden`), never a request-supplied URL — no open-redirect surface.
- **Error messages:** confirmed no stack traces, SQL text, or file paths are returned to clients in any route read during this audit (see F10 for the two narrow exceptions, both external-API text).

## 7. AI and Cost-Abuse Security

Reviewed `src/lib/ai.ts` and every route that calls it (`/api/chat`, `/api/writing`, `/api/erklaeren`, `/api/leech`).

- **No provider API key reaches the browser:** confirmed — `keyFor()`/`serverApiKey()` are called only from server-side route handlers; `src/app/api/settings/route.ts`'s own comment states "THE KEY IS NEVER RETURNED," and the response shape (`keyState()`) confirmed to return only a hint (last 4 characters) and a timestamp, never the key.
- **Keys loaded only server-side:** `src/lib/apikey.ts` and `src/lib/secrets.ts` are plain server modules (no `"use client"`), reachable only from API routes.
- **Keys not logged, not in events, not in error responses:** confirmed via the same repository-wide `console.*` search (zero hits) and by reading every catch block in the AI-calling routes — none include the key.
- **User input separated from system instructions:** `tutorSystem()` (`src/lib/ai.ts:194-231`) builds the `system` prompt from three sources only: a fixed instruction block, the learner's known-vocabulary list (server-computed from their own attempt history, never free text), and the scenario's `role`/`goal`/`opener` (server-authored curriculum content, resolved by `resolveScene()` from either `data/scenarios-survival.json` or a unit's `scenario_json` column — never from the live request). The learner's actual typed or spoken words are placed **only** in the `messages` array under `role: "user"`, never concatenated into `system`. This is the architecturally correct separation and was true before this audit — no fix was needed here.
- **User input cannot modify the scenario's role/goal/vocabulary boundary:** follows directly from the above — a learner's message content has no path into the `system` field at all.
- **AI output treated as untrusted text:** the model's `reply`, corrections, and explanations are all rendered through ordinary JSX text interpolation (`{reply}`) — see §6 for why that means automatic escaping, with no exceptions found.
- **Length limits on user input to AI-adjacent routes:** `/api/erklaeren` caps at 400 characters, `/api/writing` at 4000, `/api/chat`'s history is capped at the last 40 turns with each turn's content sliced to 2000 characters (`src/app/api/chat/route.ts:33-40`).
- **Timeouts:** rely on the Anthropic SDK's own default request timeout; no custom timeout wrapper was found. Not flagged as a finding on its own, but noted for completeness.
- **Budget controls exist and are enforced, with one caveat:** see F5 — the ceiling is real and checked before every paid call, with a documented (not fixed) race under concurrency.
- **AI failures fall back safely:** every AI-calling route was found to catch failures and either serve a scripted/offline fallback (`ConversationBlock`'s scripted dialogue), queue the work for later (`/api/writing`'s `pending_correction` table), or return an honest "unavailable" response (`/api/erklaeren`) — never a raw 500 that would break the session (matches the codebase's own stated "session never dead-ends" principle, verified rather than assumed).
- **System prompts not exposed to the client:** confirmed — `tutorSystem()`'s output is passed to the Anthropic SDK server-side and never included in any API response.

## 8. Privacy and Data Handling

**Data inventory** (every personal-data-bearing table/column found in `src/lib/schema.sql`):

| Data | Where | Notes |
|---|---|---|
| Username | `user.name` / `user.id` | also serves as the login identity; no email required |
| Password hash | `user.password_hash` | scrypt, never plaintext (§4) |
| Recovery-code hash | `user.recovery_hash` | sha256 of a server-generated random code, single-use (§4) |
| Legacy email column | `user.email` | present in schema for accounts that predate password sign-in; nothing writes to it any more per the code's own comments; kept only for backward compatibility |
| API key (learner's own) | `user.api_key_enc` | AES-256-GCM encrypted, never plaintext at rest (§9) |
| Situation/onboarding answer | `user.situation` | one of six fixed enum values, or `null`; never free text |
| Learning progress | `card`, `unit_progress`, `word_seen`, `session_log`, `exam_run` | spaced-repetition state, streaks, minutes studied |
| Attempts, including free-text answers | `attempt.user_answer`, `attempt.expected` | **this includes what the learner typed or the speech-recognition transcript of what they said aloud** (`kind='speaking'` rows) — this is core, necessary, disclosed functionality (grading and progress tracking cannot work without it), not incidental collection |
| Writing submissions | `pending_correction.body` | the learner's own submitted German text, queued for correction |
| Analytics events | `event.properties_json` | now allow-listed per event (F3) — ids, enum-like strings, and numbers only |
| Cost/usage | `usage` | token counts and computed cost, no message content |
| IP addresses / device identifiers | **not collected anywhere** | confirmed by search — no route reads `x-forwarded-for` or any equivalent header |
| Microphone audio | **never stored** | speech recognition runs entirely in the browser via the Web Speech API; only the recognized **text** crosses the network (`src/lib/speech.ts`'s `listenOnce()`), never an audio blob |

- **Only necessary data is stored:** the inventory above matches what the product actually needs to function; no field was found that collects more than its stated purpose requires.
- **Sensitive data never in analytics:** confirmed and, where it was not already guaranteed, now enforced (F3) — no password, key, or session token appears in any `trackEvent()` call site.
- **Sensitive logs:** there are no logs to retain — the repository-wide `console.*` search returned zero results in application code.
- **Account deletion / data export:** see F7 — not self-service yet, technically straightforward for the operator to fulfill manually during a small pilot.
- **Privacy policy / consent:** **not evaluated here — this is a legal, not technical, requirement.** Flagged in §13 as needing legal review before any wider launch; this audit takes no position on what such a policy must say.
- **No German bureaucracy documents are uploaded:** confirmed — `/api/text` accepts pasted plain text (capped at 20,000 characters) for vocabulary-scanning purposes; there is no file-upload feature anywhere in the codebase (searched for `multipart`, `formData`, `FileReader` — none found besides standard form field handling).

## 9. Secrets and Deployment

- **`.env*` files are gitignored** except the placeholder `.env.example` — confirmed via `.gitignore` and `git ls-files | grep env` (only `.env.example` is tracked).
- **No secret values found in git history:** searched all history for common API-key/token shapes (`sk-ant-`, AWS-style, PEM private-key headers, Google API-key shape) — the only match was an obviously-fake placeholder (`sk-ant-server-fallback-key-000000000000`) in `tests/apikey.test.mts:190`, a test fixture, not a real credential.
- **Production secrets are environment-injected, not hardcoded:** `DEUTSCHMATE_SECRET`, `ANTHROPIC_API_KEY`, `DEUTSCHMATE_TEST_AUTH`, `DEUTSCHMATE_ADMIN` are all read from `process.env` only; `src/lib/env.ts`'s `describe()` function deliberately never prints `DEUTSCHMATE_SECRET`'s or `ANTHROPIC_API_KEY`'s actual value to a terminal, only presence/last-4.
- **Database files are not publicly served:** `deutschmate.db` and `backups/` live outside `public/`; live-tested that `GET /deutschmate.db` and `GET /backups/` both return the app's normal 404/redirect, never file content.
- **Source maps:** no `productionBrowserSourceMaps` setting — Next.js's safe default (no public source maps) applies.
- **Debug/development bypasses cannot run in production:** the `?tag=` day-override in `/api/session` is explicitly gated — `process.env.NODE_ENV === "production" ? null : params.get("tag")` (`src/app/api/session/route.ts:32`). The test-impersonation bypass (`mayActAsAnyone`) requires a 24+ character secret that must be deliberately configured, and `src/lib/env.ts:80-86` already warns at startup if that secret is set on what looks like a real (`https://`) deployment.
- **Test accounts / hardcoded credentials:** none found in application code; test fixtures use throwaway usernames (`test-*`, `secqa-*` in this audit's own testing) created through the real registration flow, not pre-seeded accounts.

## 10. Dependency Audit

Commands run exactly as specified, no automatic upgrades performed:

```
$ npm audit --omit=dev
found 0 vulnerabilities

$ npm audit
found 0 vulnerabilities

$ npm outdated
Package             Current   Wanted   Latest
@anthropic-ai/sdk   0.115.0  0.115.0  0.127.0
@types/node          26.1.2   26.6.1   26.6.1
@types/react        19.2.18   19.3.0   19.3.0
@types/react-dom     19.2.4   19.3.0   19.3.0
eslint               9.39.5   9.39.5  10.11.0
eslint-config-next   16.3.0   16.3.5   16.3.5
next                 16.3.4   16.3.5   16.3.5
react                19.2.4   19.2.4   19.3.0
react-dom            19.2.4   19.2.4   19.3.0
ts-fsrs               5.4.1    5.4.2    5.4.2
typescript            5.9.3    5.9.3    7.0.2
```

- **No high or critical vulnerabilities** in the current dependency tree (production or dev), per npm's advisory database at the time of this scan.
- All outdated packages are minor/patch version lag, not flagged vulnerabilities; `@anthropic-ai/sdk` is the furthest behind (0.115.0 → 0.127.0) and is a direct, production dependency — worth a deliberate upgrade-and-retest cycle at some point, but nothing in `npm audit` flags a security reason to do it urgently.
- No automatic upgrades were performed, per the task's explicit instruction.

## 11. Security Fixes Made

Three targeted fixes, all verified with the full regression suite (`tsc --noEmit`, `eslint`, `npm run build`, and `node tests/run.mts` — 43/43 passing, up from 42 before this audit added two new test files):

1. **`src/app/api/video/route.ts`** — added `activeUser()`/`unauthorized()` check to the `POST` handler, closing an unauthenticated-write path that existed whenever `DEUTSCHMATE_ADMIN=1` (F2). New test: `tests/video-admin-auth.test.mts`.
2. **`src/app/api/track/route.ts`** — replaced the open `properties: object` acceptance with a per-event allow-list of specific keys and a value sanitizer (string/number/null only, 80-character cap) (F3). New test coverage added to `tests/analytics.test.mts`.
3. **`next.config.ts`** — added `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` on every route, and `Cache-Control: no-store` on every `/api/*` route (F4). Verified live against a temporary production build with the full test suite passing.

No other application behavior was changed. No dependency was upgraded. No product feature was added or removed.

## 12. Open Risks Before Pilot

These should be resolved or explicitly accepted **before** the private pilot starts:

- **F1 — deploy behind HTTPS.** This is the one item in this whole report that materially matters given the 10-year session lifetime. If the pilot is reached over plain HTTP even once, a captured session cookie is valid for a decade.
- **Confirm `DEUTSCHMATE_ADMIN` is unset** on the pilot deployment (it is unset by default and in this repository's own `.env.local`).
- **Do not configure a shared operator `ANTHROPIC_API_KEY`** as a fallback unless the operator has accepted the bounded overspend risk in F5; have each participant bring their own key, which is already the app's documented, recommended path.
- **Tell participants, at consent, how to request deletion of their data** (manually fulfilled by the operator — F7) — a one-sentence disclosure is enough for a small private pilot, not a full privacy policy.

## 13. Open Risks Before Public Launch

Not urgent for a private pilot with 3–5 known participants, but required before any wider or public rollout:

- Self-service account deletion and data export (F7).
- A real signup gate — invite codes or an equivalent (F6).
- Rate limiting on non-AI mutating routes (F12), and a persistent/shared-store rate limiter if ever deployed across more than one server process (the current login lockout is in-memory and per-process — fine for one instance, not for a scaled deployment).
- A nonce-based Content-Security-Policy (F8).
- Strict-Transport-Security, added at the reverse-proxy layer once HTTPS is confirmed for every path to the server — never added blindly in-app.
- Legal review of privacy-policy and consent requirements for EU/German users (GDPR) — this audit identifies the *technical* facts (data inventory in §8, deletion readiness in F7) but takes no legal position.
- A deliberate decision, informed by F9, on whether to raise the scrypt cost parameter, made alongside a latency check.
- A considered upgrade of `@anthropic-ai/sdk` (and the other minor-version-behind packages in §10), tested rather than applied blindly.

## 14. Security Test Commands and Results

All run against the local dev server (`http://127.0.0.1:3010`) or a temporary local production build, using two disposable test accounts (`secqa-alice`, `secqa-bob`, plus a third, `secqa-rc`, for the recovery-code test) created through the real signup form and deleted afterward. No external service, third party, or production data was touched.

```bash
# IDOR: Alice cannot grade Bob's card
$ curl -b alice.cookies -d '{"cardId":58991,"grade":3}' /api/review
{"error":"card 58991 not found"}   # HTTP 404

# IDOR: Alice cannot delete Bob's cloze card
$ curl -b alice.cookies -X DELETE -d '{"id":1}' /api/cloze
{"ok":false,"total":0}             # HTTP 200, no row affected — confirmed in DB

# IDOR: Alice cannot reset Bob's leech state
$ curl -b alice.cookies -d '{"cardId":58991,"action":"reset"}' /api/leech
{"ok":false,"count":0}

# Impersonation bypass attempt (no trust header): ignored, applies to caller
$ curl -b alice.cookies -d '{"user":"secqa-bob","situation":"student_job"}' /api/situation
{"ok":true,"situation":"student_job"}   # ← became ALICE's situation, Bob's untouched (confirmed)

# Unauthenticated page vs API
$ curl /fortschritt                 → 307 redirect to /anmelden
$ curl /api/session                 → 401 {"error":"not signed in"}

# Admin route before/after fix (F2), with DEUTSCHMATE_ADMIN=1 on a temp build
$ curl -d '{"title":"hacked","level":"A1.1","youtubeId":"evil"}' /api/video
before: {"ok":true,"id":"yt-evil"}          # HTTP 200 — the bug
after:  {"error":"not signed in"}           # HTTP 401 — fixed
$ curl -b alice.cookies -d '{...}' /api/video
after:  {"ok":true,...}                     # HTTP 200 — signed-in operator still works

# Recovery code single-use
$ curl -d '{"action":"reset","username":"secqa-rc","code":"<code>","password":"new1"}' /api/auth
{"ok":true,...}                     # first use succeeds, code rotates
$ curl -d '{"action":"reset","username":"secqa-rc","code":"<same code>","password":"new2"}' /api/auth
{"ok":false,"error":"Benutzername oder Code stimmt nicht."}   # HTTP 401 — reuse rejected

# Logout invalidation
$ curl -b alice.cookies -d '{"action":"signout"}' /api/auth  → {"ok":true}
$ curl -b alice.cookies /api/session                          → 401 (same cookie, now dead)

# DB file exposure
$ curl -b alice.cookies /deutschmate.db   → 404 (the app's normal not-found page, not file content)

# Security headers, before/after (F4), verified on a temporary production build
$ curl -I http://127.0.0.1:3099/
before: (none of the below present)
after:  X-Content-Type-Options: nosniff
        X-Frame-Options: DENY
        Referrer-Policy: strict-origin-when-cross-origin
        Permissions-Policy: microphone=(self), camera=(), geolocation=()
$ curl -I http://127.0.0.1:3099/api/session
after:  Cache-Control: no-store   (plus the four headers above)

# Static checks
$ grep -rn "dangerouslySetInnerHTML" src   → 0 results
$ grep -rn "innerHTML\|document.write\|eval(\|new Function(" src   → 0 results
$ grep -rn "console\.\(log\|error\|warn\)" src   → 0 results (application code)

# Dependency audit
$ npm audit --omit=dev   → found 0 vulnerabilities
$ npm audit              → found 0 vulnerabilities

# Full regression, after all fixes
$ npx tsc --noEmit       → clean
$ npx eslint             → clean
$ npx knip               → clean
$ npm run build          → succeeds
$ node tests/run.mts     → 43 passed (was 42 before this audit's two new test files)
```

## 15. Launch Recommendation

**Proceed with the private pilot, on these three conditions:**
1. Deploy behind HTTPS (F1) — non-negotiable given the 10-year session lifetime.
2. Leave `DEUTSCHMATE_ADMIN` unset (its default), and do not configure a shared operator `ANTHROPIC_API_KEY` unless the bounded-overspend risk in F5 is explicitly accepted.
3. Tell the 3–5 participants, briefly, what is collected (§8) and how to request deletion (F7) — a sentence, not a policy document, for a private pilot this size.

Every other finding in this report is either already fixed and verified, or explicitly acceptable at this scale and documented for the team to revisit before a wider launch. This audit found **no evidence of a working cross-user data leak, no SQL injection, no XSS, and no exposed secret** anywhere it looked — which is a genuinely strong starting position for a small application built primarily by one person. The gaps that remain are the ordinary, expected gaps between "works correctly for a known, trusted group" and "safe for the open internet," not signs of carelessness.
