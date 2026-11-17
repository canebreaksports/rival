// Loads the JSON datasets and derives program stats. Safe to import on server and client.
import schools from "@/data/schools.json";
import seasons from "@/data/seasons.json";
import players from "@/data/players.json";
import career from "@/data/career-rushing.json";
import schedule from "@/data/schedule.json";
import curated from "@/data/curated.json";
import type { Dataset, School, SchoolKey } from "./types";

export const DATA = { schools, seasons, players, career, schedule, curated } as unknown as Dataset;

export const SCHOOL: Record<SchoolKey, School> = Object.fromEntries(DATA.schools.map(s => [s.key, s]));

export interface ProgramStat { key: string; prompt: string; window: string }
// Spec §4.1, in this order.
export const PROGRAM_STATS: ProgramStat[] = [
  { key: "heisman", prompt: "Who has more Heisman Trophy winners (all-time)?", window: "all-time" },
  { key: "sec", prompt: "Who won more SEC championships from 2000–2024?", window: "2000–2024" },
  { key: "natl", prompt: "Who won more national championships from 2000–2024?", window: "2000–2024" },
  { key: "unbeaten", prompt: "Who had more undefeated seasons from 2000–2024?", window: "2000–2024" },
  { key: "win10", prompt: "Who had more 10-win seasons from 2000–2025?", window: "2000–2025" },
  { key: "win3", prompt: "Who had more seasons with 3 wins or fewer from 2000–2025?", window: "2000–2025" },
  { key: "losing", prompt: "Who had more losing seasons from 2000–2025?", window: "2000–2025" },
  { key: "totalW", prompt: "Who won more total games from 2000–2025?", window: "2000–2025" },
  { key: "peakW", prompt: "Whose best season since 2000 had more wins?", window: "2000–2025" },
];

/** Program stat value for a school, or null if missing (or unverified when verifiedOnly). */
export function programValue(data: Dataset, k: SchoolKey, stat: string, verifiedOnly: boolean): { value: number; verified: boolean } | null {
  const s = data.schools.find(x => x.key === k);
  if (!s) return null;
  if (stat in s.program) {
    if (verifiedOnly && !s.programVerified) return null;
    return { value: s.program[stat as keyof School["program"]], verified: s.programVerified };
  }
  const rec = data.seasons[k];
  if (!rec || (verifiedOnly && !rec.verified)) return null;
  const wl = rec.records.map(r => r.split("-").map(Number) as [number, number]);
  const v: Record<string, number> = {
    win10: wl.filter(([w]) => w >= 10).length,
    win3: wl.filter(([w]) => w <= 3).length,
    losing: wl.filter(([w, l]) => w < l).length,
    totalW: wl.reduce((a, [w]) => a + w, 0),
    peakW: Math.max(...wl.map(([w]) => w)),
  };
  return stat in v ? { value: v[stat], verified: rec.verified } : null;
}
