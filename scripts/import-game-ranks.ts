// AP ranks going into every rivalry game (2000–2025): data/game-ranks.json, pair -> [{season, date, ranks: {school: rank|null}}].
//   npx tsx scripts/import-game-ranks.ts <gamesCacheDir>     (games/ and rankings/ from the CFBD fetchers)
// CFBD's poll "week N" is the poll in force for week N games (checked: 2006 week 12 has Ohio State 1, Michigan 2 before
// their week-12 game). Bowl and championship games use the last regular-season poll. A game whose poll is missing
// starts that pair's window after it, so "since <year>" claims are complete.
import fs from "node:fs";
import path from "node:path";
import { NEW_SCHOOLS } from "../lib/cfbd-teams";
// Central-time game day, the same convention as data/rivalry.json (a night kickoff's UTC timestamp rolls past midnight)
const localDate = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

const [cache] = process.argv.slice(2);
if (!cache) { console.error("usage: tsx scripts/import-game-ranks.ts <gamesCacheDir>"); process.exit(1); }
const KEY: Record<string, string> = { Alabama: "ALA", Arkansas: "ARK", Auburn: "AUB", Florida: "FLA", Georgia: "UGA", Kentucky: "UK", LSU: "LSU",
  "Mississippi State": "MSST", Missouri: "MIZ", Oklahoma: "OU", "Ole Miss": "MISS", "South Carolina": "SC", Tennessee: "TENN", Texas: "TEX",
  "Texas A&M": "TAMU", Vanderbilt: "VAN", ...NEW_SCHOOLS };
type Poll = { season: number; seasonType: string; week: number; polls: { poll: string; ranks: { rank: number; school: string }[] }[] };
type G = { season: number; week: number; seasonType: string; startDate: string; homeTeam: string; awayTeam: string; homePoints: number | null; awayPoints: number | null };

const ap = new Map<string, Map<string, number>>(), lastReg = new Map<number, number>();
for (let y = 2000; y <= 2025; y++) for (const w of JSON.parse(fs.readFileSync(path.join(cache, "rankings", `${y}.json`), "utf8")) as Poll[]) {
  const p = w.polls.find(x => x.poll === "AP Top 25");
  if (!p || w.seasonType !== "regular") continue;
  ap.set(`${y}|${w.week}`, new Map(p.ranks.map(r => [r.school, r.rank])));
  lastReg.set(y, Math.max(lastReg.get(y) ?? 0, w.week));
}
const games = new Map<string, G>();
for (const f of fs.readdirSync(path.join(cache, "games"))) for (const g of JSON.parse(fs.readFileSync(path.join(cache, "games", f), "utf8")) as G[])
  if (KEY[g.homeTeam] && KEY[g.awayTeam] && g.homePoints != null && g.season <= 2025) games.set(`${g.startDate}|${g.homeTeam}|${g.awayTeam}`, g);

const out: Record<string, { from: number; games: { season: number; date: string; ranks: Record<string, number | null> }[] }> = {};
for (const g of [...games.values()].sort((x, y) => x.startDate.localeCompare(y.startDate))) {
  const h = KEY[g.homeTeam], a = KEY[g.awayTeam], pk = [h, a].sort().join("|"), P = (out[pk] ??= { from: 2000, games: [] });
  const poll = ap.get(`${g.season}|${g.seasonType === "regular" ? g.week : lastReg.get(g.season)}`);
  if (!poll) { P.from = g.season + 1; P.games = []; continue } // no poll for this game: start the window after it
  P.games.push({ season: g.season, date: localDate(g.startDate), ranks: { [h]: poll.get(g.homeTeam) ?? null, [a]: poll.get(g.awayTeam) ?? null } });
}
fs.writeFileSync("data/game-ranks.json", JSON.stringify({ source: "CollegeFootballData /rankings (AP Top 25, poll in force for the game's week; bowls use the last regular-season poll) and /games, 2000–2025, fetched 2026-11-23", pairs: out }) + "\n");
const show = (k: string) => { const p = out[k]; console.log(k, "from", p.from, p.games.filter(x => Object.values(x.ranks).some(r => r !== null && r <= 5)).map(x => `${x.season}:${Object.entries(x.ranks).map(([s, r]) => s + (r ?? "-")).join("/")}`).join(" ")) };
["ALA|LSU", "ALA|AUB", "MICH|OSU", "FLA|FSU", "CLEM|SC"].forEach(show);
