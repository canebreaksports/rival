// npm run sets — builds weekly sets into data/sets/<slug>.json.
//
// Freezing rule: once a game's week is about to unlock (36 hours before its Monday 7 AM Central start, to cover every
// US time zone), its set file is never rewritten, so later data or code changes can't alter a live or past set.
// Future weeks are rebuilt on every run, so new player packs and fixes flow into upcoming sets.
//
//   npm run sets                       rebuild future sets, keep frozen ones, create any that are missing
//   npm run sets -- --force <slug>     rebuild one frozen set anyway (only if nobody has played it yet)
//   npm run sets -- --now 2026-11-20   pretend it is this date (testing)
import fs from "node:fs";
import path from "node:path";
import { DATA } from "../lib/data";
import { weeklySet } from "../lib/build";
import { windowOf, dateOf } from "../lib/gating";
import { SETS_DIR } from "../lib/sets";

const args = process.argv.slice(2);
const force = new Set(args.flatMap((a, i) => (a === "--force" ? [args[i + 1]] : [])));
const nowArg = args.indexOf("--now");
const now = nowArg >= 0 ? dateOf(args[nowArg + 1]) : new Date();
const FREEZE_LEAD_MS = 36 * 3600e3;

fs.mkdirSync(SETS_DIR, { recursive: true });
const tally = { kept: 0, built: 0, created: 0, thin: [] as string[] };
for (const g of DATA.schedule.games) {
  const set = weeklySet(DATA, g);
  const file = path.join(SETS_DIR, set.slug + ".json");
  const frozen = now.getTime() >= windowOf(g).start.getTime() - FREEZE_LEAD_MS;
  const exists = fs.existsSync(file);
  if (exists && frozen && !force.has(set.slug)) { tally.kept++; continue; }
  if (set.questions.length < 3) tally.thin.push(`${set.slug} (${set.questions.length})`);
  fs.writeFileSync(file, JSON.stringify(set, null, 1) + "\n");
  if (exists) tally.built++; else tally.created++;
  if (frozen && !exists && now <= windowOf(g).end) console.log(`note: created ${set.slug}, whose week is live or about to unlock`);
}
console.log(`Sets: ${tally.created} created, ${tally.built} rebuilt, ${tally.kept} frozen and kept.`);
if (tally.thin.length) console.log(`Fewer than 3 verified questions (shows "Stats pack coming soon"): ${tally.thin.join(", ")}`);
