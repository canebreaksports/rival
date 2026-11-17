// Builds data/rivalry.json from the CollegeFootballData game cache (fetch-cfbd-games.ts):
// every game between two current SEC schools (2000–2025), each game's top performers (2012–2025 box scores),
// and each player's totals in games against that opponent.
//
//   npx tsx scripts/import-rivalry.ts <cacheDir>
//
// Checks: a box score is kept only if both teams' points in it match the game result.
import fs from "node:fs";
import path from "node:path";

const [cache] = process.argv.slice(2);
if (!cache) { console.error("usage: tsx scripts/import-rivalry.ts <cacheDir>"); process.exit(1); }
const KEY: Record<string, string> = {
  Alabama: "ALA", Arkansas: "ARK", Auburn: "AUB", Florida: "FLA", Georgia: "UGA", Kentucky: "UK", LSU: "LSU",
  "Mississippi State": "MSST", Missouri: "MIZ", Oklahoma: "OU", "Ole Miss": "MISS", "South Carolina": "SC",
  Tennessee: "TENN", Texas: "TEX", "Texas A&M": "TAMU", Vanderbilt: "VAN",
};
type Game = { id: number; season: number; seasonType: string; startDate: string; neutralSite: boolean; homeTeam: string; awayTeam: string; homePoints: number | null; awayPoints: number | null; venue: string | null; completed: boolean };
type Box = { id: number; teams: { team: string; points: number; categories: { name: string; types: { name: string; athletes: { name: string; stat: string }[] }[] }[] }[] };
export interface Perf { name: string; cat: "rush" | "rec" | "pass"; yds: number; td: number; n?: number }
export interface TeamLine { total: number; rush: number; pass: number; to: number }
export interface RivalryGame { season: number; date: string; home: string; away: string; hp: number; ap: number; venue: string; neutral?: boolean; bowl?: boolean; box?: Record<string, Perf[]>; team?: Record<string, TeamLine> }
export interface VsTotal { name: string; school: string; games: number; rush: number; rushTD: number; car: number; rec: number; recTD: number; recN: number }

const read = <T>(dir: string): T[] => fs.readdirSync(path.join(cache, dir)).flatMap(f => JSON.parse(fs.readFileSync(path.join(cache, dir, f), "utf8")) as T[]);
const games = new Map<number, Game>();
for (const g of read<Game>("games")) if (KEY[g.homeTeam] && KEY[g.awayTeam] && g.completed && g.homePoints != null && g.awayPoints != null && g.season <= 2025) games.set(g.id, g);
type TeamBox = { id: number; teams: { team: string; points: number; stats: { category: string; stat: string }[] }[] };
const teamBoxes = new Map<number, TeamBox>();
for (const t of read<TeamBox>("teams")) if (games.has(t.id)) teamBoxes.set(t.id, t);
const boxes = new Map<number, Box>();
for (const b of read<Box>("box")) if (games.has(b.id)) boxes.set(b.id, b);

// local calendar date of kickoff (US Central), not the UTC date
const localDate = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

const pairs: Record<string, { games: RivalryGame[]; vs: VsTotal[] }> = {};
let boxKept = 0, boxRejected = 0, teamKept = 0;
for (const g of [...games.values()].sort((x, y) => x.startDate.localeCompare(y.startDate))) {
  const h = KEY[g.homeTeam], a = KEY[g.awayTeam], key = [h, a].sort().join("|");
  const rg: RivalryGame = { season: g.season, date: localDate(g.startDate), home: h, away: a, hp: g.homePoints!, ap: g.awayPoints!, venue: g.venue ?? "",
    ...(g.neutralSite ? { neutral: true } : {}), ...(g.seasonType === "postseason" ? { bowl: true } : {}) };
  const b = boxes.get(g.id);
  const vsAdd: VsTotal[] = [];
  if (b) {
    const pts = Object.fromEntries(b.teams.map(t => [KEY[t.team], t.points]));
    if (pts[h] !== g.homePoints || pts[a] !== g.awayPoints) boxRejected++;
    else {
      boxKept++;
      rg.box = {};
      for (const t of b.teams) {
        const k = KEY[t.team], stat = (cat: string, type: string) => new Map(t.categories.find(c => c.name === cat)?.types.find(x => x.name === type)?.athletes.map(x => [x.name, x.stat]) ?? []);
        const rushY = stat("rushing", "YDS"), rushT = stat("rushing", "TD"), car = stat("rushing", "CAR");
        const recY = stat("receiving", "YDS"), recT = stat("receiving", "TD"), recN = stat("receiving", "REC");
        const passY = stat("passing", "YDS"), passT = stat("passing", "TD");
        const num = (m: Map<string, string>, n: string) => Number(m.get(n) ?? 0) || 0;
        const top = (m: Map<string, string>, n: number) => [...m.keys()].filter(x => !/^team$/i.test(x)).sort((x, y) => num(m, y) - num(m, x)).slice(0, n);
        rg.box[k] = [
          ...top(rushY, 3).map(n => ({ name: n, cat: "rush" as const, yds: num(rushY, n), td: num(rushT, n), n: num(car, n) })),
          ...top(recY, 4).map(n => ({ name: n, cat: "rec" as const, yds: num(recY, n), td: num(recT, n), n: num(recN, n) })),
          ...top(passY, 2).map(n => ({ name: n, cat: "pass" as const, yds: num(passY, n), td: num(passT, n) })),
        ];
        // totals vs this opponent use every player in the box, not just the top performers
        for (const n of new Set([...rushY.keys(), ...recY.keys()])) {
          if (/^team$/i.test(n)) continue;
          vsAdd.push({ name: n, school: k, games: 1, rush: num(rushY, n), rushTD: num(rushT, n), car: num(car, n), rec: num(recY, n), recTD: num(recT, n), recN: num(recN, n) });
        }
      }
    }
  }
  // team totals (total / rushing / passing yards, turnovers), kept only when the points match the result
  const tb = teamBoxes.get(g.id);
  if (tb && tb.teams.length === 2 && tb.teams.every(t => t.points === (KEY[t.team] === h ? g.homePoints : g.awayPoints))) {
    rg.team = {};
    for (const t of tb.teams) {
      const st = Object.fromEntries(t.stats.map(x => [x.category, Number(x.stat)]));
      if ([st.totalYards, st.rushingYards, st.netPassingYards].some(v => !Number.isFinite(v))) { delete rg.team; break }
      rg.team[KEY[t.team]] = { total: st.totalYards, rush: st.rushingYards, pass: st.netPassingYards, to: Number.isFinite(st.turnovers) ? st.turnovers : 0 };
    }
    if (rg.team) teamKept++;
  }
  const p = (pairs[key] ??= { games: [], vs: [] });
  p.games.push(rg);
  for (const v of vsAdd) {
    const ex = p.vs.find(x => x.name === v.name && x.school === v.school);
    if (!ex) p.vs.push(v);
    else for (const f of ["games", "rush", "rushTD", "car", "rec", "recTD", "recN"] as const) ex[f] += v[f];
  }
}
// keep only notable vs-opponent totals
for (const p of Object.values(pairs)) p.vs = p.vs.filter(v => v.rush >= 100 || v.rec >= 100 || v.rushTD + v.recTD >= 2).sort((x, y) => y.rush + y.rec - (x.rush + x.rec));

const out = {
  source: "CollegeFootballData API: /games (results 2000–2025), /games/players and /games/teams (box scores 2012–2025), fetched 2026-11-17. Results are on-field scores. Box scores are play-by-play derived; kept only when both teams' points match the result",
  boxFrom: 2012,
  pairs,
};
fs.writeFileSync("data/rivalry.json", JSON.stringify(out) + "\n");
const nGames = Object.values(pairs).reduce((s, p) => s + p.games.length, 0);
console.log(`${Object.keys(pairs).length} pairs, ${nGames} games, box scores kept ${boxKept}, rejected ${boxRejected}, team totals ${teamKept}; ${(fs.statSync("data/rivalry.json").size / 1024).toFixed(0)} KB`);
const lt = pairs["LSU|TENN"];
console.log("LSU|TENN:", lt.games.map(g => `${g.season} ${g.away} ${g.ap} @ ${g.home} ${g.hp}${g.bowl ? " (bowl)" : ""}${g.box ? " ✓box" : ""}`).join("; "));
console.log("  top vs:", lt.vs.slice(0, 5).map(v => `${v.name} (${v.school}) ${v.rush}r/${v.rec}rec in ${v.games}g`).join("; "));
