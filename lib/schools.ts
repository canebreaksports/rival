// School names and colors only: small enough for every page (play screens don't need the full datasets).
import schools from "@/data/schools.json";
import type { School, SchoolKey } from "./types";

export const SCHOOL: Record<SchoolKey, School> = Object.fromEntries((schools as School[]).map(s => [s.key, s]));
