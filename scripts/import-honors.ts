// Builds data/honors.json from Wikipedia: major award winners (2000–2025) and Heisman voting (2000–2025),
// for players from the 16 SEC schools.
//
//   npx tsx scripts/import-honors.ts <wikiCacheDir>
//
// Checks: an award is kept only if its winners table covers at least 22 of the 26 seasons 2000–2025 (so a parse
// failure can't silently drop winners); a Heisman year is kept only if every row's points = 3×1st + 2×2nd + 3rd.
import fs from "node:fs";
import { wikiArticle } from "./wiki-fetch";
import { tablesIn, tableRows } from "../lib/wikitable";
import { NEW_SCHOOLS, NEW_ALIASES } from "../lib/cfbd-teams";

const [cache] = process.argv.slice(2);
if (!cache) { console.error("usage: tsx scripts/import-honors.ts <wikiCacheDir>"); process.exit(1); }
const SCHOOLS: Record<string, string> = {
  Alabama: "ALA", Arkansas: "ARK", Auburn: "AUB", Florida: "FLA", Georgia: "UGA", Kentucky: "UK", LSU: "LSU",
  "Mississippi State": "MSST", Missouri: "MIZ", Oklahoma: "OU", "Ole Miss": "MISS", Mississippi: "MISS", "South Carolina": "SC",
  Tennessee: "TENN", Texas: "TEX", "Texas A&M": "TAMU", Vanderbilt: "VAN",
};
Object.assign(SCHOOLS, NEW_SCHOOLS, NEW_ALIASES); // non-SEC rivalry schools (lib/cfbd-teams.ts)
// "Alabama (2)" = Alabama's 2nd winner: drop the count before matching
const schoolOf = (t: string) => SCHOOLS[t.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim()] ?? null;
export const AWARDS: { key: string; title: string; name: string; for: string }[] = [
  { key: "heisman", title: "List of Heisman Trophy winners", name: "Heisman Trophy", for: "most outstanding player" },
  { key: "maxwell", title: "Maxwell Award", name: "Maxwell Award", for: "best all-around player" },
  { key: "camp", title: "Walter Camp Award", name: "Walter Camp Award", for: "player of the year" },
  { key: "doak", title: "Doak Walker Award", name: "Doak Walker Award", for: "best running back" },
  { key: "biletnikoff", title: "Biletnikoff Award", name: "Biletnikoff Award", for: "best receiver" },
  { key: "obrien", title: "Davey O'Brien Award", name: "Davey O'Brien Award", for: "best quarterback" },
  { key: "mackey", title: "John Mackey Award", name: "John Mackey Award", for: "best tight end" },
  { key: "outland", title: "Outland Trophy", name: "Outland Trophy", for: "best interior lineman" },
  { key: "bednarik", title: "Chuck Bednarik Award", name: "Chuck Bednarik Award", for: "best defensive player" },
  { key: "nagurski", title: "Bronko Nagurski Trophy", name: "Bronko Nagurski Trophy", for: "best defensive player" },
  { key: "butkus", title: "Butkus Award", name: "Butkus Award", for: "best linebacker" },
  { key: "thorpe", title: "Jim Thorpe Award", name: "Jim Thorpe Award", for: "best defensive back" },
  { key: "lombardi", title: "Lombardi Award", name: "Lombardi Award", for: "best lineman or linebacker" },
  { key: "groza", title: "Lou Groza Award", name: "Lou Groza Award", for: "best kicker" },
  { key: "guy", title: "Ray Guy Award", name: "Ray Guy Award", for: "best punter" },
];
const yearOf = (s: string) => { const m = s.match(/\b(19|20)\d{2}\b/); return m ? Number(m[0]) : null };

export interface AwardWin { award: string; year: number; name: string; school: string; pos?: string }
export interface HeismanVote { year: number; place: number; name: string; school: string; pos: string; points: number; first: number }

async function main() {
  const wins: AwardWin[] = [], everWon: AwardWin[] = [], report: string[] = [], sources: Record<string, string> = {};
  for (const aw of AWARDS) {
    const a = await wikiArticle(cache, aw.title);
    if (!a) { report.push(`✗ ${aw.name}: no article`); continue; }
    const all: AwardWin[] = [], allYears: AwardWin[] = [], years = new Set<number>();
    for (const t of tablesIn(a.wikitext)) {
      const rows = tableRows(t);
      const hi = rows.findIndex(r => r.some(c => /^(year|season)$/i.test(c.text)) && r.some(c => /^(winner|player|recipient|name)s?$/i.test(c.text)));
      if (hi < 0) continue;
      const head = rows[hi].map(c => c.text.toLowerCase());
      const iy = head.findIndex(h => /^(year|season)$/.test(h)), ip = head.findIndex(h => /^(winner|player|recipient|name)s?$/.test(h));
      const is = head.findIndex(h => /^(school|college|team|university)$/.test(h)), ipos = head.findIndex(h => /^(pos|position)\.?$/.test(h));
      if (is < 0) continue;
      let lastYear: number | null = null;
      for (const r of rows.slice(hi + 1)) {
        let cells = r.map(c => c.text);
        if (!yearOf(cells[iy] ?? "") && cells.length === head.length - 1 && lastYear) cells = [String(lastYear), ...cells]; // shared year (tie)
        const y = yearOf(cells[iy] ?? ""); if (!y) continue;
        lastYear = y; years.add(y);
        const school = schoolOf(cells[is] ?? ""), name = (cells[ip] ?? "").replace(/\s*\(.*?\)\s*/g, " ").replace(/[*†‡§^#]+/g, "").trim();
        if (school && name && y <= 2025) {
          const row = { award: aw.key, year: y, name, school, ...(ipos >= 0 && cells[ipos] ? { pos: cells[ipos] } : {}) };
          allYears.push(row);                       // every year: so "didn't win it" checks see pre-2000 winners too
          if (y >= 2000) all.push(row);
        }
      }
    }
    const covered = [...years].filter(y => y >= 2000 && y <= 2025).length;
    if (covered < 22) { report.push(`✗ ${aw.name}: winners table covers only ${covered} of 26 seasons; skipped`); continue; }
    wins.push(...all); everWon.push(...allYears);
    sources[aw.key] = `Wikipedia "${a.title}" (revision ${a.revid})`;
    report.push(`✓ ${aw.name}: ${covered}/26 seasons parsed, ${all.length} SEC winners${all.length ? " (" + all.map(w => `${w.name} ${w.year}`).slice(0, 4).join(", ") + (all.length > 4 ? ", …" : "") + ")" : ""}`);
  }

  const votes: HeismanVote[] = [], depth: Record<number, number> = {};
  for (let y = 2000; y <= 2025; y++) {
    const title = y >= 2006 ? `${y} NCAA Division I FBS football season` : `${y} NCAA Division I-A football season`;
    const a = await wikiArticle(cache, title);
    if (!a) { report.push(`✗ Heisman ${y}: no season article`); continue; }
    const at = a.wikitext.search(/=+\s*Heisman Trophy( voting)?\s*=+/i);
    const t = at >= 0 ? tablesIn(a.wikitext.slice(at))[0] : null;
    const rows = t ? tableRows(t) : [];
    const head = rows[0]?.map(c => c.text.toLowerCase()) ?? [];
    const col = (re: RegExp) => head.findIndex(h => re.test(h));
    const [ip, is, ipos, i1, i2, i3, it] = [col(/^player$/), col(/^(school|college|team)$/), col(/^(pos|position)/), col(/^1st/), col(/^2nd/), col(/^3rd/), col(/^(total|points|pts)/)];
    if ([ip, is, i1, i2, i3, it].some(i => i < 0)) { report.push(`✗ Heisman ${y}: voting table not found`); continue; }
    const num = (s: string) => Number((s ?? "").replace(/[^\d]/g, ""));
    const parsed = rows.slice(1).map((r, k) => ({ c: r.map(x => x.text), k })).filter(x => x.c[ip]);
    // Keep places down to the first row whose points don't add up, but only if that row couldn't rank above the kept
    // rows under either total (listed or computed). depth[y] = how many places are trustworthy.
    const calc = (x: (typeof parsed)[0]) => 3 * num(x.c[i1]) + 2 * num(x.c[i2]) + num(x.c[i3]);
    const firstBad = parsed.findIndex(x => num(x.c[it]) !== calc(x));
    let keep = parsed.length;
    if (firstBad >= 0) {
      const b = parsed[firstBad], above = parsed[firstBad - 1];
      keep = above && Math.max(num(b.c[it]), calc(b)) < num(above.c[it]) ? firstBad : 0;
    }
    if (!keep) { report.push(`✗ Heisman ${y}: points don't add up near the top; skipped`); continue; }
    if (keep < parsed.length) report.push(`~ Heisman ${y}: row ${keep + 1} (${parsed[keep].c[ip]}) doesn't add up; kept places 1–${keep}`);
    depth[y] = keep;
    parsed.slice(0, keep).forEach((x, k) => { const s = schoolOf(x.c[is]); if (s) votes.push({ year: y, place: k + 1, name: x.c[ip].replace(/[*†‡§^#]+/g, "").trim(), school: s, pos: ipos >= 0 ? x.c[ipos] : "", points: num(x.c[it]), first: num(x.c[i1]) }) });
    sources["heisman-" + y] = `Wikipedia "${a.title}" (revision ${a.revid})`;
  }
  const hy = new Set(votes.map(v => v.year)).size;
  report.push(`Heisman voting: ${votes.length} SEC finishes across ${hy} seasons with checked tables`);

  fs.writeFileSync("data/honors.json", JSON.stringify({
    source: "Wikipedia award articles (winners 2000–2025) and season articles (Heisman voting 2000–2025), fetched 2026-11-18. Award tables kept only when they cover ≥22 of 26 seasons; Heisman years kept only when every row's points check out",
    awards: AWARDS.filter(a => sources[a.key]).map(({ key, name, for: f }) => ({ key, name, for: f })), wins, everWon, heisman: votes, heismanDepth: depth, sources,
  }, null, 1) + "\n");
  console.log(report.join("\n"));
}
main();
