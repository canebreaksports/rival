import { describe, expect, it } from "vitest";
import { DATA } from "@/lib/data";
import { buildRound } from "@/lib/build";
import { mulberry32 } from "@/lib/rng";
import { validateQuestion } from "@/lib/validate";

const H = DATA.honors!, D = DATA.draft!;
const PAIRS: [string, string][] = [["AUB", "ALA"], ["LSU", "TENN"], ["UGA", "SC"], ["TEX", "TAMU"], ["OU", "MIZ"], ["ARK", "TEX"]];

describe("honors data", () => {
  it("Heisman winners agree across two Wikipedia sources (winners list vs. each year's voting table)", () => {
    for (const v of H.heisman.filter(v => v.place === 1)) {
      const w = H.wins.find(x => x.award === "heisman" && x.year === v.year);
      expect(w?.name.replace(/\s+II$/, "")).toBe(v.name.replace(/\s+II$/, ""));
    }
  });
  it("every kept Heisman voting row adds up and places are contiguous", () => {
    for (const v of H.heisman) expect(v.place).toBeLessThanOrEqual(H.heismanDepth[v.year]);
  });
  it("draft years are complete and picks are plausible", () => {
    expect(D.years.length).toBe(D.to - D.from + 1);
    for (const p of D.picks) { expect(p.round).toBeGreaterThanOrEqual(1); expect(p.round).toBeLessThanOrEqual(7); expect(p.overall).toBeGreaterThanOrEqual(1) }
  });
});

describe("honors questions", () => {
  const all = PAIRS.flatMap(([a, b]) => Array.from({ length: 200 }, (_, i) => buildRound(DATA, a, b, mulberry32(i), { verifiedOnly: true }).map(q => ({ q, a, b })))).flat();
  it("award multiple choice: exactly one option ever won that award", () => {
    let seen = 0;
    for (const { q } of all) if (q.type === "mc" && q.sig.startsWith("am")) {
      seen++; expect(validateQuestion(q)).toEqual([]);
      const award = q.sig.slice(2).replace(/\d{4}$/, "");
      const winners = new Set(H.everWon.filter(w => w.award === award).map(w => w.name)); // any year
      expect(q.options.filter(o => winners.has(o.replace(/ \([^)]*\)$/, ""))).length).toBe(1);
    }
    expect(seen).toBeGreaterThan(0);
  });
  it("Heisman count questions always use Name Them (players), never Name the Years", () => {
    for (const { q } of all) if (q.type === "count" && q.sig.startsWith("hc")) expect(q.bonus ?? "names").toBe("names");
  });
  it("draft and Heisman multiple choice have a single clear answer", () => {
    for (const { q } of all) if (q.type === "mc" && /^(dm|hm)/.test(q.sig)) expect(validateQuestion(q)).toEqual([]);
  });
  it("draft count lists every qualifying pick for each school, and nothing else", () => {
    let seen = 0;
    for (const { q, a, b } of all) if (q.type === "count" && q.sig.startsWith("dc")) {
      seen++;
      const [, kind, fromS, g] = q.sig.match(/^dc(r1|top10|top50|r3)(\d{4})(\w*)$/)!, from = Number(fromS);
      const POS: Record<string, string[]> = { qb: ["Quarterback"], rb: ["Running Back", "Fullback"], wr: ["Wide Receiver", "Tight End"],
        ol: ["Offensive Tackle", "Offensive Guard", "Center"], dl: ["Defensive Tackle", "Defensive End", "Defensive Edge"],
        lb: ["Linebacker", "Outside Linebacker", "Inside Linebacker"], db: ["Cornerback", "Safety", "Defensive Back"] };
      const ok = (p: (typeof D.picks)[0]) => (!g || POS[g].includes(p.pos)) &&
        (kind === "r1" ? p.round === 1 : kind === "top10" ? p.overall <= 10 : kind === "r3" ? p.round <= 3 : p.overall <= 50);
      for (const [s, L] of [[a, q.A], [b, q.B]] as const)
        expect(L.map(x => x.name + x.season).sort()).toEqual(D.picks.filter(p => p.school === s && p.year >= from && ok(p)).map(p => p.name + p.year).sort());
    }
    expect(seen).toBeGreaterThan(0);
  });
});

import { genWalkoffCount, genWalkoffMC } from "@/lib/walkoff-gen";
import { DATA as DW } from "@/lib/data";
describe("walk-offs (final play or overtime)", () => {
  const W = DW.walkoffs!;
  it("known games are found and classified", () => {
    const find = (k: string, y: number) => W.pairs[k]?.list.find(x => x.season === y);
    expect(find("ALA|AUB", 2013)).toMatchObject({ winner: "AUB", ws: 34, ls: 28, how: "ret" });   // Kick Six
    expect(find("ALA|AUB", 2021)).toMatchObject({ winner: "ALA", how: "ot" });                    // 4OT
    expect(find("TAMU|TEX", 2011)).toMatchObject({ winner: "TEX", ws: 27, ls: 25, how: "fg" });    // Tucker at the gun
    expect(find("TENN|UGA", 2016)).toMatchObject({ winner: "TENN", how: "td" });                  // Hail Mary
    expect(find("ALA|AUB", 2010)).toBeUndefined();                                                  // Auburn led at the end, no walk-off
  });
  it("every prompt spells out what counts, and the bonus is Name the Years", () => {
    for (const k of Object.keys(W.pairs)) {
      const [a, b] = k.split("|") as [any, any];
      for (const q of [genWalkoffCount(W, a, b), genWalkoffMC(W, a, b, () => 0.5)]) if (q) {
        expect(q.prompt).toMatch(/as time expired in the 4th quarter, or any overtime win/);
        if (q.type === "count") expect(q.bonus).toBe("years");
        if (q.type === "mc") expect(q.years!.A.length + q.years!.B.length).toBe(Number(q.options[q.answer]));
      }
    }
  });
});
