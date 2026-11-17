// Paced, cached fetch of Wikipedia article wikitext via the MediaWiki API (shared by the Wikipedia importers).
// Wikipedia rate-limits by network address; cloud sessions share theirs, so this honors Retry-After and caches.
import fs from "node:fs";
import path from "node:path";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
export async function wikiArticle(cache: string, title: string): Promise<{ wikitext: string; revid: number; title: string } | null> {
  fs.mkdirSync(cache, { recursive: true });
  const file = path.join(cache, title.replace(/[^\w.-]+/g, "_") + ".json");
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=wikitext|revid&format=json&formatversion=2&redirects=1`;
  let wait = 4000; // stay well under the API rate limit; honor Retry-After when Wikipedia asks us to back off
  for (let attempt = 0; attempt < 10; attempt++) {
    await sleep(wait);
    const r = await fetch(url, { headers: { "User-Agent": "rival-trivia-data-import/1.0 (college football trivia; low volume)" } });
    const text = await r.text();
    if (/too many requests/i.test(text) || r.status === 429) {
      wait = (Number(r.headers.get("retry-after")) || 30) * 1000 + 2000;
      console.log(`  rate limited on ${title}; waiting ${Math.round(wait / 1000)}s`);
      continue;
    }
    const j = JSON.parse(text);
    if (j.error) return null;
    const a = { wikitext: j.parse.wikitext as string, revid: j.parse.revid as number, title: j.parse.title as string };
    fs.writeFileSync(file, JSON.stringify(a));
    return a;
  }
  throw new Error(`rate limited fetching ${title}`);
}

