import { describe, expect, it } from "vitest";
import {
  isRealtimeFailureStatus,
  isRealtimeSubscribedStatus,
} from "@/lib/realtime-status";

describe("realtime channel statuses", () => {
  it("recognizes statuses that make the live snapshot unreliable", () => {
    expect(isRealtimeFailureStatus("CHANNEL_ERROR")).toBe(true);
    expect(isRealtimeFailureStatus("TIMED_OUT")).toBe(true);
    expect(isRealtimeFailureStatus("CLOSED")).toBe(false);
    expect(isRealtimeFailureStatus("SUBSCRIBED")).toBe(false);
  });

  it("recognizes a successful subscription", () => {
    expect(isRealtimeSubscribedStatus("SUBSCRIBED")).toBe(true);
    expect(isRealtimeSubscribedStatus("CHANNEL_ERROR")).toBe(false);
  });
});
