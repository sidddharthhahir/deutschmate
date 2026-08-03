"use client";

/**
 * Has this person seen the tour?
 *
 * localStorage rather than the database: it is a property of this browser, not
 * of the learner. Your flatmate opening the app on their own laptop should get
 * the welcome, and clearing your browser to see it again should work.
 */
const KEY = "dm.tour.v1";

export function tourSeen(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    // Private mode: better to assume seen than to trap someone on a welcome
    // screen they can never dismiss.
    return true;
  }
}

export function markTourSeen() {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* nothing to do — worst case it shows once more */
  }
}

export function resetTour() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
