"use client";

import { useEffect } from "react";

/** One rule for "should this global shortcut fire?". */

/** Set while any full-screen overlay is up. */
const MODAL_ATTR = "data-dm-modal";

export function isTypingTarget(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  return (
    ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) ||
    Boolean(el.isContentEditable) ||
    /*
     * `!== null` was wrong for a target with no closest() at all — window and document both yield
     * undefined through the optional chain, and undefined !== null is true, so every global
     * shortcut was silently swallowed.
     */
    Boolean(el.closest?.("[contenteditable='true']"))
  );
}

export function modalIsOpen(): boolean {
  return (
    typeof document !== "undefined" &&
    document.documentElement.hasAttribute(MODAL_ATTR)
  );
}

/** True when a global shortcut must stay out of the way. */
export function shouldIgnoreKey(e: KeyboardEvent): boolean {
  return isTypingTarget(e) || modalIsOpen();
}

/** Mark the screen as owned by an overlay while `open`. */
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
