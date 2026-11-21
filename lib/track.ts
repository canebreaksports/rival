// Fire-and-forget anonymous events to /api/track. Never blocks or breaks the game.
export type TrackEvent =
  | { e: "pick"; pid: string; school: string }
  | { e: "start" | "finish"; pid: string; school: string; slug: string; pts?: number; right?: number; hints?: number };
export function track(ev: TrackEvent) {
  try {
    const body = JSON.stringify(ev);
    if (typeof navigator !== "undefined" && navigator.sendBeacon) navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
    else void fetch("/api/track", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true });
  } catch { /* analytics must never affect play */ }
}
