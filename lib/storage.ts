// Device-local progress (spec §2 "one run per player"). Real enforcement needs accounts (Stage 2).
import type { Progress } from "./types";

export const PREVIEW_PREFIX = "preview:";

export const store = {
  get(k: string): Progress | null {
    try { return JSON.parse(localStorage.getItem(k) ?? "null") } catch { return null }
  },
  set(k: string, v: Progress) {
    try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* storage unavailable */ }
  },
  /** Clears real and preview progress on this device (Coach "Reset my played matchups"). */
  clear() {
    try { Object.keys(localStorage).filter(k => k.startsWith("rival:") || k.startsWith(PREVIEW_PREFIX)).forEach(k => localStorage.removeItem(k)) } catch { /* ignore */ }
  },
};
