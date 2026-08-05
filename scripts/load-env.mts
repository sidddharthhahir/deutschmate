/** Give a plain script the same environment the app has. */
try {
  process.loadEnvFile(".env.local");
} catch {
  /* no .env.local — the ambient environment is the answer */
}

export {};
