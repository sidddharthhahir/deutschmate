/**
 * Reading JSON from our own API, on the client. `lib/http.ts` is the server half
 * and cannot be imported here — it pulls in next/server.
 *
 * A 401 is the case worth naming. `fetch` does not throw on it, so the body parses
 * fine and every field is undefined; a page that trusts the shape then dies on the
 * first `.map`. That is how /wortschatz crashed on an expired session. The routes
 * already answer 401 with `signIn`, which nothing was reading.
 */

export type Json = Record<string, unknown>;

/** Null on any failure — 401, 500, a dead socket, a body that is not an object. */
export async function getJson(url: string): Promise<Json | null> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    return null;
  }

  if (res.status === 401) {
    // Where the server says to go, not a path hardcoded a second time.
    const to = await res
      .json()
      .then((d) => (typeof d?.signIn === "string" ? d.signIn : "/anmelden"))
      .catch(() => "/anmelden");
    if (typeof window !== "undefined") window.location.href = to;
    return null;
  }
  if (!res.ok) return null;

  try {
    const v = await res.json();
    return v !== null && typeof v === "object" && !Array.isArray(v)
      ? (v as Json)
      : null;
  } catch {
    return null;
  }
}

/** An array of T, or []. The guard `.map` needs. Mirrors `arr` in lib/http.ts. */
export function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

/** A finite number, or the fallback. */
export function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
