"use client";
// Client side of the publishing gate (lib/approvals.ts): which sets are green-lit, fetched once per page load.
import { useEffect, useState } from "react";
import repo from "@/data/approvals.json";

export const REVIEW_FROM = (repo as { review_from: string }).review_from;
type Loaded = { approved: Set<string>; order: Record<string, string[]> };
let cache: Promise<Loaded> | null = null;
const load = () => (cache ??= fetch("/api/approvals", { cache: "no-store" }).then(r => r.json())
  .then(d => ({ approved: new Set<string>(d.approved ?? []), order: d.order ?? {} }))
  .catch(() => ({ approved: new Set<string>(), order: {} })));

function useLoaded(): Loaded | null {
  const [s, setS] = useState<Loaded | null>(null);
  useEffect(() => { let on = true; load().then(x => on && setS(x)); return () => { on = false } }, []);
  return s;
}
/** null while loading; otherwise the set of approved slugs (empty on error: fail closed). */
export const useApproved = (): Set<string> | null => useLoaded()?.approved ?? null;
/** The owner's saved question order for a set (undefined while loading or if none). */
export const useOrder = (slug: string): string[] | undefined | null => { const l = useLoaded(); return l ? l.order[slug] : null };
export const needsApproval = (slug: string) => slug.slice(0, 10) >= REVIEW_FROM;
