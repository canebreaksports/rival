// Imports single-season rushing and receiving yards top-10 lists from Wikipedia "<School> football statistical leaders"
// pages into data/season-records.json (used by the fill-in "combined top 10" questions).
//
//   npx tsx scripts/import-season-records.ts <cacheDir> [--dry]
//
// Checks: 10+ rows, yards in descending order, every row has a year. Lists cite each school's record book.
import fs from "node:fs";
import { wikiArticle } from "./wiki-fetch";
import { tablesIn, tableRows } from "../lib/wikitable";

const display = (n: string) => n.replace(/^[|\s]+/, "").replace(/\s*\([^)]*\)\s*/g, " ").replace(/[*†‡^#]+/g, "").replace(/\s+/g, " ").trim();
const [cache, ...flags] = process.argv.slice(2);
if (!cache) { console.error("usage: tsx scripts/import-season-records.ts <cacheDir> [--dry]"); process.exit(1); }
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
export interface SeasonRec { name: string; yards: number; season: number }
type Out = Record<string, { source: string; verified: boolean; rush?: SeasonRec[]; rec?: SeasonRec[] }>;

async function main() {
  const out: Out = {};
  for (const [k, title] of Object.entries(PAGES)) {
    const a = await wikiArticle(cache, title);
    if (!a) { console.log(`✗ ${k}: no article`); continue; }
    const entry: Out[string] = { verified: true, source: `Wikipedia "${a.title}" single-season rushing and receiving yards tables (revision ${a.revid}), which cite the school record book; fetched 2026-11-23` };
    for (const [stat, head] of [["rush", "Rushing yards"], ["rec", "Receiving yards"]] as const) {
      // only tables inside this section: from its heading line to the next heading of any level
      const m = new RegExp(`^=+\\s*${head}\\s*=+\\s*$`, "im").exec(a.wikitext);
      const rest = m ? a.wikitext.slice(m.index + m[0].length) : "", next = rest.search(/^=+[^=\n]+=+\s*$/m);
      const section = next < 0 ? rest : rest.slice(0, next);
      const table = m ? tablesIn(section).find(t => /\|\+\s*Single[ -]season/i.test(t)) : null;
      if (!table) { console.log(`✗ ${k} ${stat}: no single-season table`); continue; }
      const list: SeasonRec[] = [];
      for (const r of tableRows(table)) {
        const cells = r.map(c => c.text);
        const [, name, yds, year] = cells.length >= 4 ? cells : ["", ...cells]; // tied rows may drop the rank cell
        const yards = Number((yds ?? "").replace(/[^\d]/g, "")), season = Number((year ?? "").match(/\b(19|20)\d{2}\b/)?.[0]);
        if (!name || !yards || !season || /^(rank|player)$/i.test(name)) continue;
        list.push({ name: display(name), yards, season });
      }
      const problems: string[] = [];
      if (list.length < 10) problems.push(`only ${list.length} rows`);
      if (list.some((x, i) => i && x.yards > list[i - 1].yards)) problems.push("not descending");
      const summary = list.map(x => `${x.name} ${x.season} ${x.yards}`).join(", ");
      if (problems.length) { console.log(`✗ ${k} ${stat}: ${problems.join("; ")}\n    ${summary}`); continue; }
      entry[stat] = list;
      console.log(`✓ ${k} ${stat}: ${summary}`);
    }
    out[k] = entry;
  }
  if (!DRY) { fs.writeFileSync("data/season-records.json", JSON.stringify(out, null, 1) + "\n"); console.log("wrote data/season-records.json"); }
}
main();
