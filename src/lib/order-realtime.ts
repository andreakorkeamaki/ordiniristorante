type RealtimeRow = {
  created_by?: unknown;
  updated_by?: unknown;
};

export function shouldFlagExternalOrderUpdate({
  profileId,
  selfUpdate,
  newRow,
  oldRow,
}: {
  profileId: string;
  selfUpdate: boolean;
  newRow: unknown;
  oldRow: unknown;
}) {
  if (selfUpdate) return false;

  const row = asRealtimeRow(newRow) ?? asRealtimeRow(oldRow);
  const actorId = row?.updated_by ?? row?.created_by;

  return typeof actorId !== "string" || actorId !== profileId;
}

function asRealtimeRow(value: unknown): RealtimeRow | null {
  return typeof value === "object" && value !== null
    ? (value as RealtimeRow)
    : null;
}
