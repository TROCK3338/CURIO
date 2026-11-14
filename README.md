# MindSpace — Your Personal AI Mind Space

A PWA for saving, organizing, and retrieving content from anywhere (Instagram Reels, TikTok, X, Safari, etc.) with AI-powered tagging, search, and chat.

## ✨ Features

- **Zero-friction capture**: Share from any iOS/Android app → appears in MindSpace instantly
- **Cross-device**: Works on iPhone, Mac, iPad, Android, web — single PWA
- **AI-powered**: Gemini 1.5 Flash tags, summarizes, extracts entities (recipes, products, places, workouts, events)
- **Semantic search**: Find saves by meaning, not just keywords
- **Chat with your saves**: Ask questions, get answers with citations
- **AI clusters**: Automatic thematic grouping of your saves
- **Offline-first**: IndexedDB queue, background sync when online
- **Local AI (optional)**: Swap Gemini for Ollama if you get a Mac later
- **Free tier**: Runs entirely on free tiers (Vercel, Turso, Gemini)

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  PWA (React + Vite + TypeScript)                           │
│  - Web Share Target API (native share sheet integration)   │
│  - IndexedDB (Dexie) for offline queue & cache             │
│  - Service Worker (Workbox) for offline support            │
│  - TanStack Query for server state                          │
└─────────────────────────────────────────────────────────────┘
                            │
              ┌─────────────▼─────────────┐
              │  Vercel Serverless        │
              │  Functions (Edge)         │
              │  - /api/ingest            │
              │  - /api/search            │
              │  - /api/chat              │
              │  - /api/clusters          │
              └─────────────┬─────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│  Gemini API   │  │   Turso       │  │  Content      │
│  (Free tier)  │  │  (libSQL)     │  │  Extraction   │
│  - Embeddings │  │  - Vector     │  │  - oEmbed     │
│  - Summarize  │  │    search     │  │  - Meta tags  │
│  - Tag/Chat   │  │  - 9GB free   │  │  - Quick regex│
└───────────────┘  └───────────────┘  └───────────────┘
```

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- pnpm (recommended) or npm
- GitHub account (for Vercel deploy)
- Free accounts: [Gemini](https://aistudio.google.com/apikey), [Turso](https://turso.tech), [Vercel](https://vercel.com)

### 1. Clone & Install

```bash
git clone <your-repo>
cd mindspace
pnpm install  # or npm install
```

### 2. Generate Icons

Open `apps/web/scripts/generate-icons.html` in a browser, click "Generate Icons", save all PNGs to `apps/web/public/icons/`.

Or use [PWA Builder Image Generator](https://www.pwabuilder.com/imageGenerator) with `public/icons/icon.svg`.

### 3. Environment Variables

Copy `.env.example` to `.env` in both `apps/api` and `apps/web`:

```bash
# apps/api/.env
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-auth-token
GEMINI_API_KEY=your-gemini-key
CRON_SECRET=random-secret-for-cron-jobs

# apps/web/.env (mostly for local dev)
VITE_API_URL=http://localhost:3000/api
```

### 4. Local Development

```bash
# Terminal 1: Start API (Vercel dev)
pnpm dev:api

# Terminal 2: Start PWA
pnpm dev:web
```

Open `http://localhost:5173` on your computer and phone (same WiFi).

### 5. Test on iPhone

1. Open `http://YOUR_MAC_IP:5173` in Safari on iPhone
2. Tap Share → "Add to Home Screen"
3. Open Instagram → Share a Reel → Select "MindSpace"
4. Check the PWA — it should appear!

### 6. Deploy to Vercel

```bash
# Push to GitHub
git add .
git commit -m "Initial commit"
git push origin main

# Import in Vercel dashboard
# Add environment variables
# Deploy!
```

Your PWA will be live at `https://your-project.vercel.app`.

## 📱 How to Use

### Save Content
1. **Instagram/TikTok/X**: Tap Share → "MindSpace"
2. **Safari/Chrome**: Tap Share → "MindSpace"
3. **Any app with share sheet**: Share → "MindSpace"

### Find Content
- **Search**: Semantic + keyword search
- **Chat**: "What did I save about React hooks?"
- **Clusters**: Auto-generated topic groups
- **Filters**: Platform, tags, date range

### Keyboard Shortcuts (Web)
- `⌘K` / `Ctrl+K`: Open search
- `⌘N` / `Ctrl+N`: New chat
- `/`: Focus search
- `Esc`: Close modals

## 🔧 Configuration

### Custom AI Prompts

In Settings → AI, you can override default prompts for:
- Tagging
- Summarization
- Entity extraction
- Chat behavior

### Sync Settings

- **Auto-sync**: Background sync every 15 min (configurable)
- **Wi-Fi only**: Save cellular data
- **Manual sync**: Pull-to-refresh or button

### Theme

- Light / Dark / System

## 📊 Free Tier Limits

| Service | Free Tier | MindSpace Usage |
|---------|-----------|-----------------|
| **Gemini 1.5 Flash** | 1,500 req/day | ~50 saves/day = 1,500/month ✅ |
| **Gemini Embeddings** | Included | Same as above ✅ |
| **Vercel Functions** | 100 GB-hrs/mo | ~1,500 invocations ✅ |
| **Turso** | 9 GB, 1B reads | ~10 MB database ✅ |
| **Vercel Hosting** | 100 GB bandwidth | PWA assets ✅ |

**Total: $0/month**

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, TypeScript, Vite, TanStack Query |
| **Styling** | Tailwind CSS, shadcn/ui-inspired components |
| **PWA** | vite-plugin-pwa (Workbox), Web Share Target API |
| **Offline** | Dexie.js (IndexedDB), Background Sync API |
| **Backend** | Vercel Edge Functions (TypeScript) |
| **Database** | Turso (libSQL) with sqlite-vec for vectors |
| **AI** | Google Gemini 1.5 Flash (free tier) |
| **Deployment** | Vercel (auto-deploy from GitHub) |

## 📁 Project Structure

```
mindspace/
├── apps/
│   ├── web/                 # PWA (React + Vite)
│   │   ├── src/
│   │   │   ├── components/  # UI components
│   │   │   ├── pages/       # Route pages
│   │   │   ├── hooks/       # React Query hooks
│   │   │   ├── services/    # API, IndexedDB, Sync
│   │   │   └── utils/       # Helpers
│   │   └── public/          # Manifest, icons, SW
│   │
│   └── api/                 # Vercel Serverless Functions
│       ├── *.ts             # API routes (ingest, search, chat, clusters, cron)
│       └── lib/             # DB, Gemini, Extractor, Prompts
│
├── packages/
│   └── shared/              # Shared TypeScript types
│
├── vercel.json              # Vercel config (routes, crons)
├── package.json             # Monorepo scripts
└── README.md
```

## 🔮 Future Enhancements

- [ ] Safari Extension for full DOM extraction (rich tags from Reels)
- [ ] Voice notes in share sheet
- [ ] Map view for geo-tagged saves
- [ ] Calendar view for events
- [ ] Export/Import (JSON, Markdown, CSV)
- [ ] Obsidian/Notion sync
- [ ] Collaborative spaces
- [ ] Local Ollama support (when you have a Mac)

## 🤝 Contributing

1. Fork the repo
2. Create feature branch
3. Make changes
4. Submit PR

## 📄 License

MIT — Build your own mind space!

## 🙏 Acknowledgments

- [MyMind](https://mymind.com) for inspiration
- [Stasht](https://stasht.app) for social media focus
- [Recall](https://recall.ai) for AI knowledge base patterns
- [Turso](https://turso.tech) for edge SQLite
- [Vercel](https://vercel.com) for serverless platform
- [Google Gemini](https://ai.google.dev) for free AI tier