# CLAUDE.md — FlagWatch

Working guide for Claude in this repo. Deeper detail: `AI_CONTEXT_MEMO.md`, `DATA_SOURCES.md`, `ROADMAP.md`.

FlagWatch is a real-time **beach safety + water-cleanliness PWA** for the Bulgarian Black Sea coast (47 beaches). Live at flagwatch.gokaroth.com. Vanilla JS frontend (**no build step**); a single Node server (`server.mjs`) backend on **Fly.io** (migrated off Netlify).

## ⛔ Prime directive: never fabricate data
This is a safety app. Honor these invariants in every change:
- A missing/failed numeric value is `null` and renders as `—`. **Never** default to `0`.
- Water cleanliness is `clear | moderate | high | unavailable`. `unavailable` is a real, visible (neutral-grey) state — it is shown whenever there's no genuine numeric CHL value and **must never imply clean water**.
- The safety flag needs **both** wave height and wind speed; if either is missing it is `null` → "⚪ Unknown" (never an assumed-safe green).
- Water temperature is a modeled estimate and shows a disclaimer.
Don't reintroduce any "demo"/synthetic fallback.

## Architecture (buildless static frontend + one Node server on Fly.io, ESM)
```
data/beaches.json            single source of truth (47 beaches: id, name, name_bg,
                             coordinates{lat,lng}, region, type, facilities, description, description_bg)
app.js                       class BeachSafetyApp — Leaflet map, list, modal, EN/BG i18n, theme, PWA,
                             SSE live-refresh, trend sparklines
index.html / style.css       UI + themes (CSS custom properties, light/dark, WCAG 2.2 AA)
sw.js                        service worker (precache + network-first)
lib/copernicus.mjs           Copernicus Marine WMTS (CHL + Black Sea SST), honest "unavailable" on failure
lib/fetch-beach-data.mjs     buildAllBeachData({fast}) — Open-Meteo (batched, current=) + Copernicus
server.mjs                   THE BACKEND (zero deps). Serves static files + the API; runs the
                             collector in-process. Endpoints:
                               GET /api/beaches    current snapshot (array)
                               GET /api/status     build metadata / freshness / counts
                               GET /healthz        Fly health check
                               GET /api/stream     SSE — pushes {updatedAt} after each build
                               GET /api/history?beach=<id>&range=24h|7d   rolling samples
                             Boot: load snapshot → fast build (Open-Meteo) → full build → 2h refresh.
                             State persisted to STATE_DIR (Fly volume /state): snapshot.json + history.json.
Dockerfile / fly.toml        node:22-alpine image; Fly app (region fra, /state volume, /healthz check)
```
Data flow: frontend `GET /api/beaches` → merged records; `EventSource('/api/stream')` triggers a
refetch when a new build lands. Frontend also fetches `/data/beaches.json` for instant first render.
No 30s/15min function limits on Fly, so the full Copernicus build runs inline (no collect/background split).

### Merged record shape (the data contract — keep field names exact)
`conditions`: `waveHeight, waterTemp, waterTempSource, airTemp, windSpeed, windGust, windDirection, uvIndex, flag, lastUpdated` (numbers or `null`; `flag` = `green|yellow|red|null`)
`cleanliness`: `status, value, source, observedAt, report_en, report_bg`

## Conventions
- **No build step (frontend).** Don't add Vite/bundlers, TypeScript compilation, or `@google/genai` (all were removed). Everything is ESM (`"type":"module"`). The server (`server.mjs`) uses only Node built-ins + global `fetch` — **keep it dependency-free** (it ships as a plain `node server.mjs`, no install needed).
- **i18n**: add every new UI string to BOTH `en` and `bg` in the `translations` object in `app.js`. Elements whose `id` matches a translation key are auto-filled by `applyLanguage()`.
- **Rendering**: use the `fmt()` helper for numbers (returns `—` for null). DOM is in `index.html`; any new element id used by `app.js` must exist there.
- **CSS**: reuse the existing custom properties / dark-mode selectors; don't hardcode colors.

## Run & verify locally
```bash
npm install                     # dev tooling only (jsdom/axe); server has no runtime deps
STATE_DIR=./.state npm start    # node server.mjs → http://localhost:8080
```
- Boot does a fast Open-Meteo build (~2s) then the full Copernicus build; refreshes every 2h.
- Endpoints: `/api/beaches`, `/api/status`, `/healthz`, `/api/stream` (SSE), `/api/history?beach=<id>&range=24h|7d`.
- Quick syntax gate: `node --check <file>` on each `.js`/`.mjs`.
- `npm test` runs `test/a11y-smoke.mjs` (jsdom + axe-core): asserts honest rendering, keyboard a11y,
  and EN/BG i18n parity. axe can't do colour-contrast in jsdom — the harness computes WCAG ratios
  from the CSS tokens instead.

## Deploy & gotchas
- **Deploy = `fly deploy`** (manual; builds the Docker image, boots 1 machine in `fra`). App name `flagwatch`; served at `flagwatch.gokaroth.com` (Cloudflare CNAME → `flagwatch.fly.dev`, `fly certs add`).
- The machine is **always-on** (`auto_stop_machines='off'`, `min_machines_running=1`) so the in-process 2h collector keeps running. A **Fly volume** `flagwatch_state` at `/state` persists `snapshot.json` + `history.json` across deploys (create it before the first deploy).
- **Copernicus WMTS is keyless** — no env vars needed. Dormant auth (`COPERNICUS_USERNAME/PASSWORD/TOKEN`) only if it ever starts requiring auth.
- The manifest `Content-Type: application/manifest+json` is set by `server.mjs`'s MIME map (no Netlify header config anymore).
- `fly auth login` is interactive (the user's action). Commits: author with the GitHub noreply email (push protection blocks private emails). Pushing to `main` is the user's action.
