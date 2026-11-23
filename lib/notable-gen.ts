// "Notables" Rank It (pitted): famous players and big seasons from both schools.
//   1. Career receiving yards from each school's record book (top 10), e.g. Mike Evans vs Jordan Shipley vs Christian Kirk vs Xavier Worthy.
//      (The mixed-seasons version, e.g. Evans 2013 receiving TDs vs Vince Young 2004 rushing TDs, is genMixedRank(c, teams, true).)
import type { Question, SchoolKey } from "./types";
import { shuffle, type Rng } from "./rng";
import { SCHOOL } from "./schools";

export interface RecvEntry { name: string; yards: number; from?: number; to?: number; active?: boolean }
export type CareerReceiving = Record<string, { source: string; verified: boolean; list: RecvEntry[] }>;

const MODERN = 2000;   // fans should know the names: careers that ended 2000 or later
const GAP = 25;        // record-book totals are exact, and everyone here is a top-10 receiver at his school (close calls allowed)
const span = (e: RecvEntry) => (e.from && e.to ? (e.from === e.to ? `${e.from}` : `${e.from}–${String(e.to).slice(2)}`) : "");
const label = (e: RecvEntry & { school: SchoolKey }) => `${e.name} (${SCHOOL[e.school].name}${span(e) ? ", " + span(e) : ""})`;

export function genCareerRecRank(cr: CareerReceiving, a: SchoolKey, b: SchoolKey, rng: Rng): Question | null {
  if (!cr[a] || !cr[b]) return null;
  // each school's six biggest modern careers (the lists are already in yards order), so the names are ones fans know
  const pool = [a, b].flatMap(s => cr[s].list.filter(e => !e.active && (e.to ?? 0) >= MODERN).slice(0, 6).map(e => ({ ...e, school: s })));
  for (let t = 0; t < 30; t++) {
    const picks: typeof pool = [];
    for (const s of shuffle(rng, [a, b, a, b])) { // two from each school
      const e = shuffle(rng, pool).find(x => x.school === s && !picks.includes(x) && picks.every(y => Math.abs(y.yards - x.yards) >= GAP));
      if (e) picks.push(e);
    }
    if (picks.length < 4) continue;
    const sorted = [...pool].sort((x, y) => y.yards - x.yards);
    return {
      type: "rank", label: "Notables", verified: cr[a].verified && cr[b].verified, pitted: true, unit: "yds",
      prompt: "Rank these pass catchers by career receiving yards at their school, highest first.",
      items: picks.map(e => ({ label: label(e), value: e.yards, school: e.school })),
      note: `Career totals from each school's record book. Sources: ${cr[a].source}; ${cr[b].source}`,
      sig: "nr" + picks.map(e => e.name).sort(),
      more: { title: `Career receiving yards, ${SCHOOL[a].name} and ${SCHOOL[b].name} (careers ending ${MODERN} or later)`,
        rows: sorted.slice(0, 10).map((e, i) => `${i + 1}. ${label(e)} ${e.yards.toLocaleString("en-US")}`) },
    } as Question;
  }
  return null;
}
