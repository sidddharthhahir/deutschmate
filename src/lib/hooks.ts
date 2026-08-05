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
