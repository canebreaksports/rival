// Rivalry nicknames shown above the team names on the home cards (owner, Nov 2026). Only names a Wikipedia rivalry
// article gives the game; pairs without one show none. Kept apart from data/curated.json so set content doesn't change.
export const NICKNAMES: Record<string, { name: string; source: string }> = {
  "TAMU|TEX": { name: "Lone Star Showdown", source: 'Wikipedia "Lone Star Showdown" (revision 1366962575)' },
  "ARIZ|ASU": { name: "Duel in the Desert", source: 'Wikipedia "Arizona–Arizona State football rivalry" (revision 1381081817): "also known as the Duel in the Desert"' },
  "ALA|AUB": { name: "Iron Bowl", source: 'Wikipedia "Iron Bowl" (revision 1387061623)' },
  "GT|UGA": { name: "Clean, Old-Fashioned Hate", source: 'Wikipedia "Clean, Old-Fashioned Hate" (revision 1387362592)' },
  "LOU|UK": { name: "Governor's Cup", source: 'Wikipedia "Governor\'s Cup (Kentucky)" (revision 1381416641)' },
  "ARK|LSU": { name: "Battle for the Boot", source: 'Wikipedia "Arkansas–LSU football rivalry" (revision 1382521389): "formally known as the Battle for the Boot"' },
  "MICH|OSU": { name: "The Game", source: 'Wikipedia "Michigan–Ohio State football rivalry" (revision 1387360100): "referred to as The Game"' },
  "MISS|MSST": { name: "Egg Bowl", source: 'Wikipedia "Egg Bowl" (revision 1379416281)' },
  "IU|PUR": { name: "Old Oaken Bucket", source: 'Wikipedia "Old Oaken Bucket" (revision 1366964209)' },
  "CLEM|SC": { name: "Palmetto Bowl", source: 'Wikipedia "Clemson–South Carolina rivalry" (revision 1386959075), infobox name' },
};
export const nickname = (a: string, b: string) => NICKNAMES[[a, b].sort().join("|")]?.name ?? null;
