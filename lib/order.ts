// Applies the owner's saved question order (signatures) to a set. Ignored unless it names exactly the set's questions,
// so a rebuilt set falls back to its built order. Paired questions stay together, part 1 first.
import type { Question } from "./types";

export function applyOrder(qs: Question[], order?: string[]): Question[] {
  if (!order?.length || order.length !== qs.length) return qs;
  const by = new Map(qs.map(q => [q.sig, q]));
  if (new Set(order).size !== order.length || order.some(s => !by.has(s))) return qs;
  const out = order.map(s => by.get(s)!);
  for (let i = 0; i < out.length; i++) if (out[i].pair && out[i].pairPart === 1 && out[i + 1]?.pair !== out[i].pair) return qs;
  return out;
}

/** Units for reordering: a paired question's two parts move as one. */
export function units(qs: Question[]): Question[][] {
  const u: Question[][] = [];
  for (let i = 0; i < qs.length; i++) {
    if (qs[i].pair && qs[i].pairPart === 1 && qs[i + 1]?.pair === qs[i].pair) { u.push([qs[i], qs[i + 1]]); i++ }
    else u.push([qs[i]]);
  }
  return u;
}
