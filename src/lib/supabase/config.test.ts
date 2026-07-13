import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getSupabaseEnv,
  getSupabaseServerSecretEnv,
  hasSupabaseEnv,
} from "@/lib/supabase/config";

describe("Supabase env config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("treats an invalid Supabase URL as missing configuration", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "sb_publishable_your_key");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-key");

    expect(hasSupabaseEnv()).toBe(false);
    expect(() => getSupabaseEnv()).toThrow("Supabase non configurato");
  });

  it("accepts local and remote HTTP Supabase URLs", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-key");

    expect(hasSupabaseEnv()).toBe(true);
    expect(getSupabaseEnv()).toEqual({
      url: "http://127.0.0.1:54321",
      key: "test-key",
    });
  });

  it("requires a separate secret for server-side PrintNode state", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-key");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    expect(() => getSupabaseServerSecretEnv()).toThrow(
      "SUPABASE_SECRET_KEY",
    );
  });

  it("reads the server secret without exposing it through public config", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-key");
    vi.stubEnv("SUPABASE_SECRET_KEY", "server-secret");

    expect(getSupabaseServerSecretEnv()).toEqual({
      url: "http://127.0.0.1:54321",
      key: "server-secret",
    });
  });
});
