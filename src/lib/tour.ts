"use client";

import { myKey } from "./who";

/**
 * Has this person seen the tour?
 *
 * localStorage rather than the database, so clearing your browser to see it
 * again works — but keyed by learner, not by browser. The original reasoning
 * ("a property of this browser") assumed each flatmate has their own laptop,
 * and /wer exists precisely because they do not: whoever set the app up
 * dismissed the welcome, and the second person never saw it.
 */
const BASE = "dm.tour.v1";

export function tourSeen(): boolean {
  try {
    return localStorage.getItem(myKey(BASE)) === "1";
  } catch {
    // Private mode: better to assume seen than to trap someone on a welcome
    // screen they can never dismiss.
    return true;
  }
}

export function markTourSeen() {
  try {
    localStorage.setItem(myKey(BASE), "1");
  } catch {
    /* nothing to do — worst case it shows once more */
  }
}

