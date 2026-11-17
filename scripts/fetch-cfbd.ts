// Fetches player season stats from CollegeFootballData (api.collegefootballdata.com) into a local cache.
// One request per conference per season (SEC + Big 12 cover every current SEC school's history), ~50 requests.
//
//   npx tsx scripts/fetch-cfbd.ts <cacheDir> [fromYear] [toYear]
//
// The API key is injected by the cloud environment's proxy; locally set CFBD_KEY.
import fs from "node:fs";
import path from "node:path";

const [cache, from = "2004", to = "2026"] = process.argv.slice(2);
if (!cache) { console.error("usage: tsx scripts/fetch-cfbd.ts <cacheDir> [fromYear] [toYear]"); process.exit(1); }
fs.mkdirSync(cache, { recursive: true });
const headers: Record<string, string> = process.env.CFBD_KEY ? { Authorization: `Bearer ${process.env.CFBD_KEY}` } : {};

async function main() {
let calls = 0;
for (let y = +from; y <= +to; y++) for (const conf of ["SEC", "B12"]) {
  const file = path.join(cache, `${y}-${conf}.json`);
  if (fs.existsSync(file)) continue;
  const url = `https://api.collegefootballdata.com/stats/player/season?year=${y}&conference=${conf}`;
  const r = await fetch(url, { headers });
  calls++;
  if (!r.ok) { console.error(`${url} → ${r.status} ${await r.text()}`); process.exit(1); }
  const rows = await r.json();
  fs.writeFileSync(file, JSON.stringify(rows));
  console.log(`${y} ${conf}: ${rows.length} rows`);
}
console.log(`done, ${calls} API calls`);
}
main();
