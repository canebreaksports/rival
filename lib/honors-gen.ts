// Honors questions (pitted): NFL draft, major awards, Heisman voting. Both schools in every question.
import type { CountEntry, Question, SchoolKey } from "./types";
import { pick, shuffle, type Rng } from "./rng";
import { SCHOOL } from "./schools";

export interface DraftPick { year: number; round: number; overall: number; name: string; pos: string; nfl: string; school: SchoolKey }
export interface DraftData { source: string; from: number; to: number; years: number[]; picks: DraftPick[] }
export interface AwardWin { award: string; year: number; name: string; school: SchoolKey; pos?: string }
export interface HeismanVote { year: number; place: number; name: string; school: SchoolKey; pos: string; points: number; first: number }
export interface HonorsData { source: string; awards: { key: string; name: string; for: string }[]; wins: AwardWin[]; heisman: HeismanVote[]; heismanDepth: Record<string, number>; everWon: AwardWin[]; sources: Record<string, string> }

const name = (k: SchoolKey) => SCHOOL[k].name;
const ord = (n: number) => n + (n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th");

/** Earliest year from which every year up to `to` is present (so "since X" claims are complete). */
function coveredFrom(years: number[], to: number) {
  const have = new Set(years); let from = to + 1;
  while (have.has(from - 1)) from--;
  return from;
}

// ---------- NFL draft ----------
type DraftKind = "r1" | "top10" | "top50" | "r3";
const GROUPS: Record<string, { label: string; pos: string[] }> = {
  all: { label: "", pos: [] },
  qb: { label: "quarterbacks", pos: ["Quarterback"] },
  rb: { label: "running backs", pos: ["Running Back", "Fullback"] },
  wr: { label: "wide receivers and tight ends", pos: ["Wide Receiver", "Tight End"] },
  ol: { label: "offensive linemen", pos: ["Offensive Tackle", "Offensive Guard", "Center"] },
  dl: { label: "defensive linemen", pos: ["Defensive Tackle", "Defensive End", "Defensive Edge"] },
  lb: { label: "linebackers", pos: ["Linebacker", "Outside Linebacker", "Inside Linebacker"] },
  db: { label: "defensive backs", pos: ["Cornerback", "Safety", "Defensive Back"] },
};
const KIND_TEXT: Record<DraftKind, string> = { r1: "first-round", top10: "top-10", top50: "top-50", r3: "first-three-round" };
export function genDraftCount(d: DraftData, a: SchoolKey, b: SchoolKey, rng: Rng): Question | null {
  const full = coveredFrom(d.years, d.to);
  const cands: { from: number; kind: DraftKind; g: string }[] = [];
  for (const g of Object.keys(GROUPS)) for (const kind of (g === "all" ? ["r1", "top10", "top50"] : ["r1", "top50", "r3"]) as DraftKind[])
    for (const from of g === "all" ? [2010, 2014, 2017, 2020, 2022] : [2000, 2005, 2010, 2015]) {
      if (from < full) continue;
      const n = d.picks.filter(p => (p.school === a || p.school === b) && p.year >= from && hit(p, kind, g)).length;
      if (n >= 2 && n <= 14) cands.push({ from, kind, g });
    }
  if (!cands.length) return null;
  const { from, kind, g } = pick(rng, cands);
  const list = (k: SchoolKey): CountEntry[] => d.picks.filter(p => p.school === k && p.year >= from && hit(p, kind, g))
    .map(p => ({ name: p.name, yards: p.overall, season: p.year, label: `No. ${p.overall} pick`, profile: `${p.pos} · ${p.year} draft, round ${p.round}` }));
  const what = g === "all" ? `${KIND_TEXT[kind]} NFL draft picks` : `${GROUPS[g].label} taken in the ${kind === "r1" ? "first round" : kind === "r3" ? "first three rounds" : "top 50"}`;
  return { type: "count", label: "NFL Draft", a, b, threshold: 0, verified: true, pitted: true,
    prompt: g === "all" ? `From the ${from} draft through ${d.to}, which school produced more ${what}?`
      : `From the ${from} draft through ${d.to}, which school had more ${what}?`,
    A: list(a), B: list(b), sig: "dc" + kind + from + (g === "all" ? "" : g) };
}
const hit = (p: DraftPick, kind: DraftKind, g = "all") =>
  (g === "all" || GROUPS[g].pos.includes(p.pos)) && (kind === "r1" ? p.round === 1 : kind === "top10" ? p.overall <= 10 : kind === "r3" ? p.round <= 3 : p.overall <= 50);

export function genDraftMC(d: DraftData, a: SchoolKey, b: SchoolKey, rng: Rng): Question | null {
  const pool = d.picks.filter(p => (p.school === a || p.school === b) && p.round <= 3);
  for (let t = 0; t < 10; t++) {
    const picks: DraftPick[] = [];
    for (const s of shuffle(rng, [a, b])) { const p = shuffle(rng, pool).find(p => p.school === s && !picks.some(x => x.name === p.name)); if (p) picks.push(p) }
    for (const p of shuffle(rng, pool)) { if (picks.length === 4) break; if (!picks.some(x => x.name === p.name || Math.abs(x.overall - p.overall) < 3)) picks.push(p) }
    if (picks.length < 4 || new Set(picks.map(p => p.overall)).size < 4) continue;
    const best = picks.reduce((x, y) => (y.overall < x.overall ? y : x));
    const label = (p: DraftPick) => `${p.name} (${name(p.school)})`;
    return { type: "mc", label: "NFL Draft", verified: true, pitted: true,
      prompt: `Which of these ${name(a)} and ${name(b)} players was drafted highest?`,
      options: [best, ...picks.filter(p => p !== best)].map(label), answer: 0, order: shuffle(rng, [0, 1, 2, 3]),
      reveal: picks.sort((x, y) => x.overall - y.overall).map(p => `${p.name}: No. ${p.overall} overall in ${p.year}`).join(" · "),
      sig: "dm" + picks.map(p => p.name).sort(),
      more: { title: `Highest-drafted ${name(a)} and ${name(b)} players since ${d.from}`,
        rows: d.picks.filter(p => p.school === a || p.school === b).sort((x, y) => x.overall - y.overall || x.year - y.year).slice(0, 8)
          .map((p, i) => `${i + 1}. ${p.name} (${p.school}) No. ${p.overall}, ${p.year}`) } };
  }
  return null;
}

// ---------- awards ----------
const POS_AWARD: Record<string, string[]> = { doak: ["RB"], biletnikoff: ["WR", "TE"], obrien: ["QB"], mackey: ["TE"] };

export function genAwardCount(h: HonorsData, a: SchoolKey, b: SchoolKey, rng: Rng): Question | null {
  const awardName = (k: string) => h.awards.find(x => x.key === k)?.name ?? k;
  const opts: { key: string | null; from: number }[] = [];
  for (const from of [2000, 2010, 2015]) {
    const all = h.wins.filter(w => (w.school === a || w.school === b) && w.year >= from);
    if (all.length >= 2 && all.length <= 14) opts.push({ key: null, from });
    for (const aw of h.awards) { const n = all.filter(w => w.award === aw.key).length; if (n >= 2 && n <= 10) opts.push({ key: aw.key, from }) }
  }
  if (!opts.length) return null;
  const { key, from } = pick(rng, opts);
  const list = (s: SchoolKey): CountEntry[] => h.wins.filter(w => w.school === s && w.year >= from && (!key || w.award === key))
    .map(w => ({ name: w.name, yards: w.year, season: w.year, label: key ? (w.pos || "winner") : awardName(w.award),
      profile: [w.pos, `won the ${awardName(w.award)} (${h.awards.find(x => x.key === w.award)?.for ?? ""})`].filter(Boolean).join(" · ") }));
  const what = key ? `${awardName(key)} winners` : "winners of major national awards (Heisman, Maxwell, Walter Camp, Doak Walker, Biletnikoff and more)";
  return { type: "count", label: "Awards", a, b, threshold: 0, verified: true, pitted: true,
    prompt: `From ${from} through 2025, which school had more ${what}?`, A: list(a), B: list(b), sig: "ac" + (key ?? "all") + from };
}

export function genAwardMC(h: HonorsData, a: SchoolKey, b: SchoolKey, rng: Rng, players: { name: string; school: SchoolKey; pos: string; star?: boolean }[]): Question | null {
  const wins = shuffle(rng, h.wins.filter(w => (w.school === a || w.school === b) && ["heisman", "maxwell", "camp", ...Object.keys(POS_AWARD)].includes(w.award)));
  for (const w of wins) {
    const aw = h.awards.find(x => x.key === w.award); if (!aw) continue;
    const winnersOfAward = new Set(h.everWon.filter(x => x.award === w.award).map(x => x.name)); // all years, not just 2000+
    const pos = POS_AWARD[w.award];
    // Distractors are big names: other award winners, top-5 Heisman finishers and star players from these two schools
    // who did NOT win this award (same position for position awards). Role players only as a last resort.
    const honored = new Set([...h.wins.map(x => x.school + x.name), ...h.heisman.filter(v => v.place <= 5).map(v => v.school + v.name)]);
    const posOf = new Map(players.map(p => [p.school + p.name, p.pos]));
    const bigNames = [
      ...h.wins.map(x => ({ name: x.name, school: x.school, pos: posOf.get(x.school + x.name) ?? "" })),
      ...h.heisman.filter(v => v.place <= 5).map(v => ({ name: v.name, school: v.school, pos: posOf.get(v.school + v.name) ?? v.pos })),
      ...players.filter(p => p.star),
    ];
    const ok = (p: { name: string; school: SchoolKey; pos: string }) => (p.school === a || p.school === b) && !winnersOfAward.has(p.name) && p.name !== w.name && (!pos || pos.includes(p.pos));
    const dedupe = <T extends { name: string }>(l: T[]) => l.filter((p, i, arr) => arr.findIndex(x => x.name === p.name) === i);
    const others = dedupe([...shuffle(rng, bigNames.filter(ok)), ...shuffle(rng, players.filter(p => ok(p) && !honored.has(p.school + p.name)))]);
    // both schools among the options
    const other = others.find(p => p.school !== w.school);
    if (!other) continue;
    const rest = others.filter(p => p !== other).slice(0, 2);
    if (rest.length < 2) continue;
    const opts = [w, other, ...rest].map(p => `${p.name} (${name(p.school)})`);
    return { type: "mc", label: "Awards", verified: true, pitted: true,
      prompt: `Which of these players won the ${aw.name}, given to the nation's ${aw.for}?`,
      options: opts, answer: 0, order: shuffle(rng, [0, 1, 2, 3]),
      reveal: `${w.name} (${name(w.school)}) won the ${aw.name} in ${w.year}.`, sig: "am" + w.award + w.year,
      more: { title: `Every ${name(a)} and ${name(b)} winner of the ${aw.name}`,
        rows: h.everWon.filter(x => x.award === w.award && (x.school === a || x.school === b)).sort((x, y) => x.year - y.year).map(x => `${x.year}: ${x.name} (${x.school})`) } };
  }
  return null;
}

// ---------- Heisman voting ----------
export function genHeismanCount(h: HonorsData, a: SchoolKey, b: SchoolKey, rng: Rng): Question | null {
  // "top-N since X" is only complete if every year X..2025 has at least N checked places
  const fullFor = (top: number) => coveredFrom(Object.entries(h.heismanDepth).filter(([, d]) => d >= top).map(([y]) => Number(y)), 2025);
  const opts: { top: number; from: number }[] = [];
  for (const top of [1, 3, 5]) for (const from of [2000, 2006, 2010, 2015, 2019]) {
    if (from < fullFor(top)) continue;
    const n = h.heisman.filter(v => (v.school === a || v.school === b) && v.year >= from && v.place <= top).length;
    if (n >= 2 && n <= 12) opts.push({ top, from });
  }
  if (!opts.length) return null;
  const { top, from } = pick(rng, opts);
  const list = (s: SchoolKey): CountEntry[] => h.heisman.filter(v => v.school === s && v.year >= from && v.place <= top)
    .map(v => ({ name: v.name, yards: v.place, season: v.year, label: `${ord(v.place)} place`, profile: `${v.pos} · ${v.year} Heisman voting: ${v.points.toLocaleString("en-US")} points` }));
  return { type: "count", label: "Heisman", a, b, threshold: 0, verified: true, pitted: true,
    prompt: top === 1 ? `From ${from} through 2025, which school had more Heisman Trophy winners?` : `From ${from} through 2025, which school had more top-${top} finishes in Heisman Trophy voting?`,
    A: list(a), B: list(b), sig: "hc" + top + from };
}

export function genHeismanMC(h: HonorsData, a: SchoolKey, b: SchoolKey, rng: Rng): Question | null {
  // Options are specific seasons (player + year), each a checked row, so the answer can't hinge on a season we lack.
  const pool = h.heisman.filter(v => v.school === a || v.school === b);
  for (let t = 0; t < 10; t++) {
    const picks: HeismanVote[] = [];
    const ok = (p: HeismanVote) => !picks.some(x => x.name === p.name || x.place === p.place);
    for (const s of shuffle(rng, [a, b])) { const p = shuffle(rng, pool).find(p => p.school === s && ok(p)); if (p) picks.push(p) }
    for (const p of shuffle(rng, pool)) { if (picks.length === 4) break; if (ok(p)) picks.push(p) }
    if (picks.length < 4) continue;
    const top = picks.reduce((x, y) => (y.place < x.place ? y : x));
    const label = (p: HeismanVote) => `${p.name} (${name(p.school)}, ${p.year})`;
    return { type: "mc", label: "Heisman", verified: true, pitted: true,
      prompt: "Which of these finished highest in Heisman Trophy voting that season?",
      options: [top, ...picks.filter(p => p !== top)].map(label), answer: 0, order: shuffle(rng, [0, 1, 2, 3]),
      reveal: [...picks].sort((x, y) => x.place - y.place).map(p => `${p.name}: ${ord(p.place)} in ${p.year}`).join(" · "),
      sig: "hm" + picks.map(p => p.name + p.year).sort(),
      more: { title: `${name(a)} and ${name(b)} top-10 Heisman finishes (seasons with checked voting)`,
        rows: pool.filter(v => v.place <= 10).sort((x, y) => x.place - y.place || x.year - y.year).slice(0, 12).map(v => `${ord(v.place)}: ${v.name} (${v.school}) ${v.year}`) } };
  }
  return null;
}
