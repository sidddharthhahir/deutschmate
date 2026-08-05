import { NextResponse } from "next/server";

/**
 * Request parsing that cannot itself be the bug. None of these are — they are ordinary bad
 * requests, and the client can only respond sensibly if it's told so.
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

/** Nobody is signed in. */
export function unauthorized() {
  return NextResponse.json(
    { error: "not signed in", signIn: "/anmelden" },
    { status: 401 },
  );
}

// ---------------------------------------------------------------- coercion

/** A trimmed string, or "" for anything that isn't usable text. */
export function str(v: unknown, max = 2000): string {
  if (typeof v === "string") return v.trim().slice(0, max);
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

/** A finite integer within range, or null. */
export function int(
  v: unknown,
  min = -Infinity,
  max = Infinity,
): number | null {
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
