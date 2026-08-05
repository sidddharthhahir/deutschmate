"use client";

import { useSyncExternalStore } from "react";
import { speechSupported } from "./speech";

/**
 * Reading browser state the React way.
 *
 * `useEffect(() => setX(read()), [])` is the obvious version and it's wrong:
 * it renders once with a stale value, then immediately re-renders. React flags
 * it, and on a screen that flips between online and offline states the flash
 * is visible. `useSyncExternalStore` reads the real value during render and
 * gives a server snapshot for SSR.
 */

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

/**
 * True when this browser can do speech recognition.
 *
 * Chrome, Edge and Safari — Safari through the webkit-prefixed constructor,
 * which `Recognition()` in lib/speech.ts already accepts. Firefox has never
 * shipped it. Feature detection rather than a browser list, so the day Firefox
 * does ship it this turns on with no code change.
 */
export function useSpeechSupported(): boolean {
  return useSyncExternalStore(noopSubscribe, speechSupported, () => false);
}
