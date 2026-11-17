// Builds player packs from the CollegeFootballData cache (see fetch-cfbd.ts) into data/players.json.
//
//   npx tsx scripts/import-cfbd.ts <cacheDir> [--dry]
//
// Rules (CFBD season stats are play-by-play derived and incomplete before 2011):
//   - only players whose first season at the school is 2012 or later, so every season (and the peak) is present
//   - seasons 2012–2025 only; players with a 2026 row at the school are active and skipped (totals still changing)
//   - 8–11 players per school, chosen by role so upsets and traps have material (see pickPack)
// Existing players for the school are replaced; schools not listed here (Sports Reference packs) are untouched.
import fs from "node:fs";
import path from "node:path";
import type { PlayerSeason, Player, Pos } from "../lib/types";

const [cache, ...flags] = process.argv.slice(2);
const DRY = flags.includes("--dry");
export const CFBD_SOURCE = "CollegeFootballData API (api.collegefootballdata.com/stats/player/season), fetched 2026-11-17. Play-by-play derived; can differ from official totals by a few yards";
const TEAMS: Record<string, string> = {
  FLA: "Florida", VAN: "Vanderbilt", MIZ: "Missouri", UK: "Kentucky", OU: "Oklahoma", TAMU: "Texas A&M",
  UGA: "Georgia", SC: "South Carolina", TEX: "Texas", ARK: "Arkansas", MISS: "Ole Miss", MSST: "Mississippi State",
};
// Well-known names (fame is a judgment call, not a stat). Only used if the player is in the pack.
const STARS = new Set(["Nick Chubb", "Todd Gurley", "Sony Michel", "D'Andre Swift", "Kenny McIntosh", "Stetson Bennett", "Brock Bowers",
  "Kyle Pitts", "Kadarius Toney", "Anthony Richardson", "Kyle Trask", "Bijan Robinson", "Jonathan Gray", "Sam Ehlinger", "Quinn Ewers",
  "Johnny Manziel", "Mike Evans", "Kyler Murray", "Baker Mayfield", "Jalen Hurts", "Samaje Perine", "Joe Mixon", "CeeDee Lamb",
  "Marquise Brown", "Kendall Briles", "Darren McFadden", "Alex Collins", "Rashod Bateman", "KJ Jefferson", "Raheim Sanders",
  "Benny Snell Jr.", "Chris Rodriguez Jr.", "Lynn Bowden Jr.", "Will Levis", "Ray Davis", "Drew Lock", "Kelly Bryant", "Cody Schrader",
  "Marcus Lattimore", "Mike Davis", "Deebo Samuel", "Jaycee Horn", "Spencer Rattler", "Dak Prescott", "Josh Robinson", "Kylin Hill",
  "Chad Kelly", "Matt Corral", "Jaxson Dart", "Quinshon Judkins", "A.J. Brown", "D.K. Metcalf", "Ralph Webb", "Zac Stacy",
  "Jerron Seymour", "Trayveon Williams", "Isaiah Spiller", "Christian Kirk", "Devon Achane", "Dameon Pierce"]);

type Row = { season: number; playerId: string; player: string; position: string; team: string; category: string; statType: string; stat: string };
const rows: Row[] = fs.readdirSync(cache).flatMap(f => JSON.parse(fs.readFileSync(path.join(cache, f), "utf8")));

const posOf = (p: string): Pos | null => (p === "FB" ? "RB" : (["RB", "QB", "WR", "TE"] as string[]).includes(p) ? (p as Pos) : null);
type Agg = { id: string; name: string; school: string; pos: Pos | null; seasons: Map<number, PlayerSeason>; years: Set<number> };

function aggregate(key: string, team: string): Agg[] {
  const by = new Map<string, Agg>();
  for (const r of rows) {
    if (r.team !== team) continue;
    const a = by.get(r.playerId) ?? { id: r.playerId, name: r.player, school: key, pos: posOf(r.position), seasons: new Map(), years: new Set() };
    by.set(r.playerId, a);
    a.years.add(r.season);
    if (r.season < 2012 || r.season > 2025 || (r.category !== "rushing" && r.category !== "receiving")) continue;
    const s = a.seasons.get(r.season) ?? ({ name: r.player, school: key, year: r.season, source: CFBD_SOURCE, verified: true } as PlayerSeason);
    a.seasons.set(r.season, s);
    const v = Number(r.stat);
    const map: Record<string, keyof PlayerSeason> = { "rushing.YDS": "rush", "rushing.TD": "rushTD", "rushing.CAR": "att", "receiving.YDS": "rec", "receiving.TD": "recTD", "receiving.REC": "recN" };
    const k = map[`${r.category}.${r.statType}`];
    if (k) (s as unknown as Record<string, number>)[k] = v;
  }
  return [...by.values()].filter(a => a.pos && Math.min(...a.years) >= 2012 && !a.years.has(2026) && a.seasons.size);
}

const sum = (a: Agg, k: keyof PlayerSeason) => [...a.seasons.values()].reduce((t, s) => t + ((s[k] as number) ?? 0), 0);

function pickPack(all: Agg[]): Agg[] {
  const out: Agg[] = [], has = (a: Agg) => out.includes(a);
  const take = (list: Agg[], n: number) => list.filter(a => !has(a)).slice(0, n).forEach(a => out.push(a));
  const sorted = (pos: Pos, k: keyof PlayerSeason, min: number) => all.filter(a => a.pos === pos && sum(a, k) >= min).sort((x, y) => sum(y, k) - sum(x, k));
  take(sorted("RB", "rush", 1000), 4);                                       // featured backs
  take(sorted("QB", "rush", 300), 2);                                        // running quarterbacks
  take(sorted("WR", "rec", 800), 2);                                         // top receivers
  take(all.filter(a => a.pos === "WR" && sum(a, "att") >= 5).sort((x, y) => sum(y, "rush") / sum(y, "att") - sum(x, "rush") / sum(x, "att")), 1); // WR with carries (YPC upsets)
  take(sorted("TE", "recTD", 3), 1);                                         // tight end
  take(all.filter(a => a.pos === "RB").sort((x, y) => sum(y, "recN") - sum(x, "recN")), 1); // pass-catching back
  return out;
}

const file = path.join(process.cwd(), "data", "players.json");
const data = JSON.parse(fs.readFileSync(file, "utf8")) as { players: Player[]; seasons: PlayerSeason[] };
for (const [key, team] of Object.entries(TEAMS)) {
  const pack = pickPack(aggregate(key, team));
  data.players = data.players.filter(p => p.school !== key);
  data.seasons = data.seasons.filter(s => s.school !== key);
  for (const a of pack) {
    data.players.push({ name: a.name, school: key, pos: a.pos!, ...(STARS.has(a.name) ? { star: true } : {}) });
    const seas = [...a.seasons.values()].sort((x, y) => (x.year as number) - (y.year as number));
    for (const s of seas) if (s.rush != null || s.rec != null) {
      if (a.pos === "RB" && s.rush != null) s.scrim = (s.rush ?? 0) + (s.rec ?? 0);
      data.seasons.push(s);
    }
    const car: PlayerSeason = { name: a.name, school: key, year: "career", source: CFBD_SOURCE + " (sum of seasons at this school)", verified: true };
    for (const k of ["rush", "rushTD", "att", "rec", "recN", "recTD"] as const) if (seas.some(s => s[k] != null)) car[k] = sum(a, k);
    if (a.pos === "RB" && car.rush != null) car.scrim = (car.rush ?? 0) + (car.rec ?? 0);
    data.seasons.push(car);
  }
  console.log(`${key.padEnd(4)} ${pack.map(a => `${a.name} (${a.pos}${STARS.has(a.name) ? "★" : ""}, ${a.seasons.size} yrs, ${sum(a, "rush")} rush/${sum(a, "rec")} rec)`).join("; ")}`);
}
if (!DRY) { fs.writeFileSync(file, JSON.stringify(data, null, 1) + "\n"); console.log("wrote data/players.json") }
