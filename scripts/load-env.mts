/**
 * Give a plain script the same environment the app has.
 *
 * Next loads .env.local for the server; `node scripts/whatever.mts` does not.
 * Without this a script reports — or worse, acts on — a different configuration
 * than the running app, which is how `npm run invite` would cheerfully print a
 * link to the terminal on a machine where mail is configured and working.
 *
 * Imported for its side effect, before anything that reads process.env.
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  /* no .env.local — the ambient environment is the answer */
}

export {};
