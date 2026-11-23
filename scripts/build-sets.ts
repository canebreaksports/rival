// npm run sets — builds weekly sets into data/sets/<slug>.json.
//
// Freezing rule: once a game's week is about to unlock (36 hours before its Monday 7 AM Central start, to cover every
// US time zone), its set file is never rewritten, so later data or code changes can't alter a live or past set.
// Future weeks are rebuilt on every run, so new player packs and fixes flow into upcoming sets.
//
//   npm run sets                       rebuild future sets, keep frozen ones, create any that are missing
//   npm run sets -- --force <slug>     rebuild one frozen set anyway (only if nobody has played it yet)
//   npm run sets -- --reset <slug>     rebuild one set AND give everyone a fresh run of it (bumps its rev)
//   npm run sets -- --now 2026-11-20   pretend it is this date (testing)
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { DATA } from "../lib/data";
import { weeklySet } from "../lib/build";
import { windowOf, dateOf } from "../lib/gating";
import { SETS_DIR } from "../lib/sets";

const args = process.argv.slice(2);
const reset = new Set(args.flatMap((a, i) => (a === "--reset" ? [args[i + 1]] : [])));
const force = new Set([...reset, ...args.flatMap((a, i) => (a === "--force" ? [args[i + 1]] : []))]);
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
  const old = exists ? (JSON.parse(fs.readFileSync(file, "utf8")) as { rev?: number }) : null;
  const rev = (old?.rev ?? 0) + (reset.has(set.slug) ? 1 : 0);   // keep a set's rev across rebuilds; --reset bumps it
  if (rev) set.rev = rev;
  if (reset.has(set.slug)) console.log(`reset ${set.slug}: everyone can play it again (rev ${rev})`);
  if (set.questions.length < 3) tally.thin.push(`${set.slug} (${set.questions.length})`);
  fs.writeFileSync(file, JSON.stringify(set, null, 1) + "\n");
  if (exists) tally.built++; else tally.created++;
  if (frozen && !exists && now <= windowOf(g).end) console.log(`note: created ${set.slug}, whose week is live or about to unlock`);
}
// content fingerprints for the publishing gate (lib/approvals.ts): any change to a set's questions needs a fresh green light
const hashes: Record<string, string> = {};
for (const f of fs.readdirSync(SETS_DIR).filter(f => f.endsWith(".json")).sort()) {
  const s = JSON.parse(fs.readFileSync(path.join(SETS_DIR, f), "utf8")) as { slug: string; questions: unknown[] };
  hashes[s.slug] = crypto.createHash("sha256").update(JSON.stringify(s.questions)).digest("hex").slice(0, 16);
}
fs.writeFileSync(path.join(process.cwd(), "data", "set-hashes.json"), JSON.stringify(hashes, null, 1) + "\n");
console.log(`Sets: ${tally.created} created, ${tally.built} rebuilt, ${tally.kept} frozen and kept.`);
if (tally.thin.length) console.log(`Fewer than 3 verified questions (shows "Stats pack coming soon"): ${tally.thin.join(", ")}`);
