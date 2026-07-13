import { describe, expect, it } from "vitest";
import { normalizeCategorySlug } from "@/lib/menu-categories";

describe("normalizeCategorySlug", () => {
  it("crea uno slug minuscolo senza spazi o accenti", () => {
    expect(normalizeCategorySlug("  Birre Artigianàli  ")).toBe(
      "birre-artigianali",
    );
  });

  it("mantiene gli slug già validi", () => {
    expect(normalizeCategorySlug("all-you-can-eat")).toBe("all-you-can-eat");
  });
});
