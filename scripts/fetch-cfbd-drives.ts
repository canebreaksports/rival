// Caches CollegeFootballData drives (2001–2025, SEC + Big 12) for walk-off detection (scripts/import-walkoffs.ts).
//   npx tsx scripts/fetch-cfbd-drives.ts <cacheDir>
import fs from "node:fs";
import path from "node:path";
const [cache] = process.argv.slice(2);
if (!cache) { console.error("usage: tsx scripts/fetch-cfbd-drives.ts <cacheDir>"); process.exit(1); }
const headers: Record<string, string> = process.env.CFBD_KEY ? { Authorization: `Bearer ${process.env.CFBD_KEY}` } : {};
async function main() {
  fs.mkdirSync(path.join(cache, "drives"), { recursive: true });
  let calls = 0;
  for (let y = 2001; y <= 2025; y++) for (const conf of ["SEC", "B12"]) {
    const file = path.join(cache, "drives", `${y}-${conf}.json`);
    if (fs.existsSync(file)) continue;
    const r = await fetch(`https://api.collegefootballdata.com/drives?year=${y}&conference=${conf}&seasonType=both`, { headers });
    if (!r.ok) throw new Error(`${y} ${conf} → ${r.status} ${await r.text()}`);
    fs.writeFileSync(file, JSON.stringify(await r.json())); calls++;
  }
  console.log(`done, ${calls} API calls`);
}
main();
