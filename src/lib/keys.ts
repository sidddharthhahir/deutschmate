"use client";

import { useEffect } from "react";

/**
 * One rule for "should this global shortcut fire?".
 *
 * The app binds window-level keys in six places: the review grader (1–4, R, Z,
 * Space), the gap-fill (Enter), the home screen (Enter), the video segment
 * editor (Space, M), the command palette (Cmd+K) and the shortcut sheet (?).
 * Most of those were unguarded, and window listeners do not care what has
 * focus — so opening the palette during a review and searching for "reise"
 * replayed the audio on "r" and, once a digit appeared in the query, graded
 * the card sitting behind the overlay.
 *
 * Two conditions, both necessary:
 *
 *   typing   the event came from a field, so the character belongs to it
 *   modal    an overlay owns the screen, so nothing underneath may act
 */

/** Set while any full-screen overlay is up. */
const MODAL_ATTR = "data-dm-modal";

export function isTypingTarget(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  return (
    ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) ||
    el.isContentEditable ||
    // A native <dialog> or an element that has opted out explicitly.
    el.closest?.("[contenteditable='true']") !== null
  );
}

export function modalIsOpen(): boolean {
  return typeof document !== "undefined" && document.documentElement.hasAttribute(MODAL_ATTR);
}

/**
 * True when a global shortcut must stay out of the way.
 *
 * Use this in every window-level keydown handler that isn't itself the modal.
 */
export function shouldIgnoreKey(e: KeyboardEvent): boolean {
  return isTypingTarget(e) || modalIsOpen();
}

/**
 * Mark the screen as owned by an overlay while `open`.
 *
 * Counted rather than boolean: two overlays can briefly coexist (pressing ?
 * with the palette open), and the first one to close must not clear the flag
 * for the other.
 */
export function useModalFlag(open: boolean) {
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const n = Number(root.getAttribute(MODAL_ATTR) ?? "0") + 1;
    root.setAttribute(MODAL_ATTR, String(n));
    return () => {
      const left = Number(root.getAttribute(MODAL_ATTR) ?? "1") - 1;
      if (left > 0) root.setAttribute(MODAL_ATTR, String(left));
      else root.removeAttribute(MODAL_ATTR);
    };
  }, [open]);
}
