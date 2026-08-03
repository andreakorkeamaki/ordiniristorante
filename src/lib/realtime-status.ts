export function isRealtimeFailureStatus(status: string) {
  return status === "CHANNEL_ERROR" || status === "TIMED_OUT";
}

export function isRealtimeSubscribedStatus(status: string) {
  return status === "SUBSCRIBED";
}
