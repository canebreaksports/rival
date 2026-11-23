// Site passwords (browser Basic Auth, any username). The whole site is closed (owner, Nov 2026):
//   players' pages: PLAYER_PASSWORD or COACH_PASSWORD · coach pages (answers): COACH_PASSWORD only.
export function coachAuthorized(header: string | null, password: string | undefined): boolean {
  if (!password) return false;                       // fail closed: no password configured, nobody gets in
  if (!header?.startsWith("Basic ")) return false;
  let decoded = "";
  try { decoded = atob(header.slice(6).trim()) } catch { return false }
  const given = decoded.slice(decoded.indexOf(":") + 1);
  if (given.length !== password.length) return false;
  let diff = 0;                                       // compare every character so timing doesn't leak how much matched
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ password.charCodeAt(i);
  return diff === 0;
}

/** Which password a path needs, and whether the request has it. */
export function siteAuthorized(path: string, header: string | null, env: { PLAYER_PASSWORD?: string; COACH_PASSWORD?: string }): boolean {
  if (coachAuthorized(header, env.COACH_PASSWORD)) return true;          // the coach password opens everything
  if (path === "/coach" || path.startsWith("/coach/") || path.startsWith("/api/stats")) return false;
  return coachAuthorized(header, env.PLAYER_PASSWORD);
}
