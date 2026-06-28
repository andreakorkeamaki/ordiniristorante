"use client";

import { useEffect } from "react";

const LEGACY_CACHE_PREFIX = "la-sagretta-comande-";

export function LegacyServiceWorkerCleanup() {
  useEffect(() => {
    async function cleanup() {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          registrations
            .filter((registration) => registration.scope.startsWith(window.location.origin))
            .map((registration) => registration.unregister()),
        );
      }

      if ("caches" in window) {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames
            .filter((name) => name.startsWith(LEGACY_CACHE_PREFIX))
            .map((name) => caches.delete(name)),
        );
      }
    }

    void cleanup();
  }, []);

  return null;
}
