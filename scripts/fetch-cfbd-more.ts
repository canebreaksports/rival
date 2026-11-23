// Caches CollegeFootballData for the non-SEC rivalry schools (ACC, Big Ten, Pac-12, plus Louisville's Big East/AAC years),
// into the same cache layout as fetch-cfbd.ts / fetch-cfbd-games.ts / fetch-cfbd-drives.ts.
//   npx tsx scripts/fetch-cfbd-more.ts <playerStatsCacheDir> <gamesCacheDir>
import fs from "node:fs";
import path from "node:path";
const [statsDir, gamesDir] = process.argv.slice(2);
if (!statsDir || !gamesDir) { console.error("usage: tsx scripts/fetch-cfbd-more.ts <playerStatsCacheDir> <gamesCacheDir>"); process.exit(1); }
const headers: Record<string, string> = process.env.CFBD_KEY ? { Authorization: `Bearer ${process.env.CFBD_KEY}` } : {};
let calls = 0;
async function get(file: string, url: string) {
  if (fs.existsSync(file)) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const r = await fetch(url, { headers }); calls++;
  if (!r.ok) throw new Error(`${url} → ${r.status} ${await r.text()}`);
  fs.writeFileSync(file, JSON.stringify(await r.json()));
}
const API = "https://api.collegefootballdata.com";
async function main() {
  for (let y = 2000; y <= 2025; y++) for (const c of ["ACC", "B1G", ...(y <= 2010 ? ["Pac-10"] : y <= 2023 ? ["PAC"] : [])]) { // CFBD: Pac-10 through 2010, Pac-12 (PAC) after
    await get(path.join(gamesDir, "games", `${y}-${c}.json`), `${API}/games?year=${y}&conference=${c}&seasonType=both`);
    if (y >= 2001) await get(path.join(gamesDir, "drives", `${y}-${c}.json`), `${API}/drives?year=${y}&conference=${c}&seasonType=both`);
    if (y >= 2012) {
      await get(path.join(gamesDir, "box", `${y}-${c}.json`), `${API}/games/players?year=${y}&conference=${c}&seasonType=both`);
      await get(path.join(gamesDir, "teams", `${y}-${c}.json`), `${API}/games/teams?year=${y}&conference=${c}&seasonType=both`);
    }
  }
  // player season stats (packs and season leaders use 2011+; Louisville was Big East in 2011-12 and AAC in 2013)
  for (let y = 2011; y <= 2025; y++) for (const c of ["ACC", "B1G", ...(y <= 2023 ? ["PAC"] : []), ...(y <= 2012 ? ["BE"] : []), ...(y === 2013 ? ["AAC"] : [])])
    await get(path.join(statsDir, `${y}-${c}.json`), `${API}/stats/player/season?year=${y}&conference=${c}`);
  console.log(`done, ${calls} API calls`);
}
main();
