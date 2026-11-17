// Server-only access to frozen weekly sets in data/sets/. Used at build time by pages and scripts.
import fs from "node:fs";
import path from "node:path";
import type { FrozenSet } from "./types";

export const SETS_DIR = path.join(process.cwd(), "data", "sets");

export function readSets(): FrozenSet[] {
  if (!fs.existsSync(SETS_DIR)) return [];
  return fs.readdirSync(SETS_DIR).filter(f => f.endsWith(".json")).sort()
    .map(f => JSON.parse(fs.readFileSync(path.join(SETS_DIR, f), "utf8")) as FrozenSet);
}

export const readSet = (slug: string): FrozenSet | null => {
  const f = path.join(SETS_DIR, slug + ".json");
  return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, "utf8")) as FrozenSet) : null;
};
