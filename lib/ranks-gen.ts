// "How many of these games featured a No. 1 team / two top-5 teams…" (owner, Nov 2026). AP poll in force for each game's
// week (data/game-ranks.json); four options, then Name the Years (the years are the answer here).
import type { CountEntry, Question, RivalryPair, SchoolKey, YearsBonus } from "./types";
import { shuffle, type Rng } from "./rng";
import { SCHOOL } from "./schools";

export interface GameRanks { source: string; pairs: Record<string, { from: number; games: { season: number; date: string; ranks: Record<string, number | null> }[] }> }
const nm = (k: SchoolKey) => SCHOOL[k].name;
const pk = (a: SchoolKey, b: SchoolKey) => [a, b].sort().join("|");

export function genRankedMC(gr: GameRanks, pr: RivalryPair | undefined, a: SchoolKey, b: SchoolKey, rng: Rng): Question | null {
  const p = gr.pairs[pk(a, b)];
  if (!p || p.games.length < 8 || !pr) return null;
  const r = (g: (typeof p.games)[0], k: SchoolKey) => g.ranks[k];
  const V: [string, string, (g: (typeof p.games)[0]) => boolean][] = shuffle(rng, [
    ["n1", "featured a team ranked No. 1 in the AP poll", g => r(g, a) === 1 || r(g, b) === 1],
    ["t5", "had both teams in the AP top 5", g => (r(g, a) ?? 99) <= 5 && (r(g, b) ?? 99) <= 5],
    ["t10", "had both teams in the AP top 10", g => (r(g, a) ?? 99) <= 10 && (r(g, b) ?? 99) <= 10],
    ["any5", "featured at least one AP top-5 team", g => (r(g, a) ?? 99) <= 5 || (r(g, b) ?? 99) <= 5],
  ]);
  for (const [key, what, hit] of V) {
    const hits = p.games.filter(hit), n = hits.length;
    if (n < 2 || n > 12 || n === p.games.length) continue;
    const opts = [n]; for (const d of shuffle(rng, [-2, -1, 1, 2, 3])) if (n + d >= 0 && !opts.includes(n + d) && opts.length < 4) opts.push(n + d);
    if (opts.length < 4) continue;
    const score = (g: (typeof p.games)[0]) => pr.games.find(x => x.date === g.date);
    const line = (g: (typeof p.games)[0]) => {
      const s = score(g), tag = (k: SchoolKey) => (r(g, k) ? `No. ${r(g, k)} ` : "") + nm(k);
      if (!s) return null;
      const w = s.hp > s.ap ? s.home : s.away, l = w === s.home ? s.away : s.home;
      return { w, text: `${tag(w)} ${Math.max(s.hp, s.ap)}, ${tag(l)} ${Math.min(s.hp, s.ap)}` };
    };
    const L = hits.map(g => ({ g, l: line(g) }));
    if (L.some(x => !x.l)) continue;
    const entry = (x: (typeof L)[0]): CountEntry => ({ name: x.l!.text, yards: 0, season: x.g.season, label: x.l!.text, profile: x.l!.text });
    const years: YearsBonus = { prompt: `Name the ${n} seasons.`, a, b, A: L.filter(x => x.l!.w === a).map(entry), B: L.filter(x => x.l!.w === b).map(entry) };
    return { type: "mc", label: "Rankings", verified: true, pitted: true,
      prompt: `Of the ${p.games.length} ${nm(a)}–${nm(b)} games from ${p.from} through 2025, how many ${what}?`,
      options: opts.map(String), answer: 0, order: shuffle(rng, [0, 1, 2, 3]),
      reveal: `${n}.`, after: L.map(x => `${x.g.season} (${x.l!.text})`).join(" · ") + ".",
      info: { title: "Which poll?", text: "The AP Top 25 in force the week of each game; bowl and championship games use the last regular-season poll. Tied teams share a rank." },
      years, sig: "rk" + key } as Question;
  }
  return null;
}

export interface RankedWins { source: string; schools: Record<string, { from: number; wins: { season: number; date: string; opp: string; rank: number; score: string }[] }> }
/** "Since 2015, which school has more wins over AP-ranked opponents, and how many?" (owner, Nov 2026), four options. */
export function genRankedWinsMC(rw: RankedWins, a: SchoolKey, b: SchoolKey, rng: Rng): Question | null {
  const A = rw.schools[a], B = rw.schools[b];
  if (!A || !B) return null;
  for (const from of shuffle(rng, [2010, 2015, 2018, 2020])) {
    if (A.from > from || B.from > from) continue;
    const n = (k: SchoolKey) => rw.schools[k].wins.filter(w => w.season >= from).length, na = n(a), nb = n(b);
    if (na === nb || Math.max(na, nb) < 3) continue;
    const [W, L, nw, nl] = na > nb ? [a, b, na, nb] : [b, a, nb, na];
    const d = shuffle(rng, nw >= 10 ? [-4, -3, 3, 4, 5] : [-2, -1, 1, 2]).find(x => nw + x > nl && nw + x > 0) ?? 2;
    const opts = [`${nm(W)}, ${nw}`, `${nm(W)}, ${nw + d}`, `${nm(L)}, ${nl}`, `${nm(L)}, ${nw + (d > 0 ? -1 : 1) * Math.max(1, Math.abs(d) - 1)}`];
    if (new Set(opts).size < 4) continue;
    const recent = (k: SchoolKey) => rw.schools[k].wins.filter(w => w.season >= from).slice(-3).map(w => `${w.season} vs. No. ${w.rank} ${w.opp} ${w.score}`).join(", ");
    return { type: "mc", label: "Ranked Wins", verified: true, pitted: true,
      prompt: `Since ${from}, which school has more wins over AP-ranked opponents, and how many?`,
      options: opts, answer: 0, order: shuffle(rng, [0, 1, 2, 3]),
      reveal: `${nm(W)} ${nw}, ${nm(L)} ${nl} (through 2025). Latest: ${nm(W)}: ${recent(W)}${nl ? `; ${nm(L)}: ${recent(L)}` : ""}.`,
      info: { title: "What counts as a ranked win?", text: "A win over a team in the AP Top 25 the week of the game (bowls use the last regular-season poll), regular season and postseason, through 2025." },
      sig: "rw" + from } as Question;
  }
  return null;
}
