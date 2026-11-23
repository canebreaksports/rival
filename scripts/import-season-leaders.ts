// Builds data/season-leaders.json: every notable rushing/receiving season (2012–2025) for all 16 SEC schools,
// from the CollegeFootballData season cache (fetch-cfbd.ts). Used by "which school had more X-yard seasons" questions.
//
//   npx tsx scripts/import-season-leaders.ts <cfbdSeasonCacheDir>
//
// CFBD season stats are complete from 2011 on, so windows start in 2012 or later.
// Each row gets a margin: 50 yards by default; 250 if the player's CFBD numbers are known to be off
// (career total far from the school record book), so no count hinges on a value that could be wrong.
import fs from "node:fs";
import path from "node:path";
import type { PlayerSeason } from "../lib/types";
import { NEW_SCHOOLS } from "../lib/cfbd-teams";

const [cache] = process.argv.slice(2);
if (!cache) { console.error("usage: tsx scripts/import-season-leaders.ts <cfbdSeasonCacheDir>"); process.exit(1); }
const KEY: Record<string, string> = {
  Alabama: "ALA", Arkansas: "ARK", Auburn: "AUB", Florida: "FLA", Georgia: "UGA", Kentucky: "UK", LSU: "LSU",
  "Mississippi State": "MSST", Missouri: "MIZ", Oklahoma: "OU", "Ole Miss": "MISS", "South Carolina": "SC",
  Tennessee: "TENN", Texas: "TEX", "Texas A&M": "TAMU", Vanderbilt: "VAN",
};
Object.assign(KEY, NEW_SCHOOLS); // non-SEC rivalry schools (lib/cfbd-teams.ts)
const nkey = (n: string) => n.toLowerCase().replace(/[’'.]/g, "").replace(/\b(jr|sr|ii|iii|iv)\b/g, "").replace(/\s+/g, " ").trim();
type Row = { season: number; playerId: string; player: string; position?: string; team: string; category: string; statType: string; stat: string };
const rows: Row[] = fs.readdirSync(cache).flatMap(f => JSON.parse(fs.readFileSync(path.join(cache, f), "utf8")));
const players = JSON.parse(fs.readFileSync("data/players.json", "utf8")) as { seasons: PlayerSeason[] };

export interface LeaderSeason { name: string; season: number; rush: number; rec: number; margin: number; pos?: string }
const out: Record<string, LeaderSeason[]> = {};
const agg = new Map<string, LeaderSeason & { school: string }>();
for (const r of rows) {
  const k = KEY[r.team];
  if (!k || r.season < 2012 || r.season > 2025 || r.statType !== "YDS" || (r.category !== "rushing" && r.category !== "receiving")) continue;
  const id = `${k}|${r.playerId}|${r.season}`;
  const a = agg.get(id) ?? { name: r.player, school: k, season: r.season, rush: 0, rec: 0, margin: 50, ...(r.position && r.position !== "?" ? { pos: r.position } : {}) };
  a[r.category === "rushing" ? "rush" : "rec"] = Number(r.stat) || 0;
  agg.set(id, a);
}
let flagged = 0, checked = 0;
for (const a of agg.values()) {
  if (a.rush < 300 && a.rec < 300) continue;
  // cross-check against our other sources (Sports Reference / Wikipedia / record-book-aligned rows) where they overlap
  const mine = players.seasons.filter(s => s.school === a.school && s.year === a.season && nkey(s.name) === nkey(a.name));
  for (const s of mine) {
    if (!s.verified) { a.margin = 250; flagged++; }
    else if (!s.source.startsWith("CollegeFootballData")) {
      checked++;
      for (const f of ["rush", "rec"] as const) if (s[f] != null && Math.abs((s[f] ?? 0) - a[f]) > 50) { a.margin = 250; flagged++; }
    }
  }
  (out[a.school] ??= []).push({ name: a.name, season: a.season, rush: a.rush, rec: a.rec, margin: a.margin, ...(a.pos ? { pos: a.pos } : {}) });
}
for (const k of Object.keys(out)) out[k].sort((x, y) => x.season - y.season || y.rush + y.rec - (x.rush + x.rec));
fs.writeFileSync("data/season-leaders.json", JSON.stringify({
  source: "CollegeFootballData API /stats/player/season, 2012–2025 (complete from 2011), fetched 2026-11-17. Rows cross-checked against Sports Reference / Wikipedia seasons where they overlap; rows that disagree or belong to players with known CFBD errors get a 250-yard margin",
  from: 2012, to: 2025, schools: out,
}) + "\n");
console.log(`${Object.values(out).flat().length} seasons over ${Object.keys(out).length} schools; ${checked} cross-checked against other sources, ${flagged} given a wide margin`);
