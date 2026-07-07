export type ReliableDataState = "loading" | "ready" | "stale" | "error";

export function readFailureState(hasValidSnapshot: boolean): ReliableDataState {
  return hasValidSnapshot ? "stale" : "error";
}

export function canMutateReliableData(
  connected: boolean,
  state: ReliableDataState,
) {
  return connected && state === "ready";
}
