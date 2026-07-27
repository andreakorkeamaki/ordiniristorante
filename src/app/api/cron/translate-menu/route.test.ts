import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runMenuTranslationBatch: vi.fn(),
}));

vi.mock("@/lib/menu-translation", () => ({
  runMenuTranslationBatch: mocks.runMenuTranslationBatch,
  TranslationBatchError: class TranslationBatchError extends Error {
    summary = {};
  },
}));

import { GET } from "@/app/api/cron/translate-menu/route";

function request(secret?: string) {
  return new Request("http://localhost/api/cron/translate-menu", {
    headers: secret ? { Authorization: `Bearer ${secret}` } : undefined,
  });
}

describe("/api/cron/translate-menu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", "cron-test-secret");
    mocks.runMenuTranslationBatch.mockResolvedValue({
      found: 2,
      updatedFields: 2,
      skippedFields: 0,
      remainingFields: 0,
      translated: {
        categories: 1,
        items: 1,
        extras: 0,
        settings: 0,
      },
      fields: { name_en: 2 },
      model: "gpt-5.6-luna",
      usage: {
        inputTokens: 500,
        outputTokens: 100,
        totalTokens: 600,
      },
    });
  });

  it("rifiuta richieste senza il secret del cron", async () => {
    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(mocks.runMenuTranslationBatch).not.toHaveBeenCalled();
  });

  it("esegue il batch con il secret corretto", async () => {
    const response = await GET(request("cron-test-secret"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      updatedFields: 2,
      remainingFields: 0,
    });
    expect(mocks.runMenuTranslationBatch).toHaveBeenCalledOnce();
  });
});
