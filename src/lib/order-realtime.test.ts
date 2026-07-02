import { describe, expect, it } from "vitest";
import { shouldFlagExternalOrderUpdate } from "@/lib/order-realtime";

describe("shouldFlagExternalOrderUpdate", () => {
  it("ignora gli eventi Realtime prodotti dallo stesso utente", () => {
    expect(
      shouldFlagExternalOrderUpdate({
        profileId: "profile-1",
        selfUpdate: false,
        newRow: { updated_by: "profile-1" },
        oldRow: {},
      }),
    ).toBe(false);
  });

  it("segnala una modifica attribuita a un altro utente", () => {
    expect(
      shouldFlagExternalOrderUpdate({
        profileId: "profile-1",
        selfUpdate: false,
        newRow: { updated_by: "profile-2" },
        oldRow: {},
      }),
    ).toBe(true);
  });

  it("ignora gli eventi ricevuti durante una mutazione locale", () => {
    expect(
      shouldFlagExternalOrderUpdate({
        profileId: "profile-1",
        selfUpdate: true,
        newRow: { updated_by: "profile-2" },
        oldRow: {},
      }),
    ).toBe(false);
  });
});
