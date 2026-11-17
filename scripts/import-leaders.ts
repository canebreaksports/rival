// Imports career rushing top-10 lists from Wikipedia "<School> football statistical leaders" pages
// into data/career-rushing.json (used by School Count + Name Them).
//
//   npx tsx scripts/import-leaders.ts <cacheDir> [--dry]
//
// Checks: 10+ rows and yards in descending order. Where a listed player also has a career row in data/players.json
// with a different rushing total, the school's list (its official record book) wins: the career row takes the list's
// number, drops its carries (so yards per carry never mixes sources), and notes it in its source. Reported below.
// Lists already present (e.g. Tennessee's deeper record-book list) are left untouched.
import fs from "node:fs";
import { wikiArticle } from "./wiki-fetch";
import { tablesIn, tableRows } from "../lib/wikitable";
import type { CareerList, PlayerSeason } from "../lib/types";

// Same player across sources despite "Jr.", "III", apostrophes or a Wikipedia "(born 1993)" tag.
const display = (n: string) => n.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
const key = (n: string) => display(n).toLowerCase().replace(/[’'.]/g, "").replace(/\b(jr|sr|ii|iii|iv)\b/g, "").replace(/\s+/g, " ").trim();

const [cache, ...flags] = process.argv.slice(2);
if (!cache) { console.error("usage: tsx scripts/import-leaders.ts <cacheDir> [--dry]"); process.exit(1); }
const DRY = flags.includes("--dry");
const PAGES: Record<string, string> = {
  FLA: "Florida Gators football statistical leaders", VAN: "Vanderbilt Commodores football statistical leaders",
  MIZ: "Missouri Tigers football statistical leaders", UK: "Kentucky Wildcats football statistical leaders",
  OU: "Oklahoma Sooners football statistical leaders", TAMU: "Texas A&M Aggies football statistical leaders",
  UGA: "Georgia Bulldogs football statistical leaders", SC: "South Carolina Gamecocks football statistical leaders",
  TEX: "Texas Longhorns football statistical leaders", ARK: "Arkansas Razorbacks football statistical leaders",
  MISS: "Ole Miss Rebels football statistical leaders", MSST: "Mississippi State Bulldogs football statistical leaders",
};
const CURRENT_SEASON = 2026;

async function main() {
  const career = JSON.parse(fs.readFileSync("data/career-rushing.json", "utf8")) as Record<string, CareerList>;
  const players = JSON.parse(fs.readFileSync("data/players.json", "utf8")) as { players: unknown[]; seasons: PlayerSeason[] };
  const overrides: string[] = [];
  for (const [k, title] of Object.entries(PAGES)) {
    if (career[k]) { console.log(`- ${k}: already has a list, skipped`); continue; }
    const a = await wikiArticle(cache, title);
    if (!a) { console.log(`✗ ${k}: no article "${title}"`); continue; }
    const at = a.wikitext.search(/=+\s*Rushing yards\s*=+/i);
    const table = at < 0 ? null : tablesIn(a.wikitext.slice(at)).find(t => /\|\+\s*Career/i.test(t));
    if (!table) { console.log(`✗ ${k}: no career rushing yards table`); continue; }
    const list: CareerList["list"] = [];
    for (const r of tableRows(table)) {
      const [rank, name, yds, years] = r.map(c => c.text);
      const yards = Number((yds ?? "").replace(/[^\d]/g, ""));
      if (!/^T?-?\d+$/i.test((rank ?? "").replace(/\s/g, "")) || !name || !yards) continue;
      const yrs = (years ?? "").match(/\b(19|20)\d{2}\b/g)?.map(Number) ?? [];
      list.push({ name: display(name), yards, ...(yrs.includes(CURRENT_SEASON) ? { active: true } : {}) });
    }
    const problems: string[] = [];
    if (list.length < 10) problems.push(`only ${list.length} rows parsed`);
    if (list.some((x, i) => i && x.yards > list[i - 1].yards)) problems.push("not in descending order");
    const summary = list.map(x => `${x.name} ${x.yards.toLocaleString("en-US")}${x.active ? "*" : ""}`).join(", ");
    if (problems.length) { console.log(`✗ ${k}: ${problems.join("; ")}\n    ${summary}`); continue; }
    for (const x of list) {
      const p = players.seasons.find(s => s.school === k && s.year === "career" && key(s.name) === key(x.name) && s.rush != null);
      if (!p || p.rush === x.yards) continue;
      overrides.push(`${k} ${p.name}: career rushing ${p.rush} (${p.source.split(" ")[0]}) → ${x.yards} (school list)`);
      if (p.source.startsWith("CollegeFootballData") && Math.abs(p.rush! - x.yards) > 50) {
        // a big career gap means at least one season is off too: keep his seasons out of weekly sets
        for (const s of players.seasons.filter(s => s.school === k && s.name === p.name && s.year !== "career")) {
          s.verified = false;
          s.source += `. Unverified: career total is ${p.rush! - x.yards} yards off the school record book`;
        }
        overrides.push(`${k} ${p.name}: seasons marked unverified (career off by ${p.rush! - x.yards} yards)`);
      }
      p.rush = x.yards;
      delete p.att;
      if (p.scrim != null) p.scrim = x.yards + (p.rec ?? 0);
      p.source += `. Career rushing yards replaced with the school record book total (${x.yards}) from Wikipedia "${a.title}"; carries dropped`;
    }
    career[k] = { floor: list[list.length - 1].yards, verified: true, list,
      source: `Wikipedia "${a.title}" career rushing yards table (revision ${a.revid}), which cites the school record book; fetched 2026-11-17` };
    console.log(`✓ ${k}: ${summary} (floor ${career[k].floor})`);
  }
  if (overrides.length) console.log(`\nCareer rushing totals aligned to school lists:\n  ${overrides.join("\n  ")}`);
  if (!DRY) {
    fs.writeFileSync("data/career-rushing.json", JSON.stringify(career, null, 1) + "\n");
    fs.writeFileSync("data/players.json", JSON.stringify(players, null, 1) + "\n");
    console.log("wrote data/career-rushing.json and data/players.json");
  }
}
main();
