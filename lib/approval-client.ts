"use client";
// Client side of the publishing gate (lib/approvals.ts): which sets are green-lit, fetched once per page load.
import { useEffect, useState } from "react";
import repo from "@/data/approvals.json";

export const REVIEW_FROM = (repo as { review_from: string }).review_from;
let cache: Promise<Set<string>> | null = null;
const load = () => (cache ??= fetch("/api/approvals", { cache: "no-store" }).then(r => r.json()).then(d => new Set<string>(d.approved ?? [])).catch(() => new Set<string>()));

/** null while loading; otherwise the set of approved slugs (empty on error: fail closed). */
export function useApproved(): Set<string> | null {
  const [s, setS] = useState<Set<string> | null>(null);
  useEffect(() => { let on = true; load().then(x => on && setS(x)); return () => { on = false } }, []);
  return s;
}
export const needsApproval = (slug: string) => slug.slice(0, 10) >= REVIEW_FROM;
