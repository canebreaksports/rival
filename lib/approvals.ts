// Publishing gate: a weekly set reaches players only after the owner green-lights it on /coach/publish.
// An approval is tied to the set's content hash, so any rebuild or revision sends the set back to review.
// Approvals live in Redis (hash "rival:approvals", slug -> hash) when it's connected, plus data/approvals.json in the repo.
import hashes from "@/data/set-hashes.json";
import repo from "@/data/approvals.json";
import { redis, storageConfigured } from "./track-server";

export const REVIEW_FROM = (repo as { review_from: string }).review_from; // sets before this game date are grandfathered
const HASHES = hashes as Record<string, string>;
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
  const ok = slugs.filter(s => HASHES[s]);
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
