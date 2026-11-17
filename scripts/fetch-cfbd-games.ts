// Caches game results (2000–2025), player box scores and team box scores (2012–2025) from CollegeFootballData.
// One request per conference per season (SEC + Big 12 cover every current SEC school's history).
//
//   npx tsx scripts/fetch-cfbd-games.ts <cacheDir> [boxFromYear=2012]   (2004–2011 box scores are partial: cross-check only)
import fs from "node:fs";
import path from "node:path";

const [cache, boxFromArg = "2012"] = process.argv.slice(2);
const BOX_FROM = Number(boxFromArg);
if (!cache) { console.error("usage: tsx scripts/fetch-cfbd-games.ts <cacheDir>"); process.exit(1); }
const headers: Record<string, string> = process.env.CFBD_KEY ? { Authorization: `Bearer ${process.env.CFBD_KEY}` } : {};

async function get(file: string, url: string) {
  if (fs.existsSync(file)) return false;
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`${url} → ${r.status} ${await r.text()}`);
  fs.writeFileSync(file, JSON.stringify(await r.json()));
  return true;
}

async function main() {
  fs.mkdirSync(path.join(cache, "games"), { recursive: true });
  fs.mkdirSync(path.join(cache, "box"), { recursive: true });
  fs.mkdirSync(path.join(cache, "teams"), { recursive: true });
  fs.mkdirSync(path.join(cache, "box-early"), { recursive: true });
  let calls = 0;
  for (let y = 2000; y <= 2025; y++) for (const conf of ["SEC", "B12"]) {
    if (await get(path.join(cache, "games", `${y}-${conf}.json`), `https://api.collegefootballdata.com/games?year=${y}&conference=${conf}&seasonType=both`)) calls++;
    if (y >= BOX_FROM && await get(path.join(cache, y < 2012 ? "box-early" : "box", `${y}-${conf}.json`), `https://api.collegefootballdata.com/games/players?year=${y}&conference=${conf}&seasonType=both`)) calls++;
    if (y >= 2012 && await get(path.join(cache, "teams", `${y}-${conf}.json`), `https://api.collegefootballdata.com/games/teams?year=${y}&conference=${conf}&seasonType=both`)) calls++;
  }
  console.log(`done, ${calls} API calls`);
}
main();
