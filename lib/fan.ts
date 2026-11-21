// The player's chosen school + an anonymous device ID. Kept apart from "rival:" progress keys so Coach resets keep it.
export interface Fan { school: string; pid: string }
const KEY = "rivalfan";
export function getFan(): Fan | null {
  try { const f = JSON.parse(localStorage.getItem(KEY) ?? "null"); return f?.school && f?.pid ? f : null } catch { return null }
}
export function setFan(school: string): Fan {
  const pid = getFan()?.pid ?? (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now());
  const f = { school, pid };
  try { localStorage.setItem(KEY, JSON.stringify(f)) } catch { /* storage unavailable */ }
  return f;
}
