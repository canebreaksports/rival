// One-time port of the prototype's data (classic-script JS) to sourced JSON.
// Usage: node scripts/port-prototype.mjs <path-to-prototype-folder>
//
// Numbers are copied programmatically from the prototype files, never retyped.
// Each record gets a `source` and a `verified` flag based on the product spec (§8):
//   - verified: the spec says the value came from a fetched source (or it is a spec §4 worked example,
//     or every number in it matches an already-verified dataset).
//   - unverified: drafted from memory, single-source facts that can drift, or claims with no source.
// Unverified records stay in the data (useful in Coach free play) but are excluded from weekly sets.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const proto = process.argv[2];
if (!proto) { console.error("usage: node scripts/port-prototype.mjs <prototype-folder>"); process.exit(1); }
const out = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "data");
fs.mkdirSync(out, { recursive: true });

// ---- load prototype data in a sandbox ----
const files = ["data/schools.js", "data/rivalries.js", "data/players.js", "data/records.js", "data/schedule.js"];
const code = files.map(f => fs.readFileSync(path.join(proto, f), "utf8")).join("\n")
  + "\n;globalThis.__d={S,REC,STATS,R,TEAM,P,CR,SCHED};";
const engineSrc = fs.readFileSync(path.join(proto, "js/engine.js"), "utf8");
const ctx = { Math, Object, JSON, Array, Number, String, Set };
vm.createContext(ctx);
vm.runInContext(code, ctx);
const { S, REC, R, TEAM, P, CR, SCHED } = ctx.__d;
// POS and STARS live in the prototype engine; pull just those two literals.
const POS = vm.runInNewContext("(" + engineSrc.match(/const POS=(\{[^}]*\})/)[1] + ")");
const STARS = vm.runInNewContext("(" + engineSrc.match(/const STARS=new Set\((\[[^\]]*\])\)/)[1] + ")");

const write = (name, obj) => { fs.writeFileSync(path.join(out, name), JSON.stringify(obj, null, 1) + "\n"); console.log("wrote", name); };

// ---- schools ----
const PROGRAM_SRC = "Drafted early in the prototype; re-verify from Wikipedia: List of Southeastern Conference champions, College football national championships in NCAA Division I FBS, Heisman Trophy winners (spec §8.4)";
write("schools.json", Object.entries(S).map(([key, s]) => ({
  key, name: s.n, color: s.c,
  program: { heisman: s.heisman, sec: s.sec, natl: s.natl, unbeaten: s.unbeaten },
  programSource: PROGRAM_SRC, programVerified: false,
})));

// ---- season records ----
const seasons = {};
for (const [k, str] of Object.entries(REC)) {
  const lsu25 = k === "LSU" ? " LSU 2025 (7-6) from SI, ESPN and the LSU Reveille (not yet on the list page)." : "";
  seasons[k] = {
    source: `Wikipedia "List of ${S[k].n} football seasons", on-field results with vacated wins restored (NCAA list of vacated games).${lsu25}`,
    verified: true,
    records: str.split(" "),
  };
}
write("seasons.json", seasons);

// ---- career rushing top 10 ----
const active = new Set(["DeSean Bishop"]);
const career = {};
for (const [k, c] of Object.entries(CR)) career[k] = {
  floor: c.floor, verified: true,
  source: `Wikipedia "${S[k].n} football statistical leaders" (school record book), top 10`,
  list: c.l.map(([name, yards]) => (active.has(name) ? { name, yards, active: true } : { name, yards })),
};
write("career-rushing.json", career);

// ---- players ----
const SR = "Sports Reference player page via aws.sports-reference.com/cfb/players/";
const SLUG = { "Jamal Lewis": "jamal-lewis-2", "Courtney Taylor": "courtney-taylor-1", "Derrick Henry": "derrick-henry-2", "Nick Marshall": "nick-marshall-2" };
const SR_PLAYERS = new Set(["Kenny Irons", "Tre Mason", "Arian Foster", "Dylan Sampson", "Jamal Lewis", "Devin Aromashodu", "Ben Obomanu",
  "Courtney Taylor", "Prechae Rodriguez", "Philip Lutzenkirchen", "Bo Jackson", "Tank Bigsby", "Leonard Fournette", "Derrius Guice",
  "Clyde Edwards-Helaire", "Justin Jefferson", "Jalin Hyatt", "Derrick Henry", "Najee Harris", "Trent Richardson", "DeVonta Smith",
  "Jalen Hurts", "Jayden Daniels", "Joe Burrow", "Nick Marshall"]);
const GAP = { // spec §8.1 "gaps filled from official or reliable sources"
  "Cam Newton": "auburntigers.com roster / Heisman page (2010: 264 carries, 1,473 yds, 20 TD)",
  "Joshua Dobbs": "utsports.com",
  "Jalen Milroe": "NCAA.com",
  "Carnell 'Cadillac' Williams": "Rivals and Saturday Down South (career)",
};
const crVal = (school, name) => CR[school]?.l.find(x => x[0] === name)?.[1];
function seasonSource(p) {
  if (p.n === "Philip Lutzenkirchen" && p.y === "car") return { source: "Wikipedia and Auburn sources (career 59 rec, 628 yds, 14 TD)", verified: true };
  if (GAP[p.n]) return { source: GAP[p.n], verified: true };
  if (SR_PLAYERS.has(p.n)) return { source: SR + (SLUG[p.n] ? SLUG[p.n] + ".html" : "<slug>.html"), verified: true };
  // career-rush-only rows that match the verified school top-10 list
  if (p.y === "car" && Object.keys(p).every(k => ["n", "t", "y", "rush"].includes(k)) && crVal(p.t, p.n) === p.rush)
    return { source: CR_SRC(p.t), verified: true };
  return { source: "Unknown: prototype value with no recorded source", verified: false };
}
const CR_SRC = k => `Wikipedia "${S[k].n} football statistical leaders" (school record book)`;
const names = [...new Map(P.map(p => [p.n + "|" + p.t, p])).values()];
write("players.json", {
  players: names.map(p => ({ name: p.n, school: p.t, pos: POS[p.n] || "RB", ...(STARS.includes(p.n) ? { star: true } : {}) })),
  seasons: P.map(p => {
    const { n, t, y, ...stats } = p;
    return { name: n, school: t, year: y === "car" ? "career" : y, ...stats, ...seasonSource(p) };
  }),
});

// ---- schedule ----
write("schedule.json", {
  source: "2026 SEC schedule: SI week-by-week composite grid, cross-checked with ESPN's weekly SEC schedule (spec §8.6)",
  games: SCHED.map(([date, away, home, site]) => ({ date, away, home, ...(site ? { site } : {}) })),
});

// ---- curated content ----
// Verified items, keyed by a short description. Everything else is marked unverified.
const MEMORY = "Prototype draft from memory, spot-checked only. Re-verify against a box score or Winsipedia (spec §8.7)";
const WINS = (a, b) => `Winsipedia ${a} vs ${b} matchup page (spec §8.5)`;
function curatedMoment(r, m) {
  const base = { type: "moment", prompt: m.p, line: m.line, answer: m.ans, reveal: m.r };
  if (m.d) Object.assign(base, { game: { date: m.d, winner: m.w, ws: m.ws, ls: m.ls, ...(m.ot ? { ot: true } : {}), venue: m.v } });
  let source = MEMORY, verified = false;
  const key = `${r.a}-${r.b}`;
  if (key === "AUB-TENN" && m.d === "Nov 9, 2013") { source = "Box score: auburntigers.com / utsports.com stats (spec §4.2, §8.7)"; verified = true; }
  if (!m.d) { // series facts (spec §8.5). Facts that can't drift are verified; all-time records need a second source.
    const drifts = /All-time series|last meeting|last met/i.test(m.p + m.r);
    source = WINS(S[r.a].n, S[r.b].n) + (drifts ? ". All-time record / last meeting can drift: confirm with a second source" : "");
    verified = !drifts;
  }
  return { ...base, source, verified };
}
const matchups = R.map(r => {
  const items = [];
  (r.moments || []).forEach(m => items.push(curatedMoment(r, m)));
  (r.duels || []).forEach(d => {
    const ok = d.yr === 2015 && d.aName === "Derrick Henry";
    items.push({ type: "duel", year: d.yr, stat: d.st, aSchool: d.aSchool, A: d.A, B: d.B, aName: d.aName, bName: d.bName,
      source: ok ? "Sports Reference player pages (derrick-henry-2, Leonard Fournette); spec §4.9 example" : MEMORY, verified: ok });
  });
  (r.cross || []).forEach(c => items.push({ type: "cross", prompt: c.p, options: c.o, answer: c.a, reveal: c.r,
    source: MEMORY + ". Passing stats and coaching facts are not in any verified dataset", verified: false }));
  (r.rank || []).forEach((k, i) => items.push({ type: "rank", prompt: k.p, items: k.items.map(([label, value]) => ({ label, value })), unit: k.u,
    ...(k.trap ? { trap: true, note: k.note } : {}),
    // both AUB–TENN rank lists use only values present in verified player seasons (spec §4.6 trap example is the first)
    source: "Sports Reference player pages (matches data/players.json)", verified: key(r) === "AUB-TENN" }));
  (r.h2h || []).forEach(h => items.push({ type: "h2h", prompt: h.p, A: { label: h.A[0], value: h.A[1] }, B: { label: h.B[0], value: h.B[1] }, unit: h.u,
    source: "Sports Reference player pages (matches data/players.json); spec §4.5 example", verified: key(r) === "AUB-TENN" }));
  return { a: r.a, b: r.b, name: r.name, items };
});
function key(r) { return `${r.a}-${r.b}`; }

// Team packs. Verified only where every number matches a verified dataset and the reveal makes no extra claims.
const TEAM_OK = {
  AUB: { pou: [true, true, true, false], rank: [true, false, true], h2h: [true] },
  TENN: { pou: [false, true, true], rank: [], h2h: [true] },
};
const TEAM_WHY = {
  "AUB.pou.3": "Reveal claims a school single-season record, which no verified dataset covers",
  "AUB.rank.1": "Ronnie Brown's career total has no recorded source",
  "TENN.pou.0": "Reveal claims an SEC Freshman of the Year award, which no verified dataset covers",
};
const teamPacks = {};
for (const [k, t] of Object.entries(TEAM)) {
  const items = [];
  const mark = (kind, i) => {
    const ok = TEAM_OK[k]?.[kind]?.[i] ?? false;
    const why = TEAM_WHY[`${k}.${kind}.${i}`];
    return { source: ok ? "Sports Reference player pages / school record book (matches data/players.json and data/career-rushing.json)" : (why || MEMORY), verified: ok };
  };
  (t.pou || []).forEach((m, i) => items.push({ type: "moment", prompt: m.p, line: m.line, answer: m.ans, reveal: m.r, ...mark("pou", i) }));
  (t.rank || []).forEach((r, i) => items.push({ type: "rank", prompt: r.p, items: r.items.map(([label, value]) => ({ label, value })), unit: r.u, ...mark("rank", i) }));
  (t.h2h || []).forEach((h, i) => items.push({ type: "h2h", prompt: h.p, A: { label: h.A[0], value: h.A[1] }, B: { label: h.B[0], value: h.B[1] }, unit: h.u, ...mark("h2h", i) }));
  teamPacks[k] = items;
}
write("curated.json", { matchups, teamPacks });
