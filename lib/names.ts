// Name matching for the School Count "Name Them" bonus (spec §4.8), one guess at a time.
// Last names work; an ambiguous last name needs a first name; nicknames such as "Cadillac" work;
// small spelling mistakes are forgiven on longer names ("Edwards-Heilare" → Clyde Edwards-Helaire).

export const norm = (x: string) =>
  x.toLowerCase().replace(/[’'.]/g, "").replace(/[^a-z ]/g, " ").replace(/\b(jr|sr|ii|iii|iv|tj)\b/g, " ").replace(/\s+/g, " ").trim();

/** Damerau–Levenshtein distance (adjacent swaps count as one edit). */
export function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    const cost = a[i - 1] === b[j - 1] ? 0 : 1;
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}
/** Typos allowed for a name of this length: none up to 4 letters, 1 up to 7, 2 beyond. */
const allowed = (s: string) => (s.length <= 4 ? 0 : s.length <= 7 ? 1 : 2);
const close = (input: string, target: string) => input === target || editDistance(input, target) <= allowed(target);

/** Last-name forms for a person: last word, and the last two words joined (hyphenated / two-word surnames). */
function lastForms(name: string) {
  const w = norm(name).split(" ");
  return [...new Set([w[w.length - 1], w.length > 2 || /-/.test(name) ? w.slice(-2).join("") : ""].filter(Boolean))];
}
const firsts = (name: string) => { const w = norm(name).split(" "); return w.slice(0, -1) };

export type Guess =
  | { status: "hit"; name: string }
  | { status: "dup"; name: string }
  | { status: "ambiguous"; options: string[] }
  | { status: "miss" };

/** Matches one guess against the people still to be named (and those already named). */
export function matchOne(input: string, people: { name: string }[], named: Set<string> = new Set()): Guess {
  const words = norm(input).split(" ").filter(Boolean);
  if (!words.length) return { status: "miss" };
  const tries = [...new Set([words[words.length - 1], words.slice(-2).join("")])]; // "heilare", "edwardsheilare"
  // 1. last name (exact beats fuzzy)
  const score = (p: { name: string }) => Math.min(...lastForms(p.name).flatMap(f => tries.map(t => (t === f ? 0 : close(t, f) ? editDistance(t, f) : 99))));
  let c = people.filter(p => score(p) < 99);
  const best = Math.min(...c.map(score));
  c = c.filter(p => score(p) === best);
  // 2. several share that last name: the first name decides
  if (c.length > 1 && words.length > 1) {
    const f = c.filter(p => firsts(p.name).some(fn => words.slice(0, -1).some(w => close(w, fn))));
    if (f.length) c = f;
  }
  // 3. nickname or first-name-only guess ("cadillac")
  if (!c.length && words.length === 1) c = people.filter(p => firsts(p.name).some(fn => fn.length > 3 && close(words[0], fn)));
  if (c.length === 1) return named.has(c[0].name) ? { status: "dup", name: c[0].name } : { status: "hit", name: c[0].name };
  if (c.length > 1) return { status: "ambiguous", options: c.map(p => p.name) };
  return { status: "miss" };
}

/** Batch form (comma-separated list): every unambiguous hit. Kept for tests and free text. */
export function matchNames(input: string, people: { name: string }[]): Set<string> {
  const hit = new Set<string>();
  for (const tok of input.split(/[,\n;]+|\band\b/)) {
    if (!norm(tok)) continue;
    const g = matchOne(tok, people, hit);
    if (g.status === "hit") hit.add(g.name);
  }
  return hit;
}
