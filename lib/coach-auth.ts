// Password check for the admin (coach) pages. Browser Basic Auth: any username, password = COACH_PASSWORD.
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

