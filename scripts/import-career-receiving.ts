// Imports career receiving-yards top-10 lists from Wikipedia "<School> football statistical leaders" pages
// into data/career-receiving.json (used by the Notables Rank It: "rank these receivers by career yards").
//
//   npx tsx scripts/import-career-receiving.ts <cacheDir> [--dry]
//
// Checks: 10+ rows, yards in descending order. These lists cite each school's record book, so they're exact.
import fs from "node:fs";
import { wikiArticle } from "./wiki-fetch";
import { tablesIn, tableRows } from "../lib/wikitable";

const display = (n: string) => n.replace(/\s*\([^)]*\)\s*/g, " ").replace(/[*†‡^#]+/g, "").replace(/\s+/g, " ").trim();
const [cache, ...flags] = process.argv.slice(2);
if (!cache) { console.error("usage: tsx scripts/import-career-receiving.ts <cacheDir> [--dry]"); process.exit(1); }
const DRY = flags.includes("--dry");
const PAGES: Record<string, string> = {
  ALA: "Alabama Crimson Tide football statistical leaders", AUB: "Auburn Tigers football statistical leaders",
  LSU: "LSU Tigers football statistical leaders", TENN: "Tennessee Volunteers football statistical leaders",
  FLA: "Florida Gators football statistical leaders", VAN: "Vanderbilt Commodores football statistical leaders",
  MIZ: "Missouri Tigers football statistical leaders", UK: "Kentucky Wildcats football statistical leaders",
  OU: "Oklahoma Sooners football statistical leaders", TAMU: "Texas A&M Aggies football statistical leaders",
  UGA: "Georgia Bulldogs football statistical leaders", SC: "South Carolina Gamecocks football statistical leaders",
  TEX: "Texas Longhorns football statistical leaders", ARK: "Arkansas Razorbacks football statistical leaders",
  MISS: "Ole Miss Rebels football statistical leaders", MSST: "Mississippi State Bulldogs football statistical leaders",
};
const CURRENT_SEASON = 2026;
export interface RecvEntry { name: string; yards: number; from?: number; to?: number; active?: boolean }

async function main() {
  const out: Record<string, { source: string; verified: boolean; list: RecvEntry[] }> = {};
  for (const [k, title] of Object.entries(PAGES)) {
    const a = await wikiArticle(cache, title);
    if (!a) { console.log(`✗ ${k}: no article "${title}"`); continue; }
    const at = a.wikitext.search(/=+\s*Receiving yards\s*=+/i);
    const table = at < 0 ? null : tablesIn(a.wikitext.slice(at)).find(t => /\|\+\s*Career/i.test(t));
    if (!table) { console.log(`✗ ${k}: no career receiving yards table`); continue; }
    const list: RecvEntry[] = [];
    for (const r of tableRows(table)) {
      const [rank, name, yds, years] = r.map(c => c.text);
      const yards = Number((yds ?? "").replace(/[^\d]/g, ""));
      if (!/^T?-?\d+$/i.test((rank ?? "").replace(/\s/g, "")) || !name || !yards) continue;
      const yrs = (years ?? "").match(/\b(19|20)\d{2}\b/g)?.map(Number) ?? [];
      list.push({ name: display(name), yards, ...(yrs.length ? { from: Math.min(...yrs), to: Math.max(...yrs) } : {}),
        ...(yrs.includes(CURRENT_SEASON) ? { active: true } : {}) });
    }
    const problems: string[] = [];
    if (list.length < 10) problems.push(`only ${list.length} rows parsed`);
    if (list.some((x, i) => i && x.yards > list[i - 1].yards)) problems.push("not in descending order");
    const summary = list.map(x => `${x.name} ${x.yards}${x.from ? ` (${x.from}–${x.to})` : ""}${x.active ? "*" : ""}`).join(", ");
    if (problems.length) { console.log(`✗ ${k}: ${problems.join("; ")}\n    ${summary}`); continue; }
    out[k] = { verified: true, list, source: `Wikipedia "${a.title}" career receiving yards table (revision ${a.revid}), which cites the school record book; fetched 2026-11-23` };
    console.log(`✓ ${k}: ${summary}`);
  }
  if (!DRY) { fs.writeFileSync("data/career-receiving.json", JSON.stringify(out, null, 1) + "\n"); console.log("wrote data/career-receiving.json"); }
}
main();
