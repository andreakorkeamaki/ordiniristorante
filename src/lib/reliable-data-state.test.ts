import { describe, expect, it } from "vitest";
import {
  canMutateReliableData,
  readFailureState,
} from "@/lib/reliable-data-state";

describe("reliable data states", () => {
  it("non trasforma il primo errore di lettura in uno snapshot vuoto", () => {
    expect(readFailureState(false)).toBe("error");
    expect(canMutateReliableData(true, "error")).toBe(false);
  });

  it("mantiene lo snapshot valido ma lo marca stale e blocca le mutazioni", () => {
    expect(readFailureState(true)).toBe("stale");
    expect(canMutateReliableData(true, "stale")).toBe(false);
  });

  it("abilita le mutazioni solo con connessione e dati ready", () => {
    expect(canMutateReliableData(true, "ready")).toBe(true);
    expect(canMutateReliableData(false, "ready")).toBe(false);
  });
});
