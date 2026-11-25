# CURIO

Your personal journal for links, Reels and ideas. Share anything from Instagram, TikTok, X, YouTube, Safari or any app with a share sheet, and CURIO summarizes it, tags it, pulls out recipes / places / products / events / workouts, and lets you find it again by meaning or by chatting with your saves.

Live: https://curio-omega-tawny.vercel.app

## Features

- **Capture from anywhere**: Web Share Target on Android and desktop, an iOS Shortcut on iPhone, plus a quick-save bar in the app
- **AI enrichment**: summary, tags and structured entities for every save
- **Semantic search**: find saves by meaning, with keyword fallback
- **Chat with your saves**: answers cite the saves they came from (`[1]`, `[2]`, tap to open)
- **Clusters**: automatic topic groups, regenerated nightly or on demand
- **Edit, delete, re-run AI** on any save
- **Self-healing**: saves that miss the AI step are retried automatically by a daily cron
- **Offline-first PWA**: IndexedDB queue and cache, background sync
- **Accounts**: Clerk sign-in; every save is scoped to its owner
- **Export**: download all your saves as JSON

## Architecture

```
PWA (React 18 + Vite + TanStack Query + Tailwind, Workbox, Dexie)
        │  Bearer <Clerk session token>
        ▼
Vercel functions  (/api/*.ts re-export apps/api/*.ts)
  ingest · search · chat · clusters · items/:id · export · health · cron
        │
        ├── Turso (libSQL) ─ items, clusters; vector search via vector_distance_cos
        ├── Cloudflare Workers AI ─ Llama 3.1 8B (text), bge-base-en-v1.5 (embeddings)
        └── oEmbed / meta tags ─ titles, captions, thumbnails
```

## Project structure

```
api/                  Vercel entry points (one-line re-exports of apps/api)
apps/api/             Serverless handlers
  lib/ai.ts           Cloudflare Workers AI client (process, embed, chat, cluster)
  lib/enrich.ts       Scrape -> AI -> embed pipeline shared by ingest, reprocess and cron
  lib/db.ts           Turso schema, migrations and queries
  lib/extractor.ts    Platform detection, URL canonicalization, metadata scraping
  lib/clustering.ts   Cluster regeneration
  tests/              Vitest unit tests
apps/web/             React PWA
packages/shared/      Shared TypeScript types (@curio/shared)
vercel.json           Build, rewrites, headers, cron schedule
```

## API

All routes except `/api/health` and `/api/cron` need `Authorization: Bearer <Clerk session token>`.

| Route | Method | Purpose |
|---|---|---|
| `/api/ingest` | POST | Save a link `{ url, title?, text?, userNote? }` |
| `/api/search` | GET | `q`, `platform`, `tags`, `dateFrom`, `dateTo`, `limit`, `offset`, `semantic` |
| `/api/chat` | POST | `{ message, contextLimit?, filter? }` → answer + numbered citations |
| `/api/clusters` | GET / POST | Latest clusters / regenerate now |
| `/api/items/:id` | GET / PATCH / DELETE / POST | Read, edit `{ title?, userNote?, tags? }`, delete, `{ action: "reprocess" }` |
| `/api/export` | GET | All saves as JSON |
| `/api/health` | GET | Database connectivity (point an uptime monitor here) |
| `/api/cron?job=clusters\|retry` | GET | Scheduled jobs, `Authorization: Bearer $CRON_SECRET` |

## Environment variables

Set these in Vercel (Production + Preview) and in local `.env` files. See `.env.example`.

| Variable | Where | Notes |
|---|---|---|
| `TURSO_DATABASE_URL` | API | `libsql://<db>-<org>.turso.io` |
| `TURSO_AUTH_TOKEN` | API | Create with no expiry; must belong to the same database |
| `CLERK_SECRET_KEY` | API | |
| `VITE_CLERK_PUBLISHABLE_KEY` | Web (build time) | |
| `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` | API | Workers AI token |
| `CRON_SECRET` | API | `openssl rand -hex 32`; Vercel sends it to cron jobs automatically |
| `ALLOWED_ORIGIN` | API, optional | Comma-separated CORS origins (defaults to production + localhost) |
| `SEMANTIC_MAX_DISTANCE` | API, optional | Cosine-distance cut-off for semantic search (default `0.5`; lower = stricter) |

## Development

```bash
npm install
npm run dev:api    # vercel dev (API + rewrites) on :3000
npm run dev:web    # Vite on :5173, reachable from your phone on the same Wi-Fi
npm test           # API unit tests
npm run build      # what Vercel runs: type-check API, build PWA, build shared types
```

Pushing to `main` deploys to production on Vercel.

## Scheduled jobs

| Job | Schedule (UTC) | What it does |
|---|---|---|
| `clusters` | 03:00 daily | Regenerates topic clusters for every user |
| `retry` | 04:00 daily | Re-runs AI enrichment for saves still `pending`; gives up after 3 attempts (status `failed`, fixable with **Re-run AI**) |

## Roadmap

- Entity collections: recipe box, map of places, events calendar, wishlist
- Video understanding for Reels/TikToks (transcripts, frame captions)
- Weekly digest of things you saved but never opened
- Import from Instagram saved posts, browser bookmarks, Pocket; export to Markdown / Obsidian
- Browser extension for one-click desktop saves
- Per-user rate limits on AI endpoints, Sentry error tracking

## License

MIT
