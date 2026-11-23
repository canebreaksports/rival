// Wins over AP-ranked opponents for every school in the game: data/ranked-wins.json, school -> {from, wins: [...]}.
//   npx tsx scripts/import-ranked-wins.ts <gamesCacheDir>
// Opponent's AP rank from the poll in force for that week (bowls: the last regular-season poll). A school's window
// starts in the first season from which every season has a full slate of its games in the cache.
import fs from "node:fs";
import path from "node:path";
import { NEW_SCHOOLS } from "../lib/cfbd-teams";

const [cache] = process.argv.slice(2);
if (!cache) { console.error("usage: tsx scripts/import-ranked-wins.ts <gamesCacheDir>"); process.exit(1); }
const KEY: Record<string, string> = { Alabama: "ALA", Arkansas: "ARK", Auburn: "AUB", Florida: "FLA", Georgia: "UGA", Kentucky: "UK", LSU: "LSU",
  "Mississippi State": "MSST", Missouri: "MIZ", Oklahoma: "OU", "Ole Miss": "MISS", "South Carolina": "SC", Tennessee: "TENN", Texas: "TEX",
  "Texas A&M": "TAMU", Vanderbilt: "VAN", ...NEW_SCHOOLS };
type Poll = { seasonType: string; week: number; polls: { poll: string; ranks: { rank: number; school: string }[] }[] };
type G = { id: number; season: number; week: number; seasonType: string; startDate: string; homeTeam: string; awayTeam: string; homePoints: number | null; awayPoints: number | null; completed?: boolean };
const ap = new Map<string, Map<string, number>>(), lastReg = new Map<number, number>();
for (let y = 2000; y <= 2025; y++) for (const w of JSON.parse(fs.readFileSync(path.join(cache, "rankings", `${y}.json`), "utf8")) as Poll[]) {
  const p = w.polls.find(x => x.poll === "AP Top 25"); if (!p || w.seasonType !== "regular") continue;
  ap.set(`${y}|${w.week}`, new Map(p.ranks.map(r => [r.school, r.rank]))); lastReg.set(y, Math.max(lastReg.get(y) ?? 0, w.week));
}
const games = new Map<number, G>();
for (const f of fs.readdirSync(path.join(cache, "games"))) for (const g of JSON.parse(fs.readFileSync(path.join(cache, "games", f), "utf8")) as G[])
  if (g.homePoints != null && g.awayPoints != null && g.season <= 2025) games.set(g.id, g);
const out: Record<string, { from: number; wins: { season: number; date: string; opp: string; rank: number; score: string }[] }> = {};
for (const [team, k] of Object.entries(KEY)) {
  const mine = [...games.values()].filter(g => g.homeTeam === team || g.awayTeam === team);
  let from = 2000;
  for (let y = 2000; y <= 2025; y++) if (y !== 2020 && mine.filter(g => g.season === y).length < 10) from = y + 1; // 2020 was a short season everywhere
  const wins = mine.filter(g => g.season >= from).flatMap(g => {
    const home = g.homeTeam === team, us = home ? g.homePoints! : g.awayPoints!, them = home ? g.awayPoints! : g.homePoints!, opp = home ? g.awayTeam : g.homeTeam;
    const rank = ap.get(`${g.season}|${g.seasonType === "regular" ? g.week : lastReg.get(g.season)}`)?.get(opp);
    return us > them && rank ? [{ season: g.season, date: g.startDate.slice(0, 10), opp, rank, score: `${us}–${them}` }] : [];
  }).sort((x, y) => x.date.localeCompare(y.date));
  out[k] = { from, wins };
}
fs.writeFileSync("data/ranked-wins.json", JSON.stringify({ source: "CollegeFootballData /games and /rankings (AP Top 25 in force that week; bowls use the last regular-season poll), 2000–2025, fetched 2026-11-23", schools: out }) + "\n");
for (const k of ["ALA", "AUB", "LOU", "UK", "MICH", "OSU"]) console.log(k, "from", out[k].from, "ranked wins:", out[k].wins.length, "since 2015:", out[k].wins.filter(w => w.season >= 2015).length);
