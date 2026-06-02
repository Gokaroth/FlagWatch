# CLAUDE.md — FlagWatch

Working guide for Claude in this repo. Deeper detail: `AI_CONTEXT_MEMO.md`, `DATA_SOURCES.md`, `ROADMAP.md`.

FlagWatch is a real-time **beach safety + water-cleanliness PWA** for the Bulgarian Black Sea coast (47 beaches). Live at flagwatch.netlify.app. Vanilla JS, **no build step**, Netlify Functions backend.

## ⛔ Prime directive: never fabricate data
This is a safety app. Honor these invariants in every change:
- A missing/failed numeric value is `null` and renders as `—`. **Never** default to `0`.
- Water cleanliness is `clear | moderate | high | unavailable`. `unavailable` is a real, visible (neutral-grey) state — it is shown whenever there's no genuine numeric CHL value and **must never imply clean water**.
- The safety flag needs **both** wave height and wind speed; if either is missing it is `null` → "⚪ Unknown" (never an assumed-safe green).
- Water temperature is a modeled estimate and shows a disclaimer.
Don't reintroduce any "demo"/synthetic fallback.

## Architecture (buildless static + Netlify Functions v2, ESM)
```
data/beaches.json            single source of truth (47 beaches: id, name, name_bg,
                             coordinates{lat,lng}, region, type, facilities, description, description_bg)
app.js                       class BeachSafetyApp — Leaflet map, list, modal, EN/BG i18n, theme, PWA
index.html / style.css       UI + themes (CSS custom properties, light/dark)
sw.js                        service worker (precache + network-first)
lib/copernicus.mjs           Copernicus Marine WMTS (CHL + Black Sea SST), honest "unavailable" on failure
lib/fetch-beach-data.mjs     buildAllBeachData({fast}) — Open-Meteo (batched, current=) + Copernicus
netlify/functions/
  collect.mjs                SCHEDULED (every 2h) — just triggers the background worker, returns <1s
  collect-background.mjs     BACKGROUND (15-min) — full build → writes Netlify Blobs ("flagwatch"/"latest")
  get-beach-data.mjs         on-demand at /api/beaches — serves the Blob; cold-start = FAST (Open-Meteo only)
```
Data flow: frontend `GET /api/beaches` → merged records (static + live). Frontend also fetches `/data/beaches.json` for instant first render.

### Merged record shape (the data contract — keep field names exact)
`conditions`: `waveHeight, waterTemp, waterTempSource, airTemp, windSpeed, windGust, windDirection, uvIndex, flag, lastUpdated` (numbers or `null`; `flag` = `green|yellow|red|null`)
`cleanliness`: `status, value, source, observedAt, report_en, report_bg`

## Conventions
- **No build step.** Don't add Vite/bundlers, TypeScript compilation, or `@google/genai` (all were removed). Functions are ESM (`export default async (req,context)=>Response`); never `exports.handler` (package.json is `"type":"module"`).
- **i18n**: add every new UI string to BOTH `en` and `bg` in the `translations` object in `app.js`. Elements whose `id` matches a translation key are auto-filled by `applyLanguage()`.
- **Rendering**: use the `fmt()` helper for numbers (returns `—` for null). DOM is in `index.html`; any new element id used by `app.js` must exist there.
- **CSS**: reuse the existing custom properties / dark-mode selectors; don't hardcode colors.

## Run & verify locally
```bash
npm install
npx netlify-cli dev        # http://localhost:8888 — static + functions + local Blobs
```
- `GET /api/beaches` works (first hit = fast Open-Meteo cold-start).
- To get enriched Copernicus data locally: `curl -X POST localhost:8888/.netlify/functions/collect-background` (202; runs in background), then re-GET `/api/beaches`.
- Quick syntax gate: `node --check <file>` on each `.js`/`.mjs`.
- There's no test runner; a jsdom smoke test pattern was used during the overhaul (stub `L`/`fetch`/`localStorage`, load index.html + app.js, assert honest rendering).

## Deploy & gotchas
- Deploy = push to GitHub `main`; Netlify builds with **no build command** (`netlify.toml`: `command=""`, `publish="."`). `/api/beaches` → `get-beach-data` via redirect.
- **Copernicus WMTS is keyless** — no env vars needed. Dormant auth (`COPERNICUS_USERNAME/PASSWORD/TOKEN`) only if it ever starts requiring auth.
- **Netlify scheduled functions have a hard 30s limit** — that's why the heavy build lives in `collect-background.mjs` (15-min background). Don't move the full Copernicus build back into `collect.mjs` or the on-demand path.
- Scheduled functions don't auto-run on deploy previews; enrich a preview by POSTing to `collect-background` once.
- Commits: author with the GitHub noreply email (push protection blocks private emails). Pushing to `main` is the user's action.
