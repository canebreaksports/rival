// Publishing gate: a weekly set reaches players only after the owner green-lights it on /coach/publish.
// An approval is tied to the set's content hash, so any rebuild or revision sends the set back to review.
// Approvals live in Redis (hash "rival:approvals", slug -> hash) when it's connected, plus data/approvals.json in the repo.
import hashes from "@/data/set-hashes.json";
import repo from "@/data/approvals.json";
import { redis, storageConfigured } from "./track-server";

export const REVIEW_FROM = (repo as { review_from: string }).review_from; // sets before this game date are grandfathered
const HASHES = hashes as Record<string, string>;
const slugDate = (slug: string) => slug.slice(0, 10);

export async function approvalState(): Promise<{ configured: boolean; approved: string[]; pending: string[]; stale: string[] }> {
  const saved: Record<string, string> = { ...(repo as { sets: Record<string, string> }).sets };
  if (storageConfigured()) {
    const [flat] = await redis([["HGETALL", "rival:approvals"]]);
    const a = (flat as string[]) ?? [];
    for (let i = 0; i < a.length; i += 2) saved[a[i]] = a[i + 1];
  }
  const approved: string[] = [], pending: string[] = [], stale: string[] = [];
  for (const [slug, h] of Object.entries(HASHES)) {
    if (slugDate(slug) < REVIEW_FROM || saved[slug] === h) approved.push(slug);
    else (saved[slug] ? stale : pending).push(slug); // stale: approved once, changed since
  }
  return { configured: storageConfigured(), approved, pending, stale };
}

export async function setApproval(slugs: string[], approve: boolean) {
  const ok = slugs.filter(s => HASHES[s]);
  if (!ok.length) return 0;
  await redis(approve ? [["HSET", "rival:approvals", ...ok.flatMap(s => [s, HASHES[s]])]] : [["HDEL", "rival:approvals", ...ok]]);
  return ok.length;
}
