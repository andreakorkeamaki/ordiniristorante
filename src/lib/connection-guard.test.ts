import { describe, expect, it } from "vitest";
import { isOperationalPath } from "@/components/connection-provider";

describe("connection guard", () => {
  it.each([
    "/asporti",
    "/staff/order/00000000-0000-4000-8000-000000000001",
    "/staff/tables",
    "/staff/table/00000000-0000-4000-8000-000000000001",
    "/cassa",
    "/admin",
  ])("protegge la rotta operativa %s", (pathname) => {
    expect(isOperationalPath(pathname)).toBe(true);
  });

  it.each(["/", "/menu", "/staff/forgot-password"])(
    "non blocca la rotta non operativa %s",
    (pathname) => {
      expect(isOperationalPath(pathname)).toBe(false);
    },
  );
});
