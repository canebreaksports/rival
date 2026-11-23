// Publishing gate: a weekly set reaches players only after the owner green-lights it on /coach/publish.
// An approval is tied to the set's content hash, so any rebuild or revision sends the set back to review.
// Approvals live in Redis (hash "rival:approvals", slug -> hash) when it's connected, plus data/approvals.json in the repo.
import hashes from "@/data/set-hashes.json";
import setSigs from "@/data/set-sigs.json";
import repo from "@/data/approvals.json";
import { redis, storageConfigured } from "./track-server";

export const REVIEW_FROM = (repo as { review_from: string }).review_from; // sets before this game date are grandfathered
const HASHES = hashes as Record<string, string>;
const SIGS = setSigs as Record<string, string[]>;
const slugDate = (slug: string) => slug.slice(0, 10);

export type Approvals = { configured: boolean; approved: string[]; pending: string[]; stale: string[]; order: Record<string, string[]> };
const pairs = (flat: unknown) => { const a = (flat as string[]) ?? [], o: Record<string, string> = {}; for (let i = 0; i < a.length; i += 2) o[a[i]] = a[i + 1]; return o };

export async function approvalState(): Promise<Approvals> {
  const R = repo as { sets: Record<string, string>; order?: Record<string, string[]> };
  const saved: Record<string, string> = { ...R.sets }, order: Record<string, string[]> = { ...(R.order ?? {}) };
  if (storageConfigured()) {
    const [ap, ord] = await redis([["HGETALL", "rival:approvals"], ["HGETALL", "rival:order"]]);
    Object.assign(saved, pairs(ap));
    for (const [slug, json] of Object.entries(pairs(ord))) { try { const v = JSON.parse(json); if (Array.isArray(v)) order[slug] = v } catch { /* ignore */ } }
  }
  const approved: string[] = [], pending: string[] = [], stale: string[] = [];
  for (const [slug, h] of Object.entries(HASHES)) {
    if (slugDate(slug) < REVIEW_FROM || saved[slug] === h) approved.push(slug);
    else (saved[slug] ? stale : pending).push(slug); // stale: approved once, changed since
  }
  return { configured: storageConfigured(), approved, pending, stale, order };
}

export async function setApproval(slugs: string[], approve: boolean) {
  // a set is green-lit only when every one of its questions is (per-question review below)
  const reviews = approve ? await questionReviews() : {};
  const ok = slugs.filter(s => HASHES[s] && (!approve || (SIGS[s] ?? []).every(q => reviews[`${s}|${q}`]?.s === "ok")));
  if (!ok.length) return 0;
  await redis(approve ? [["HSET", "rival:approvals", ...ok.flatMap(s => [s, HASHES[s]])]] : [["HDEL", "rival:approvals", ...ok]]);
  return ok.length;
}

/** Owner's question order for a set (question signatures). Saving an order sends the set back to review. */
export async function setOrder(slug: string, sigs: string[]) {
  if (!HASHES[slug]) return false;
  await redis([["HSET", "rival:order", slug, JSON.stringify(sigs)], ["HDEL", "rival:approvals", slug]]);
  return true;
}

// ---- per-question review: green light / needs work / reject, with an optional note (Redis hash "rival:qreview") ----
export type QStatus = "ok" | "work" | "reject";
export type QReview = { s: QStatus; note?: string; t: string };

/** Every question review, keyed "slug|sig". Admin only (notes are private). */
export async function questionReviews(): Promise<Record<string, QReview>> {
  if (!storageConfigured()) return {};
  const [flat] = await redis([["HGETALL", "rival:qreview"]]);
  const out: Record<string, QReview> = {};
  for (const [k, v] of Object.entries(pairs(flat))) { try { out[k] = JSON.parse(v) } catch { /* ignore */ } }
  return out;
}

/** Records reviews for questions of one set. Anything short of a green light pulls the set back from players. */
export async function setQuestionReviews(slug: string, items: { sig: string; s: QStatus | null; note?: string }[]) {
  const known = new Set(SIGS[slug] ?? []);
  const ok = items.filter(i => known.has(i.sig));
  if (!ok.length) return 0;
  const t = new Date().toISOString(), cmds: (string | number)[][] = [];
  const set = ok.filter(i => i.s), clear = ok.filter(i => !i.s);
  if (set.length) cmds.push(["HSET", "rival:qreview", ...set.flatMap(i => [`${slug}|${i.sig}`, JSON.stringify({ s: i.s, ...(i.note ? { note: i.note.slice(0, 1000) } : {}), t })])]);
  if (clear.length) cmds.push(["HDEL", "rival:qreview", ...clear.map(i => `${slug}|${i.sig}`)]);
  if (ok.some(i => i.s !== "ok")) cmds.push(["HDEL", "rival:approvals", slug]);
  await redis(cmds);
  return ok.length;
}
