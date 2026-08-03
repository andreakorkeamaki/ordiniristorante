import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentProfile: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentProfile: mocks.getCurrentProfile }));

import { POST } from "@/app/api/operational-log/route";

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/operational-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/operational-log", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.getCurrentProfile.mockReset();
    mocks.getCurrentProfile.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000001",
      active: true,
      role: "waiter",
    });
  });

  it("requires an active authenticated profile", async () => {
    mocks.getCurrentProfile.mockResolvedValue(null);

    const response = await POST(request({
      event: "order_item_add_failed",
      message: "Conflitto",
    }));

    expect(response.status).toBe(401);
  });

  it("rejects unknown events and extra payload fields", async () => {
    const response = await POST(request({
      event: "arbitrary_event",
      message: "Conflitto",
      notes: "contenuto non previsto",
    }));

    expect(response.status).toBe(400);
  });

  it("writes a small structured log without arbitrary payloads", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(request({
      event: "print_job_cancel_failed",
      code: "P0001",
      message: "Job già inviato",
      orderId: "00000000-0000-4000-8000-000000000010",
      printJobId: "00000000-0000-4000-8000-000000000020",
    }));

    expect(response.status).toBe(204);
    expect(errorSpy).toHaveBeenCalledOnce();
    const log = JSON.parse(String(errorSpy.mock.calls[0][0]));
    expect(log).toMatchObject({
      level: "error",
      scope: "operational_client",
      event: "print_job_cancel_failed",
      actor_id: "00000000-0000-4000-8000-000000000001",
      code: "P0001",
      message: "Job già inviato",
      order_id: "00000000-0000-4000-8000-000000000010",
      print_job_id: "00000000-0000-4000-8000-000000000020",
    });
    expect(log).not.toHaveProperty("notes");
  });
});
