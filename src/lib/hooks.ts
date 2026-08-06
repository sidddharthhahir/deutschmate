"use client";

import { useSyncExternalStore } from "react";
import { speechSupported } from "./speech";

/** Reading browser state the React way. */

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/** True when the browser believes it has a connection. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true, // SSR: assume online, the client corrects on hydration
  );
}

const noopSubscribe = () => () => {};

/** True when this browser can do speech recognition. Firefox has never shipped it. */
export function useSpeechSupported(): boolean {
  return useSyncExternalStore(noopSubscribe, speechSupported, () => false);
}

const COARSE = "(pointer: coarse)";

function subscribeCoarse(cb: () => void) {
  const mq = window.matchMedia(COARSE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/**
 * True on a finger, false on a mouse.
 *
 * Only for the places where touch needs DIFFERENT WORDS, not merely fewer —
 * the tour's "Press Enter", which is the whole product in two words and is
 * wrong on a phone, and the key legend on a block's doorway card. Anything
 * that is just a hint to hide uses `.kbd-hint` in globals.css instead: CSS
 * cannot be caught mid-hydration showing the wrong one.
 *
 * SSR answers false, so a phone renders the keyboard wording for one frame.
 * Both callers mount after a fetch, well past hydration, so it never shows.
 */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    subscribeCoarse,
    () => window.matchMedia(COARSE).matches,
    () => false,
  );
}
