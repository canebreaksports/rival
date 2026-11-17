// Data and question validation. Used by `npm run validate` (and so by `npm run build`) and by the tests.
import type { Dataset, Question } from "./types";
import { rankOrder, correctAnswer } from "./scoring";

export function validateData(d: Dataset): string[] {
  const errs: string[] = [];
  const schools = new Set(d.schools.map(s => s.key));
  const hasSource = (x: { source?: string }, what: string) => { if (!x.source?.trim()) errs.push(`${what}: missing source`) };

  for (const s of d.schools) {
    if (!/^#[0-9a-f]{6}$/i.test(s.color)) errs.push(`${s.key}: bad color ${s.color}`);
    if (!s.programSource) errs.push(`${s.key}: program stats missing source`);
  }
  for (const [k, r] of Object.entries(d.seasons)) {
    if (!schools.has(k)) errs.push(`seasons: unknown school ${k}`);
    hasSource(r, `seasons ${k}`);
    if (r.records.length !== 26) errs.push(`seasons ${k}: ${r.records.length} records, expected 26 (2000–2025)`);
    r.records.forEach((x, i) => { if (!/^\d+-\d+$/.test(x)) errs.push(`seasons ${k} ${2000 + i}: bad record "${x}"`) });
  }
  hasSource(d.schedule, "schedule");
  for (const g of d.schedule.games) {
    for (const k of [g.away, g.home]) if (!schools.has(k)) errs.push(`schedule ${g.date}: unknown school ${k}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(g.date)) errs.push(`schedule: bad date ${g.date}`);
  }
  const players = new Set(d.players.players.map(p => p.name + "|" + p.school));
  for (const s of d.players.seasons) {
    hasSource(s, `player ${s.name} ${s.year}`);
    if (!players.has(s.name + "|" + s.school)) errs.push(`player season ${s.name} (${s.school}) has no player entry`);
    if (!schools.has(s.school)) errs.push(`player ${s.name}: unknown school ${s.school}`);
  }
  for (const [k, c] of Object.entries(d.career)) {
    hasSource(c, `career rushing ${k}`);
    if (c.list.length < 10) errs.push(`career rushing ${k}: ${c.list.length} entries, expected at least a top 10`);
    if (c.list.some((x, i) => i && x.yards > c.list[i - 1].yards)) errs.push(`career rushing ${k}: not sorted`);
    if (c.list.length && c.floor !== c.list[c.list.length - 1].yards) errs.push(`career rushing ${k}: floor ${c.floor} ≠ last listed total`);
  }
  const allItems = [...d.curated.matchups.flatMap(m => m.items.map(i => ({ i, w: m.name }))), ...Object.entries(d.curated.teamPacks).flatMap(([k, l]) => l.map(i => ({ i, w: k })))];
  for (const m of d.curated.matchups) for (const k of [m.a, m.b]) if (!schools.has(k)) errs.push(`matchup ${m.name}: unknown school ${k}`);
  for (const { i, w } of allItems) {
    hasSource(i, `curated ${w} ${i.type}`);
    if (i.type === "rank" && new Set(i.items.map(x => x.value)).size !== i.items.length) errs.push(`curated ${w}: rank has tied values`);
    if (i.type === "h2h" && i.A.value === i.B.value) errs.push(`curated ${w}: h2h tie`);
    if (i.type === "cross" && !(i.answer >= 0 && i.answer < i.options.length)) errs.push(`curated ${w}: crossover answer out of range`);
    if (i.type === "moment" && i.answer !== "over" && i.answer !== "under") errs.push(`curated ${w}: moment answer must be over/under`);
  }
  return errs;
}

/** Checks one question is internally consistent. */
export function validateQuestion(q: Question): string[] {
  const errs: string[] = [];
  const where = `${q.type} "${"prompt" in q && q.prompt ? q.prompt.slice(0, 60) : q.sig}"`;
  if (q.type === "moment" && q.check) {
    const { value, line } = q.check;
    if (value === line) errs.push(`${where}: value equals line`);
    if ((value > line) !== (q.answer === "over")) errs.push(`${where}: over/under mismatch (${value} vs ${line})`);
  }
  if (q.type === "rank") {
    if (new Set(q.items.map(x => x.value)).size !== q.items.length) errs.push(`${where}: tied values`);
    if (rankOrder(q).length !== q.items.length) errs.push(`${where}: bad order`);
  }
  if (q.type === "h2h" && q.A.value === q.B.value) errs.push(`${where}: tie`);
  if (q.type === "duel" && (q.A.big === q.B.big || q.aSchool === q.other)) errs.push(`${where}: duel lines or schools identical`);
  if (q.type === "mc" && (!(q.answer >= 0 && q.answer < q.options.length) || new Set(q.options).size !== q.options.length || q.order.length !== q.options.length))
    errs.push(`${where}: multiple choice answer out of range or duplicate options`);
  if (q.type === "count" && (q.A.some(x => x.yards < q.threshold) || q.B.some(x => x.yards < q.threshold))) errs.push(`${where}: player under threshold`);
  if (q.type !== "rank" && correctAnswer(q) === "") errs.push(`${where}: no correct answer`);
  return errs;
}
