# RIVAL

Weekly SEC college football trivia. Each week, the schools playing each other get one set of 10 questions, the same for everyone, one run each.

## Run locally

Needs Node.js 20 or newer.

```bash
npm install
npm run dev        # http://localhost:3000 (Coach / Preview Mode at /coach)
npm test
```

## Weekly sets

```bash
npm run sets       # rebuild upcoming weeks' sets; live and past weeks stay frozen
```

Commit the changes in `data/sets/`.

## Deploy (Vercel)

1. Push this folder to GitHub.
2. On vercel.com: Add New → Project → import the repo. Vercel detects Next.js; keep the defaults.
3. Deploy. Every push to `main` redeploys.

See `CLAUDE.md` for architecture, data rules and the roadmap.
