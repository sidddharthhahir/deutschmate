# Security Checklist

Companion to `SECURITY_AUDIT_REPORT.md` — that document has the evidence and reasoning behind every item here. This is the short, actionable version, organized by deployment stage.

## Local development

- [ ] `.env.local` exists and is never committed (`git check-ignore -v .env.local` should say it's ignored).
- [ ] `DEUTSCHMATE_SECRET` is set (`npm run setup` generates one) — without it, nobody's API key can be stored.
- [ ] `DEUTSCHMATE_ADMIN` is unset or `0`.
- [ ] `DEUTSCHMATE_TEST_AUTH` is set only for running the test suite, and is at least 24 characters (the app refuses shorter values automatically).
- [ ] `npm run config` shows no `error`-level issues (it self-checks `DEUTSCHMATE_URL`, `DEUTSCHMATE_SECRET`, `DEUTSCHMATE_ADMIN`, and whether `DEUTSCHMATE_TEST_AUTH` looks like it's set on a real deployment).
- [ ] Before committing: `git status` reviewed, nothing under `.env*` (besides `.env.example`) staged.

## Staging / test deployment

- [ ] Served over HTTPS, even for internal testing — `NODE_ENV=production`'s `Secure` cookie flag assumes this is true, and the assumption should be tested, not just trusted.
- [ ] `DEUTSCHMATE_URL` set to the real reachable address (not `localhost`) — `npm run config` will flag this loudly if there's more than one account and it still points at `localhost`.
- [ ] `DEUTSCHMATE_ADMIN` unset unless actively editing video segments, and turned back off immediately after.
- [ ] Run the full test suite against staging once: `DM_TEST_URL=https://staging-host node tests/run.mts`.
- [ ] Confirm security headers are present: `curl -I https://staging-host/` should show `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`; `curl -I https://staging-host/api/session` should additionally show `Cache-Control: no-store`.
- [ ] Confirm `deutschmate.db`, `backups/`, and `.env.local` are not reachable over HTTP (`curl -I .../deutschmate.db` should be a 404, not file content).
- [ ] `npm audit` clean (or every finding reviewed and accepted).

## Private pilot (3–5 known users)

- [ ] **HTTPS confirmed end-to-end** — this is the one hard requirement given the 10-year session cookie lifetime (`SECURITY_AUDIT_REPORT.md` F1).
- [ ] `DEUTSCHMATE_ADMIN` unset.
- [ ] No shared operator `ANTHROPIC_API_KEY` configured, unless the bounded-overspend risk (F5) has been explicitly accepted — otherwise each pilot participant brings their own key via Einstellungen.
- [ ] Pilot URL not publicly advertised or indexed (signup has no gate by design — F6 — so obscurity is the actual current control).
- [ ] Participants told, briefly, what data is collected (§8 of the audit) and how to request deletion (a manual operator action — F7). One sentence is enough at this scale; it does not need to be a formal policy document yet.
- [ ] Backups (`npm run backup`) tested at least once, and the operator knows how to restore from one.
- [ ] The two test accounts and any test data created during security testing have been deleted from the production database before real participants sign up.
- [ ] Full regression suite green immediately before the pilot starts: `tsc --noEmit`, `eslint`, `npm run build`, `node tests/run.mts`.

## Public launch

Everything above, plus:

- [ ] Self-service account deletion and data export implemented (F7) — not present today.
- [ ] A real signup gate: invite codes, a reverse-proxy allowlist, or equivalent (F6) — registration is deliberately open today.
- [ ] Rate limiting added to non-AI mutating routes, and made to work across more than one server process if the deployment ever scales beyond a single instance (F12) — today's login lockout is in-memory and single-process only.
- [ ] A nonce-based Content-Security-Policy implemented and manually verified against every page and block type (F8) — not present today; adding a naive one would break Next.js hydration.
- [ ] `Strict-Transport-Security` added at the reverse-proxy layer, only once HTTPS is confirmed for 100% of traffic — never added inside the app blindly.
- [ ] Legal review completed: privacy policy, consent flow, and GDPR data-subject-request process for EU/German users. This audit identified the technical facts (data inventory, deletion readiness) but does not substitute for that review.
- [ ] A considered decision on raising the scrypt password-hashing cost parameter (F9), tested for login-latency impact before shipping.
- [ ] `@anthropic-ai/sdk` (and other lagging dependencies) deliberately upgraded and retested, not left on the versions this pilot shipped with indefinitely.
- [ ] A repeat of the IDOR test matrix in `SECURITY_AUDIT_REPORT.md` §5 against whatever new routes exist by then — every route that takes an id needs the same `WHERE user_id = ?` discipline the current ones have.
