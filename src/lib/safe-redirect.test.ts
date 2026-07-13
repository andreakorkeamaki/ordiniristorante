import { describe, expect, it } from "vitest";
import { safeInternalRedirectPath } from "@/lib/safe-redirect";

describe("safeInternalRedirectPath", () => {
  it("mantiene percorsi interni con query string", () => {
    expect(safeInternalRedirectPath("/cassa?tab=ordini")).toBe(
      "/cassa?tab=ordini",
    );
  });

  it.each([
    "//attacker.example/phishing",
    "/\\attacker.example/phishing",
    "https://attacker.example/phishing",
    "javascript:alert(1)",
  ])("rifiuta destinazioni esterne: %s", (value) => {
    expect(safeInternalRedirectPath(value)).toBeNull();
  });
});
