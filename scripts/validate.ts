// npm run validate — checks the datasets and every frozen weekly set. Runs before every `npm run build`.
import { DATA } from "../lib/data";
import { validateData, validateQuestion } from "../lib/validate";
import { readSets } from "../lib/sets";
import { weekSlug, WEEKLY_N } from "../lib/build";

const errs = validateData(DATA);
const sets = readSets();
const slugs = new Set(DATA.schedule.games.map(weekSlug));
for (const s of sets) {
  if (!slugs.has(s.slug)) errs.push(`set ${s.slug}: not on the schedule`);
  if (s.questions.length > WEEKLY_N) errs.push(`set ${s.slug}: ${s.questions.length} questions`);
  if (s.questions.some(q => !q.verified)) errs.push(`set ${s.slug}: contains an unverified question`);
  if (s.questions.filter(q => q.trap).length > 1) errs.push(`set ${s.slug}: more than one trap`);
  if (s.questions.filter(q => q.upset).length > 1) errs.push(`set ${s.slug}: more than one upset`);
  for (const q of s.questions) errs.push(...validateQuestion(q).map(e => `set ${s.slug}: ${e}`));
}
const missing = [...slugs].filter(x => !sets.some(s => s.slug === x));
if (missing.length) errs.push(`${missing.length} scheduled game(s) have no frozen set; run npm run sets (e.g. ${missing[0]})`);

if (errs.length) { errs.forEach(e => console.error("FAIL:", e)); console.error(`\n${errs.length} problem(s).`); process.exit(1); }
console.log(`Data valid. ${sets.length} frozen sets checked.`);
