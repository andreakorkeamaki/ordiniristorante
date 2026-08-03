"use client";

import { useCallback, useEffect, useRef } from "react";

type RefreshTask = () => void | Promise<void>;

export function useCoalescedRefresh(refresh: RefreshTask, delayMs = 150) {
  const refreshRef = useRef(refresh);
  const timeoutRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const rerunRef = useRef(false);
  const mountedRef = useRef(true);
  const scheduleRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  const run = useCallback(async () => {
    if (!mountedRef.current) return;
    if (runningRef.current) {
      rerunRef.current = true;
      return;
    }

    runningRef.current = true;
    try {
      await refreshRef.current();
    } catch {
      // The refresh owns its user-facing error state. The scheduler only
      // prevents duplicate work and must always remain usable afterwards.
    } finally {
      runningRef.current = false;
      if (mountedRef.current && rerunRef.current) {
        rerunRef.current = false;
        scheduleRef.current();
      }
    }
  }, []);

  const schedule = useCallback(() => {
    if (!mountedRef.current) return;
    if (runningRef.current) {
      rerunRef.current = true;
      return;
    }
    if (timeoutRef.current !== null) return;

    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      void run();
    }, delayMs);
  }, [delayMs, run]);

  useEffect(() => {
    scheduleRef.current = schedule;
  }, [schedule]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      rerunRef.current = false;
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  return schedule;
}
