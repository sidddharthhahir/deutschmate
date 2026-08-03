import { NextResponse } from "next/server";

/**
 * Request parsing that cannot itself be the bug.
 *
 * Every route used to start with `await req.json()` and then read fields off
 * the result. Three ways that goes wrong, all of which returned a 500 with an
 * empty body:
 *
 *   malformed JSON   `req.json()` throws before the handler runs
 *   `null` body      valid JSON, but destructuring it throws
 *   wrong types      `body.word.trim()` when word is a number
 *
 * A 500 means "the server is broken". None of these are — they are ordinary
 * bad requests, and the client can only respond sensibly if it's told so.
 */

/** Parse a JSON body, or return an empty object. Never throws. */
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const v = await req.json();
    return v !== null && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function badRequest(error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status: 400 });
}

export function notFound(error: string) {
  return NextResponse.json({ error }, { status: 404 });
}

// ---------------------------------------------------------------- coercion

/** A trimmed string, or "" for anything that isn't usable text. */
export function str(v: unknown, max = 2000): string {
  if (typeof v === "string") return v.trim().slice(0, max);
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

/** A finite integer within range, or null. */
export function int(v: unknown, min = -Infinity, max = Infinity): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  return n >= min && n <= max ? n : null;
}

export function bool(v: unknown): boolean {
  return v === true || v === "true" || v === 1;
}

/** An array of T, or []. Guards `.map`/`.reduce` on a value that isn't a list. */
export function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}
