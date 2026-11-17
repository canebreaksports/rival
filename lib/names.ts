// Name matching for the School Count "Name Them" bonus (spec §4.8).
// Last names work; an ambiguous last name needs a first name; nicknames such as "Cadillac" work.
export const norm = (x: string) =>
  x.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\b(jr|ii|iii|tj)\b/g, " ").replace(/\s+/g, " ").trim();

export function matchNames(input: string, people: { name: string }[]): Set<string> {
  const hit = new Set<string>();
  const last = (n: string) => norm(n).split(" ").pop()!;
  const firsts = (n: string) => norm(n).split(" ").slice(0, -1);
  input.split(/[,\n;]+|\band\b/).map(norm).filter(Boolean).forEach(tok => {
    const words = tok.split(" ");
    let c = people.filter(p => words.includes(last(p.name)));
    if (c.length > 1) c = c.filter(p => firsts(p.name).some(w => words.includes(w)));
    if (!c.length && words.length === 1) c = people.filter(p => firsts(p.name).some(w => w.length > 3 && words.includes(w))); // nickname, e.g. "cadillac"
    if (c.length === 1) hit.add(c[0].name);
  });
  return hit;
}
