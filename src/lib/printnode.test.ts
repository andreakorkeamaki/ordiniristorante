import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createPrintNodeJob,
  PrintNodeIdempotencyError,
} from "@/lib/printnode";

describe("PrintNode idempotency recovery", () => {
  beforeEach(() => {
    vi.stubEnv("PRINTNODE_API_KEY", "test-key");
    vi.stubEnv("PRINTNODE_PRINTER_ID", "123");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("recupera il job esistente dopo una collisione senza un secondo POST", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: "Idempotency key collision: order:new_order",
          }),
          { status: 409 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: 98765,
              source: "Appordini print_job:local-job",
              createTimestamp: "2026-07-02T10:00:01.000Z",
            },
          ]),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createPrintNodeJob({
      title: "NUOVA COMANDA #42",
      content: Buffer.from("ticket"),
      idempotencyKey: "order:new_order",
      source: "Appordini print_job:local-job",
      createdAfter: "2026-07-02T10:00:00.000Z",
    });

    expect(result).toEqual({ id: 98765, recovered: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it("tratta la collisione non recuperabile come esito incerto, non come invio fallito", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: "Idempotency key collision: order:new_order",
          }),
          { status: 409 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createPrintNodeJob({
        title: "NUOVA COMANDA #42",
        content: Buffer.from("ticket"),
        idempotencyKey: "order:new_order",
        source: "Appordini print_job:missing",
      }),
    ).rejects.toMatchObject({
      name: PrintNodeIdempotencyError.name,
      outcomeUncertain: true,
    });
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });
});
