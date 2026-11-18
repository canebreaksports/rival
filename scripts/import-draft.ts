// Builds data/draft.json: every NFL draft pick from the 16 SEC schools, 2000–2026.
// Source: CollegeFootballData /draft/picks (one request per draft, cached in <cacheDir>).
//
//   npx tsx scripts/import-draft.ts <cacheDir>
//
// A draft year is kept only if it's complete: overall picks run 1..N with no gaps or repeats and N is 220–265.
import fs from "node:fs";
import path from "node:path";

const [cache] = process.argv.slice(2);
if (!cache) { console.error("usage: tsx scripts/import-draft.ts <cacheDir>"); process.exit(1); }
const KEY: Record<string, string> = {
  Alabama: "ALA", Arkansas: "ARK", Auburn: "AUB", Florida: "FLA", Georgia: "UGA", Kentucky: "UK", LSU: "LSU",
  "Mississippi State": "MSST", Missouri: "MIZ", Oklahoma: "OU", "Ole Miss": "MISS", "South Carolina": "SC",
  Tennessee: "TENN", Texas: "TEX", "Texas A&M": "TAMU", Vanderbilt: "VAN",
};
type Pick = { collegeTeam: string; year: number; overall: number; round: number; name: string; position: string; nflTeam: string };
export interface DraftPick { year: number; round: number; overall: number; name: string; pos: string; nfl: string; school: string }

async function main() {
  fs.mkdirSync(cache, { recursive: true });
  const out: DraftPick[] = [], skipped: string[] = [];
  let calls = 0;
  for (let y = 2000; y <= 2026; y++) {
    const file = path.join(cache, `${y}.json`);
    if (!fs.existsSync(file)) {
      const r = await fetch(`https://api.collegefootballdata.com/draft/picks?year=${y}`, { headers: process.env.CFBD_KEY ? { Authorization: `Bearer ${process.env.CFBD_KEY}` } : {} });
      calls++;
      if (!r.ok) { skipped.push(`${y} (HTTP ${r.status})`); continue; }
      fs.writeFileSync(file, await r.text());
    }
    const picks = JSON.parse(fs.readFileSync(file, "utf8")) as Pick[];
    const overall = picks.map(p => p.overall).sort((a, b) => a - b);
    const complete = overall.length >= 220 && overall.length <= 265 && overall.every((o, i) => o === i + 1);
    if (!complete) { skipped.push(`${y} (${picks.length} picks, not a complete 1..N sequence)`); continue; }
    for (const p of picks) if (KEY[p.collegeTeam])
      out.push({ year: p.year, round: p.round, overall: p.overall, name: p.name, pos: p.position, nfl: p.nflTeam, school: KEY[p.collegeTeam] });
  }
  out.sort((a, b) => a.year - b.year || a.overall - b.overall);
  const years = [...new Set(out.map(p => p.year))];
  fs.writeFileSync("data/draft.json", JSON.stringify({
    source: "CollegeFootballData API /draft/picks (official NFL draft results), fetched 2026-11-18. Years kept only when complete (overall picks 1..N, no gaps)",
    from: Math.min(...years), to: Math.max(...years), years, picks: out,
  }) + "\n");
  console.log(`${out.length} picks from SEC schools across ${years.length} drafts (${calls} API calls).${skipped.length ? " Skipped: " + skipped.join(", ") : ""}`);
  const r1 = (k: string) => out.filter(p => p.school === k && p.round === 1).length;
  console.log("First-round picks 2000–2026:", Object.values(KEY).map(k => `${k} ${r1(k)}`).join(", "));
}
main();
