/**
 * Which learner the browser thinks it is.
 *
 * Everything stored client-side hangs off this one answer, so a wrong reading
 * puts one flatmate's answers in the other's deck. lib/user.ts re-exports
 * normalise() as normaliseName() rather than keeping a second copy, so what is
 * checked here is what the server uses to name a row.
 *
 * needs: nothing
 */
import { ok, eq, section, done } from "./harness.mts";
import { normalise, scoped, userFromCookie, whoami, DEFAULT_USER } from "../src/lib/who.ts";

section("a name becomes an id");
eq(normalise("Sid"), "sid", "case");
eq(normalise("  MIRA  "), "mira", "surrounding space");
eq(normalise("Anna-Lena"), "anna-lena", "hyphens survive");
eq(normalise("jörg"), "jrg", "characters outside the set are dropped");
eq(normalise("user@name"), "username", "punctuation too");
eq(normalise(""), DEFAULT_USER, "empty falls back");
eq(normalise("   "), DEFAULT_USER, "whitespace falls back");
eq(normalise("!!!"), DEFAULT_USER, "so does a name that normalises to nothing");
eq(normalise("a".repeat(60)).length, 32, "long names are cut, not rejected");

section("keys are scoped, and distinct people get distinct keys");
eq(scoped("dm.outbox.v1", "sid"), "dm.outbox.v1:sid", "the shape of a scoped key");
ok(scoped("dm.outbox.v1", "sid") !== scoped("dm.outbox.v1", "mira"), "two learners, two keys");
eq(scoped("dm.outbox.v1", "MIRA"), "dm.outbox.v1:mira", "case does not fork the key");
eq(scoped("dm.outbox.v1", ""), `dm.outbox.v1:${DEFAULT_USER}`, "a blank name falls back");

section("reading the cookie");
eq(userFromCookie("dm_user=mira"), "mira", "the only cookie");
eq(userFromCookie("theme=dark; dm_user=mira; x=1"), "mira", "one of several");
eq(userFromCookie("theme=dark"), DEFAULT_USER, "absent means the default learner");
eq(userFromCookie(""), DEFAULT_USER, "no cookies at all");
eq(userFromCookie("dm_user=%20Anna-Lena%20"), "anna-lena", "url-encoded and normalised");
eq(userFromCookie("dm_userx=zzz"), DEFAULT_USER, "a lookalike name is not the cookie");

section("no document means the server, and the server never guesses wrong");
ok(typeof (globalThis as any).document === "undefined", "no document in this process");
eq(whoami(), DEFAULT_USER, "falls back instead of throwing during a render");

done();
