// Caches ESPN game summaries (box scores) for games between current SEC schools, 2004–2011.
// CollegeFootballData game IDs are ESPN event IDs, so the game list comes from the CFBD games cache.
//
//   npx tsx scripts/fetch-espn-box.ts <cfbdCacheDir> <espnCacheDir> [fromYear] [toYear]
import fs from "node:fs";
import path from "node:path";
import { NEW_SCHOOLS } from "../lib/cfbd-teams";

const [cfbd, out, from = "2004", to = "2011"] = process.argv.slice(2);
if (!cfbd || !out) { console.error("usage: tsx scripts/fetch-espn-box.ts <cfbdCacheDir> <espnCacheDir> [fromYear] [toYear]"); process.exit(1); }
const SEC = new Set([...Object.keys(NEW_SCHOOLS), "Alabama", "Arkansas", "Auburn", "Florida", "Georgia", "Kentucky", "LSU", "Mississippi State", "Missouri", "Oklahoma",
  "Ole Miss", "South Carolina", "Tennessee", "Texas", "Texas A&M", "Vanderbilt"]);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const ids = new Set<number>();
  for (const f of fs.readdirSync(path.join(cfbd, "games"))) for (const g of JSON.parse(fs.readFileSync(path.join(cfbd, "games", f), "utf8")))
    if (g.season >= +from && g.season <= +to && SEC.has(g.homeTeam) && SEC.has(g.awayTeam) && g.completed) ids.add(g.id);
  let fetched = 0, failed = 0;
  for (const id of ids) {
    const file = path.join(out, `${id}.json`);
    if (fs.existsSync(file)) continue;
    await sleep(1000);
    const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/college-football/summary?event=${id}`);
    if (!r.ok) { failed++; console.log(`  ${id}: HTTP ${r.status}`); continue; }
    fs.writeFileSync(file, await r.text());
    fetched++;
  }
  console.log(`${ids.size} games, ${fetched} fetched, ${failed} failed`);
}
main();
