// Builds data/rivalry.json: every game between two current SEC schools (2000–2025), top performers and team totals
// per game, and each player's totals in games against that opponent.
//
//   npx tsx scripts/import-rivalry.ts <cfbdCacheDir> [espnCacheDir]
//
// Box scores:
//   2012–2025  CollegeFootballData /games/players + /games/teams (kept when both teams' points match the result)
//   2004–2011  ESPN game summaries (keyed by the same game IDs), kept only if
//              1. both teams' points match the result,
//              2. every stat table adds up: players' yards = ESPN's totals row (rushers may exceed it by ≤15 for team
//                 plays, never fall short), and receiving yards = passing yards,
//              3. where CollegeFootballData also has the game, every player in both agrees within the single-game margin.
import fs from "node:fs";
import path from "node:path";

const [cache, espnDir] = process.argv.slice(2);
if (!cache) { console.error("usage: tsx scripts/import-rivalry.ts <cfbdCacheDir> [espnCacheDir]"); process.exit(1); }
const KEY: Record<string, string> = {
  Alabama: "ALA", Arkansas: "ARK", Auburn: "AUB", Florida: "FLA", Georgia: "UGA", Kentucky: "UK", LSU: "LSU",
  "Mississippi State": "MSST", Missouri: "MIZ", Oklahoma: "OU", "Ole Miss": "MISS", "South Carolina": "SC",
  Tennessee: "TENN", Texas: "TEX", "Texas A&M": "TAMU", Vanderbilt: "VAN",
};
const ESPN_KEY = (t: { location?: string; displayName?: string }) => KEY[t.location ?? ""] ?? Object.entries(KEY).find(([n]) => t.displayName?.startsWith(n + " "))?.[1];
type Game = { id: number; season: number; seasonType: string; startDate: string; neutralSite: boolean; homeTeam: string; awayTeam: string; homePoints: number | null; awayPoints: number | null; venue: string | null; completed: boolean };
type CfbdBox = { id: number; teams: { team: string; points: number; categories: { name: string; types: { name: string; athletes: { name: string; stat: string }[] }[] }[] }[] };
type TeamBox = { id: number; teams: { team: string; points: number; stats: { category: string; stat: string }[] }[] };
export interface Perf { name: string; cat: "rush" | "rec" | "pass"; yds: number; td: number; n?: number }
export interface TeamLine { total: number; rush: number; pass: number; to: number }
export interface RivalryGame { season: number; date: string; home: string; away: string; hp: number; ap: number; venue: string; neutral?: boolean; bowl?: boolean; box?: Record<string, Perf[]>; team?: Record<string, TeamLine>; boxSrc?: "cfbd" | "espn" }
export interface VsTotal { name: string; school: string; games: number; rush: number; rushTD: number; car: number; rec: number; recTD: number; recN: number }

// One team's box in a source-neutral shape: player → stats
type Line = { rush?: number; rushTD?: number; car?: number; rec?: number; recTD?: number; recN?: number; pass?: number; passTD?: number };
type TeamPlayers = Map<string, Line>;

const read = <T>(dir: string): T[] => fs.existsSync(path.join(cache, dir)) ? fs.readdirSync(path.join(cache, dir)).flatMap(f => JSON.parse(fs.readFileSync(path.join(cache, dir, f), "utf8")) as T[]) : [];
const nkey = (n: string) => n.toLowerCase().replace(/[’'.]/g, "").replace(/\b(jr|sr|ii|iii|iv)\b/g, "").replace(/\s+/g, " ").trim();
const gameGap = (a: number, b: number) => Math.max(15, 0.12 * Math.max(a, b));

const games = new Map<number, Game>();
for (const g of read<Game>("games")) if (KEY[g.homeTeam] && KEY[g.awayTeam] && g.completed && g.homePoints != null && g.awayPoints != null && g.season <= 2025) games.set(g.id, g);
const cfbdBox = new Map<number, CfbdBox>(), cfbdEarly = new Map<number, CfbdBox>(), teamBoxes = new Map<number, TeamBox>();
for (const b of read<CfbdBox>("box")) if (games.has(b.id)) cfbdBox.set(b.id, b);
for (const b of read<CfbdBox>("box-early")) if (games.has(b.id)) cfbdEarly.set(b.id, b);
for (const t of read<TeamBox>("teams")) if (games.has(t.id)) teamBoxes.set(t.id, t);

function fromCfbd(b: CfbdBox): Record<string, TeamPlayers> {
  const out: Record<string, TeamPlayers> = {};
  for (const t of b.teams) {
    const m: TeamPlayers = new Map(), k = KEY[t.team];
    const put = (cat: string, type: string, f: keyof Line) => t.categories.find(c => c.name === cat)?.types.find(x => x.name === type)?.athletes
      .forEach(a => { if (/^team$/i.test(a.name)) return; const l = m.get(a.name) ?? {}; l[f] = Number(a.stat) || 0; m.set(a.name, l) });
    put("rushing", "YDS", "rush"); put("rushing", "TD", "rushTD"); put("rushing", "CAR", "car");
    put("receiving", "YDS", "rec"); put("receiving", "TD", "recTD"); put("receiving", "REC", "recN");
    put("passing", "YDS", "pass"); put("passing", "TD", "passTD");
    out[k] = m;
  }
  return out;
}

type EspnStat = { name: string; keys: string[]; totals?: string[]; athletes: { athlete: { displayName: string }; stats: string[] }[] };
type Espn = { header: { competitions: { competitors: { team: { location: string; displayName: string }; score: string }[] }[] };
  boxscore: { teams: { team: { location: string; displayName: string }; statistics: { name: string; displayValue: string }[] }[]; players?: { team: { location: string; displayName: string }; statistics: EspnStat[] }[] } };
const reject: Record<string, number> = {};
const no = (why: string) => { reject[why] = (reject[why] ?? 0) + 1; return null };

function fromEspn(id: number, g: Game): { players: Record<string, TeamPlayers>; team: Record<string, { total: number; rush: number; pass: number; to: number }> } | null {
  const file = espnDir && path.join(espnDir, `${id}.json`);
  if (!file || !fs.existsSync(file)) return no("no ESPN summary");
  const j = JSON.parse(fs.readFileSync(file, "utf8")) as Espn;
  const comp = j.header?.competitions?.[0];
  if (!comp || !j.boxscore?.players?.length) return no("ESPN summary has no box score");
  for (const c of comp.competitors) { const k = ESPN_KEY(c.team); const want = k === KEY[g.homeTeam] ? g.homePoints : g.awayPoints; if (!k || Number(c.score) !== want) return no("points don't match the result") }
  const players: Record<string, TeamPlayers> = {}, team: Record<string, TeamLine> = {};
  for (const t of j.boxscore.players) {
    const k = ESPN_KEY(t.team); if (!k) return no("unknown team");
    const m: TeamPlayers = new Map();
    const tbl = (name: string) => t.statistics.find(s => s.name === name);
    // Rushing: players may total up to 15 yards MORE than the team (kneel-downs and botched snaps are charged to the
    // team, not a player), never less (a missing player). Receiving and passing must match exactly.
    const sumOk = (s: EspnStat | undefined, key: string, teamSlack = 0) => {
      if (!s) return true;
      const i = s.keys.indexOf(key); if (i < 0) return false;
      const sum = s.athletes.reduce((a, x) => a + (Number(x.stats[i]) || 0), 0);
      if (!s.totals) return true;
      const d = sum - Number(s.totals[i]);
      return d >= 0 && d <= teamSlack;
    };
    const rush = tbl("rushing"), rec = tbl("receiving"), pass = tbl("passing");
    if (!sumOk(rush, "rushingYards", 15) || !sumOk(rec, "receivingYards") || !sumOk(pass, "passingYards")) return no("players don't add up to the totals row");
    const total = (s: EspnStat | undefined, key: string) => (s?.totals ? Number(s.totals[s.keys.indexOf(key)]) : 0);
    if (rec && pass && total(rec, "receivingYards") !== total(pass, "passingYards")) return no("receiving yards ≠ passing yards");
    const put = (s: EspnStat | undefined, key: string, f: keyof Line) => {
      const i = s?.keys.indexOf(key) ?? -1; if (!s || i < 0) return;
      for (const a of s.athletes) { const n = a.athlete.displayName; if (/^team$/i.test(n)) continue; const l = m.get(n) ?? {}; l[f] = Number(a.stats[i]) || 0; m.set(n, l) }
    };
    put(rush, "rushingYards", "rush"); put(rush, "rushingTouchdowns", "rushTD"); put(rush, "rushingAttempts", "car");
    put(rec, "receivingYards", "rec"); put(rec, "receivingTouchdowns", "recTD"); put(rec, "receptions", "recN");
    put(pass, "passingYards", "pass"); put(pass, "passingTouchdowns", "passTD");
    players[k] = m;
  }
  for (const t of j.boxscore.teams) {
    const k = ESPN_KEY(t.team), st = Object.fromEntries(t.statistics.map(s => [s.name, Number(s.displayValue)]));
    if (k && [st.totalYards, st.rushingYards, st.netPassingYards].every(Number.isFinite)) team[k] = { total: st.totalYards, rush: st.rushingYards, pass: st.netPassingYards, to: Number.isFinite(st.turnovers) ? st.turnovers : 0 };
  }
  // 3. cross-check against CollegeFootballData's (partial) early box score where both have the player
  const cb = cfbdEarly.get(id);
  if (cb) {
    const c = fromCfbd(cb);
    for (const [k, m] of Object.entries(players)) for (const [n, l] of m) {
      const other = [...(c[k]?.entries() ?? [])].find(([cn]) => nkey(cn) === nkey(n))?.[1];
      if (!other) continue;
      for (const f of ["rush", "rec", "pass"] as const) if (l[f] != null && other[f] != null && Math.abs(l[f]! - other[f]!) >= gameGap(l[f]!, other[f]!))
        return no("disagrees with CollegeFootballData");
    }
  }
  return { players, team: Object.keys(team).length === 2 ? team : {} };
}

const localDate = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const pairs: Record<string, { games: RivalryGame[]; vs: VsTotal[]; vsFrom?: number }> = {};
const lines = new Map<RivalryGame, Record<string, TeamPlayers>>();
const tally = { cfbd: 0, espn: 0, cfbdRejected: 0 };

for (const g of [...games.values()].sort((x, y) => x.startDate.localeCompare(y.startDate))) {
  const h = KEY[g.homeTeam], a = KEY[g.awayTeam], key = [h, a].sort().join("|");
  const rg: RivalryGame = { season: g.season, date: localDate(g.startDate), home: h, away: a, hp: g.homePoints!, ap: g.awayPoints!, venue: g.venue ?? "",
    ...(g.neutralSite ? { neutral: true } : {}), ...(g.seasonType === "postseason" ? { bowl: true } : {}) };
  let players: Record<string, TeamPlayers> | null = null;
  if (g.season >= 2012) {
    const b = cfbdBox.get(g.id);
    if (b) {
      const pts = Object.fromEntries(b.teams.map(t => [KEY[t.team], t.points]));
      if (pts[h] === g.homePoints && pts[a] === g.awayPoints) { players = fromCfbd(b); rg.boxSrc = "cfbd"; tally.cfbd++ } else tally.cfbdRejected++;
    }
    const tb = teamBoxes.get(g.id);
    if (players && tb && tb.teams.length === 2 && tb.teams.every(t => t.points === (KEY[t.team] === h ? g.homePoints : g.awayPoints))) {
      const team: Record<string, TeamLine> = {};
      for (const t of tb.teams) {
        const st = Object.fromEntries(t.stats.map(x => [x.category, Number(x.stat)]));
        if ([st.totalYards, st.rushingYards, st.netPassingYards].every(Number.isFinite))
          team[KEY[t.team]] = { total: st.totalYards, rush: st.rushingYards, pass: st.netPassingYards, to: Number.isFinite(st.turnovers) ? st.turnovers : 0 };
      }
      if (Object.keys(team).length === 2) rg.team = team;
    }
  } else if (g.season >= 2004) {
    const e = fromEspn(g.id, g);
    if (e) { players = e.players; if (Object.keys(e.team).length === 2) rg.team = e.team; rg.boxSrc = "espn"; tally.espn++ }
  }
  const p = (pairs[key] ??= { games: [], vs: [] });
  if (players) {
    rg.box = {};
    for (const [k, m] of Object.entries(players)) {
      const list = [...m.entries()];
      const top = (f: keyof Line, n: number) => list.filter(([, l]) => l[f] != null).sort((x, y) => (y[1][f] ?? 0) - (x[1][f] ?? 0)).slice(0, n);
      rg.box[k] = [
        ...top("rush", 3).map(([name, l]) => ({ name, cat: "rush" as const, yds: l.rush!, td: l.rushTD ?? 0, n: l.car ?? 0 })),
        ...top("rec", 4).map(([name, l]) => ({ name, cat: "rec" as const, yds: l.rec!, td: l.recTD ?? 0, n: l.recN ?? 0 })),
        ...top("pass", 2).map(([name, l]) => ({ name, cat: "pass" as const, yds: l.pass!, td: l.passTD ?? 0 })),
      ];
    }
    lines.set(rg, players);
  }
  p.games.push(rg);
}

// Totals against each other are only true for a span where EVERY game has a box score. Per pair, find the earliest
// season from which that holds (vsFrom), and only total games from then on. Prompts state that season.
for (const p of Object.values(pairs)) {
  const gs = p.games;
  let from: number | null = null;
  for (let i = gs.length - 1; i >= 0; i--) { if (!gs[i].box) break; from = gs[i].season }
  p.vsFrom = from ?? undefined;
  for (const g of gs) {
    if (from == null || g.season < from) continue;
    for (const [k, m] of Object.entries(lines.get(g)!)) for (const [name, l] of m) {
      if (l.rush == null && l.rec == null) continue;
      const ex = p.vs.find(x => nkey(x.name) === nkey(name) && x.school === k);
      const v = ex ?? { name, school: k, games: 0, rush: 0, rushTD: 0, car: 0, rec: 0, recTD: 0, recN: 0 };
      v.games++; v.rush += l.rush ?? 0; v.rushTD += l.rushTD ?? 0; v.car += l.car ?? 0; v.rec += l.rec ?? 0; v.recTD += l.recTD ?? 0; v.recN += l.recN ?? 0;
      if (!ex) p.vs.push(v);
    }
  }
  p.vs = p.vs.filter(v => v.rush >= 100 || v.rec >= 100 || v.rushTD + v.recTD >= 2).sort((x, y) => y.rush + y.rec - (x.rush + x.rec));
}

const boxFrom = tally.espn ? 2004 : 2012;
const out = {
  source: "Results 2000–2025: CollegeFootballData /games (on-field scores). Box scores 2012–2025: CollegeFootballData /games/players and /games/teams (play-by-play derived; kept when points match). Box scores 2004–2011: ESPN game summaries, kept when points match, every stat table adds up, and players agree with CollegeFootballData within the single-game margin. Fetched 2026-11-17",
  boxFrom,
  pairs,
};
fs.writeFileSync("data/rivalry.json", JSON.stringify(out) + "\n");
const nGames = Object.values(pairs).reduce((s, p) => s + p.games.length, 0);
console.log(`${Object.keys(pairs).length} pairs, ${nGames} games. Box scores: ${tally.cfbd} CollegeFootballData (2012+, ${tally.cfbdRejected} rejected), ${tally.espn} ESPN (2004–2011). ${(fs.statSync("data/rivalry.json").size / 1024).toFixed(0)} KB`);
if (Object.keys(reject).length) console.log("ESPN games skipped:", Object.entries(reject).map(([k, v]) => `${v} ${k}`).join(", "));
