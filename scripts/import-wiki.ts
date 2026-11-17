// Imports player college stats from Wikipedia articles (college statistics tables) into data/players.json.
//
//   npx tsx scripts/import-wiki.ts <cacheDir> [--dry]
//
// Targets: data/wiki-targets.json. Articles are fetched through the MediaWiki API (paced, cached in <cacheDir>).
// A player is imported only if every check passes:
//   1. a Rushing/Receiving table with rows for the target school is found
//   2. the school's seasons add up to the table's career line (single-school careers), stat by stat
//   3. any season or career row already in players.json agrees exactly (existing verified rows are never overwritten)
// Everything else is reported and skipped, never guessed.
import fs from "node:fs";
import path from "node:path";
import type { PlayerSeason, Player, Pos } from "../lib/types";
import { parseStatsTable, tablesIn, type ParsedRow, type StatName } from "../lib/wikitable";
import { wikiArticle } from "./wiki-fetch";

const [cache, ...flags] = process.argv.slice(2);
if (!cache) { console.error("usage: tsx scripts/import-wiki.ts <cacheDir> [--dry]"); process.exit(1); }
const DRY = flags.includes("--dry");
fs.mkdirSync(cache, { recursive: true });

const TEAM: Record<string, string[]> = {
  ALA: ["Alabama"], ARK: ["Arkansas"], AUB: ["Auburn"], FLA: ["Florida"], UGA: ["Georgia"], UK: ["Kentucky"], LSU: ["LSU"],
  MSST: ["Mississippi State", "Mississippi St.", "Miss. State", "Miss State"], MIZ: ["Missouri"], OU: ["Oklahoma"],
  MISS: ["Ole Miss", "Mississippi"], SC: ["South Carolina"], TENN: ["Tennessee"], TEX: ["Texas"], TAMU: ["Texas A&M"], VAN: ["Vanderbilt"],
};
const isTeam = (school: string, t: string | null) => !!t && TEAM[school].some(n => t.replace(/\s+/g, " ").trim().toLowerCase() === n.toLowerCase());

interface Target { title: string; name: string; school: string; pos: Pos; star?: boolean }
const targets: Target[] = JSON.parse(fs.readFileSync("data/wiki-targets.json", "utf8")).targets;

const STATS: StatName[] = ["rush", "rushTD", "att", "rec", "recTD", "recN"];
type Outcome = { name: string; school: string; status: "imported" | "skipped"; detail: string };

async function main() {
  const data = JSON.parse(fs.readFileSync("data/players.json", "utf8")) as { players: Player[]; seasons: PlayerSeason[] };
  const careerLists = JSON.parse(fs.readFileSync("data/career-rushing.json", "utf8")) as Record<string, { list: { name: string; yards: number }[] }>;
  const report: Outcome[] = [];
  for (const t of targets) {
    const skip = (detail: string) => report.push({ name: t.name, school: t.school, status: "skipped", detail });
    const a = await wikiArticle(cache, t.title);
    if (!a) { skip("no Wikipedia article found"); continue; }

    // 1. find the school's rows
    let rows: ParsedRow[] | null = null, hasTeam = false;
    for (const tb of tablesIn(a.wikitext)) {
      const p = parseStatsTable(tb);
      if (!p) continue;
      const mine = p.rows.filter(r => r.year !== "career" && isTeam(t.school, r.team));
      if (mine.length) { rows = p.rows; hasTeam = p.hasTeamColumn; break; }
    }
    if (!rows) { skip("no college Rushing/Receiving table with rows for this school"); continue; }
    const seasons = rows.filter(r => r.year !== "career" && isTeam(t.school, r.team));
    const others = rows.filter(r => r.year !== "career" && !isTeam(t.school, r.team));
    const career = rows.find(r => r.year === "career");
    const dupYears = seasons.map(r => r.year).filter((y, i, a) => a.indexOf(y) !== i);
    if (dupYears.length) { skip(`duplicate season rows (${dupYears.join(", ")})`); continue; }

    // 2. seasons must add up to the career line (only meaningful when the whole career was at this school)
    if (!career) { skip("table has no career line to check the seasons against"); continue; }
    if (others.length) { skip(`career includes other teams (${[...new Set(others.map(r => r.team))].join(", ")}); can't check the sum`); continue; }
    const present = STATS.filter(k => career.stats[k] != null);
    const bad = present.filter(k => seasons.reduce((s, r) => s + (r.stats[k] ?? 0), 0) !== career.stats[k]);
    if (!present.includes("rush") && !present.includes("rec")) { skip("no rushing or receiving yards in the table"); continue; }
    if (bad.length) { skip(`seasons don't add up to the career line for ${bad.join(", ")}`); continue; }

    // 3. agree with anything already in the data
    const source = `Wikipedia "${a.title}" college statistics table (revision ${a.revid}), fetched 2026-11-17; seasons checked against the career line`;
    const build = (y: number | "career", st: ParsedRow["stats"]): PlayerSeason => {
      const s: PlayerSeason = { name: t.name, school: t.school, year: y, source, verified: true };
      for (const k of STATS) if (st[k] != null) s[k] = st[k]!;
      if (t.pos === "RB" && s.rush != null && s.rec != null) s.scrim = s.rush + s.rec;
      return s;
    };
    const incoming = [...seasons.map(r => build(r.year as number, r.stats)), build("career", career.stats)];
    const existing = data.seasons.filter(s => s.name === t.name && s.school === t.school);
    const conflicts: string[] = [];
    for (const inc of incoming) {
      const ex = existing.find(s => s.year === inc.year && s.verified);
      if (!ex) continue;
      for (const k of STATS) if (ex[k] != null && inc[k] != null && ex[k] !== inc[k]) conflicts.push(`${inc.year} ${k}: data ${ex[k]} vs Wikipedia ${inc[k]}`);
    }
    // also agree with the school's career rushing list (record book), which School Count questions use
    const cr = careerLists[t.school]?.list.find(x => x.name === t.name);
    if (cr && career.stats.rush != null && cr.yards !== career.stats.rush)
      conflicts.push(`career rushing: ${cr.yards} in the school's career list vs ${career.stats.rush} on Wikipedia`);
    if (conflicts.length) { skip(`disagrees with existing data: ${conflicts.join("; ")}`); continue; }

    // write: keep verified rows, replace unverified ones, add what's missing
    const keep = (y: number | "career") => existing.some(s => s.year === y && s.verified);
    data.seasons = data.seasons.filter(s => !(s.name === t.name && s.school === t.school && !s.verified));
    const added = incoming.filter(s => !keep(s.year));
    data.seasons.push(...added);
    if (!data.players.some(p => p.name === t.name && p.school === t.school))
      data.players.push({ name: t.name, school: t.school, pos: t.pos, ...(t.star ? { star: true } : {}) });
    const c = career.stats;
    report.push({ name: t.name, school: t.school, status: "imported",
      detail: `${seasons.length} seasons (${seasons.map(r => r.year).join(", ")}) + career: ${c.rush ?? "–"} rush yds, ${c.rushTD ?? "–"} rush TD, ${c.rec ?? "–"} rec yds, ${c.recTD ?? "–"} rec TD${added.length < incoming.length ? `; kept ${incoming.length - added.length} existing verified rows` : ""}${hasTeam ? "" : " (no team column)"}` });
  }
  for (const r of report) console.log(`${r.status === "imported" ? "✓" : "✗"} ${r.name} (${r.school}): ${r.detail}`);
  console.log(`\n${report.filter(r => r.status === "imported").length} imported, ${report.filter(r => r.status === "skipped").length} skipped`);
  if (!DRY) { fs.writeFileSync("data/players.json", JSON.stringify(data, null, 1) + "\n"); console.log("wrote data/players.json") }
}
main();
