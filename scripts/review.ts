// npm run review -- [YYYY-MM-DD]  → writes review/<week>.md with every question and answer for that game week.
// Defaults to the next week that hasn't unlocked yet.
import fs from "node:fs";
import { readSets } from "../lib/sets";
import { reviewMarkdown, weekOf } from "../lib/review";

const sets = readSets();
const weeks = [...new Set(sets.map(s => weekOf(s.game.date)))].sort();
const today = new Date().toISOString().slice(0, 10);
const week = process.argv[2] ? weekOf(process.argv[2]) : weeks.find(w => w > today) ?? weeks[weeks.length - 1];
const mine = sets.filter(s => weekOf(s.game.date) === week).sort((a, b) => a.game.date.localeCompare(b.game.date));
if (!mine.length) { console.error(`No sets for the week of ${week}. Weeks: ${weeks.join(", ")}`); process.exit(1); }
fs.mkdirSync("review", { recursive: true });
fs.writeFileSync(`review/${week}.md`, reviewMarkdown(week, mine) + "\n");
console.log(`review/${week}.md: ${mine.length} matchups, ${mine.reduce((t, s) => t + s.questions.length, 0)} questions`);
