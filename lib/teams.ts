// Power-conference schools players can pick as "their team" (data/teams.json, from CollegeFootballData 2026).
import teams from "@/data/teams.json";
export interface Team { key: string; name: string; mascot: string; conference: string; color: string }
export const TEAMS = (teams as { teams: Team[] }).teams;
export const OTHER = "OTHER";
export const TEAM: Record<string, Team> = Object.fromEntries(TEAMS.map(t => [t.key, t]));
export const teamName = (k: string) => (k === OTHER ? "Other school" : TEAM[k]?.name ?? k);
export const CONFERENCES = ["SEC", "Big Ten", "ACC", "Big 12", "Independent"];
