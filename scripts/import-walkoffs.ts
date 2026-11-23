// Finds rivalry games won on the final play of regulation or in overtime (from the CollegeFootballData cache:
// games for line scores, drives for the last play) and writes data/walkoffs.json.
//
//   npx tsx scripts/import-walkoffs.ts <gamesCacheDir>     (games/ from fetch-cfbd-games.ts, drives/ from fetch-cfbd-drives.ts)
//
// Counted (the owner's definition, Nov 2026, and the question text says so):
//   - "final play": the winner was tied or trailing, and scored on the game's last drive, which ended with 0:00 left in the 4th quarter
//   - "overtime": any game decided in overtime
// Checks: line scores add up to the final score; for a final-play win, the drive's ending score equals the final score.
// A pair's window starts after the last rivalry game whose data fails a check, so "since <year>" claims are complete.
import fs from "node:fs";
import path from "node:path";

const [cache] = process.argv.slice(2);
if (!cache) { console.error("usage: tsx scripts/import-walkoffs.ts <gamesCacheDir>"); process.exit(1); }
const KEY: Record<string, string> = {
  Alabama: "ALA", Arkansas: "ARK", Auburn: "AUB", Florida: "FLA", Georgia: "UGA", Kentucky: "UK", LSU: "LSU",
  "Mississippi State": "MSST", Missouri: "MIZ", Oklahoma: "OU", "Ole Miss": "MISS", "South Carolina": "SC",
  Tennessee: "TENN", Texas: "TEX", "Texas A&M": "TAMU", Vanderbilt: "VAN",
};
interface G { id: number; season: number; startDate: string; homeTeam: string; awayTeam: string; homePoints: number; awayPoints: number; homeLineScores?: number[]; awayLineScores?: number[] }
interface D { gameId: number; offense: string; defense: string; driveNumber: number; scoring: boolean; endPeriod: number; endTime: { minutes: number; seconds: number }; driveResult: string; startOffenseScore: number; startDefenseScore: number; endOffenseScore: number; endDefenseScore: number }
export interface Walkoff { season: number; date: string; winner: string; loser: string; ws: number; ls: number; how: "ot" | "fg" | "td" | "ret" }

const games = new Map<number, G>(), drives = new Map<number, D[]>();
for (let y = 2001; y <= 2025; y++) for (const conf of ["SEC", "B12"]) {
  for (const g of JSON.parse(fs.readFileSync(path.join(cache, "games", `${y}-${conf}.json`), "utf8")) as G[]) games.set(g.id, g);
  for (const d of JSON.parse(fs.readFileSync(path.join(cache, "drives", `${y}-${conf}.json`), "utf8")) as D[]) {
    if (!drives.has(d.gameId)) drives.set(d.gameId, []);
    const L = drives.get(d.gameId)!; if (!L.some(x => x.driveNumber === d.driveNumber)) L.push(d);
  }
}
const sum = (a?: number[]) => (a ?? []).reduce((x, y) => x + (y ?? 0), 0);
const pairs: Record<string, { from: number; games: number; list: Walkoff[]; problems: string[] }> = {};
for (const g of [...games.values()].sort((x, y) => x.startDate.localeCompare(y.startDate))) {
  const h = KEY[g.homeTeam], a = KEY[g.awayTeam];
  if (!h || !a || g.homePoints == null || g.homePoints === g.awayPoints) continue;
  const pk = [h, a].sort().join("|"), P = (pairs[pk] ??= { from: 2001, games: 0, list: [], problems: [] });
  const winH = g.homePoints > g.awayPoints, W = winH ? h : a, Lk = winH ? a : h;
  const base = { season: g.season, date: g.startDate.slice(0, 10), winner: W, loser: Lk, ws: Math.max(g.homePoints, g.awayPoints), ls: Math.min(g.homePoints, g.awayPoints) };
  const fail = (why: string) => { P.problems.push(`${g.season} ${a}@${h}: ${why}`); P.from = g.season + 1; P.list = P.list.filter(x => x.season > g.season); P.games = 0 };
  P.games++;
  const hl = g.homeLineScores, al = g.awayLineScores;
  if (!hl?.length || !al?.length || sum(hl) !== g.homePoints || sum(al) !== g.awayPoints) { fail("line scores missing or don't add up"); continue }
  if (hl.length > 4) { P.list.push({ ...base, how: "ot" }); continue } // CFBD folds every overtime into one period: no OT count
  const ds = (drives.get(g.id) ?? []).sort((x, y) => x.driveNumber - y.driveNumber);
  if (!ds.length) { fail("no drives"); continue }
  const last = ds[ds.length - 1]; // drive-result labels are unreliable ("END OF HALF" on a field goal), so go by the score
  if (last.endPeriod !== 4 || last.endTime.minutes !== 0 || last.endTime.seconds !== 0) continue; // game didn't end on this drive's clock
  const score = (d: D, side: "start" | "end") => {
    const off = side === "start" ? d.startOffenseScore : d.endOffenseScore, def = side === "start" ? d.startDefenseScore : d.endDefenseScore;
    return KEY[d.offense] === W ? [off, def] : [def, off]; // [winner, loser]
  };
  const [w0, l0] = score(last, "start"), [w1, l1] = score(last, "end");
  if (w1 !== base.ws || l1 !== base.ls) { fail(`final drive ends ${w1}-${l1}, final score ${base.ws}-${base.ls}`); continue }
  if (w0 > l0 || w1 === w0 || l1 !== l0) continue; // already ahead, or the winner didn't score on the final drive
  const how = KEY[last.offense] !== W ? "ret" : w1 - w0 === 3 ? "fg" : w1 - w0 >= 6 ? "td" : null;
  if (!how) { fail(`final-play score of ${w1 - w0} points`); continue }
  P.list.push({ ...base, how });
}
const out = Object.fromEntries(Object.entries(pairs).filter(([, p]) => p.games).map(([k, p]) => [k, { from: p.from, games: p.games, list: p.list }]));
fs.writeFileSync("data/walkoffs.json", JSON.stringify({ source: "CollegeFootballData /games (line scores) and /drives (last drive, clock, score), seasons 2001–2025, fetched 2026-11-23. Final-play wins: the winner was tied or trailing and scored on the game's last drive, ending 0:00 in the 4th quarter; overtime: any game decided in overtime.", pairs: out }, null, 1) + "\n");
for (const [k, p] of Object.entries(pairs)) if (p.problems.some(x => !/2002|no drives/.test(x))) console.log(`! ${k}: ${p.problems.join("; ")}`);
const n = Object.values(out).reduce((x, p) => x + p.list.length, 0);
console.log(`${Object.keys(out).length} pairs, ${n} final-play/OT wins`);
for (const k of ["ALA|AUB", "TAMU|TEX", "MISS|MSST", "TENN|VAN", "LSU|ARK", "ARK|LSU", "MIZ|OU"]) if (out[k]) console.log(k, "since", out[k].from, out[k].list.map(x => `${x.season} ${x.winner} ${x.ws}-${x.ls} ${x.how}`).join(", "));
