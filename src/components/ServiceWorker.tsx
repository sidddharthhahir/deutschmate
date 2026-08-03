"use client";

import { useEffect } from "react";

/**
 * Register the service worker.
 *
 * Production only. In development the SW sits between Turbopack and the page
 * and makes hot reload behave strangely — and the dev server is, by
 * definition, reachable.
 */
export default function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const onLoad = () => {
      void navigator.serviceWorker.register("/sw.js").catch(() => {
        /* An unregistered SW costs offline support, never correctness. */
      });
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
