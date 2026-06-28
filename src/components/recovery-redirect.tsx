"use client";

import { useEffect } from "react";

export function RecoveryRedirect() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    if (params.get("type") !== "recovery") return;
    if (window.location.pathname === "/staff/reset-password") return;

    window.location.replace(`/staff/reset-password${window.location.hash}`);
  }, []);

  return null;
}
