# CLAUDE.md — FlagWatch

Working guide for Claude in this repo. Deeper detail: `AI_CONTEXT_MEMO.md`, `DATA_SOURCES.md`, `ROADMAP.md`.

FlagWatch is a real-time **sea-conditions + algae PWA** for the Bulgarian Black Sea coast (56 beaches). Live at flagwatch.gokaroth.com. Vanilla JS frontend (**no build step**); a single Node server (`server.mjs`) backend on **Fly.io** (migrated off Netlify).

## ⛔ Prime directive: never fabricate data
This is a safety app. Honor these invariants in every change:
- A missing/failed numeric value is `null` and renders as `—`. **Never** default to `0`.
- Algae (CHL) is `clear | moderate | high | unavailable`. `unavailable` is a real, visible (neutral-grey) state — shown whenever there's no genuine numeric CHL value and **must never imply clean water**. CHL measures **algae, not bacteria** — it is not an EU bathing-water quality assessment (Directive 2006/7/EC uses E. coli / intestinal enterococci). Never label it "cleanliness" in user-facing copy.
- **`flag` is a modelled SEA-STATE band, never a swim-safety flag.** Real Bulgarian flags are set by a lifeguard on the sand (ПМС № 82/2024) with no numeric thresholds, only at guarded beaches, and are published nowhere. So: never render it in official-flag language, never assure the user that swimming is safe, never state that swimming is prohibited, and always keep the "follow the flag on the beach" notice visible. It needs a wave height AND at least one wind measure; otherwise `null` → "Unknown" (never an assumed-calm green).
- Honesty applies to **derived** values too, not just missing ones. A present, well-formed, confidently-wrong band is the failure mode that matters here — if the whole coast resolves to one band, that is a bug, not a calm day.
- **The rip-current advisory is unconditional.** `#rip-section` must stay visible on every beach in every condition. Rips (BG: **мъртво течение** / обратно течение / „сулган") form in 0.3-0.6 m water, which is this coast's MEDIAN condition and what the app labels Calm, and no model can detect them. Never gate it on wave height or sea state. Note Bulgarian media routinely conflate мъртво течение (rip current) with мъртво вълнение (swell), so a user may read "Спокойно" as "no rip" — the advisory is what prevents that.
- Water temperature is a modeled estimate and shows a disclaimer.
Don't reintroduce any "demo"/synthetic fallback.

## Architecture (buildless static frontend + one Node server on Fly.io, ESM)
```
data/beaches.json            single source of truth (56 beaches: id, name, name_bg,
                             coordinates{lat,lng} — verified against OSM natural=beach polygons —
                             region, type, facilities, description, description_bg)
app.js                       class BeachSafetyApp — Leaflet map, list, modal, EN/BG i18n, theme, PWA,
                             SSE live-refresh, trend sparklines. Modal footer actions: Show on Map,
                             Directions (Google Maps), Share (native sheet → clipboard fallback)
index.html / style.css       UI + themes (CSS custom properties, light/dark, WCAG 2.2 AA)
sw.js                        service worker (precache + network-first)
lib/nimh.mjs                 NIMH/IO-BAS buoy network scrape (mm.meteo-varna.net) — the only
                             MEASURED data in the app; QC-filters physically impossible rows
lib/copernicus.mjs           Copernicus Marine WMTS: CHL + Black Sea SST + the 2.5km BLKSEA WAVE
                             model (VHM0/VCMX); honest null/"unavailable" on failure
tools/calibrate-wave-points.mjs  one-off: resolves each beach's nearest WET 2.5km wave cell and
                             writes `waveSample` {lat,lng,offsetKm} into beaches.json. Re-run if
                             coordinates change or the dataset version is bumped.
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
`conditions`: `waveHeight, waveMax, waveSource, waveSampleKm, waterTemp, waterTempSource, airTemp, windSpeed, windGust, windDirection, uvIndex, flag, lastUpdated` (numbers or `null`; `flag` = `green|yellow|red|null` — internal keys kept for the data contract/history/CSS, but they mean **calm|moderate|rough**, not safe|caution|danger)
`cleanliness`: `status, value, source, observedAt, report_en, report_bg`
`observed` (top level, or `null`): `buoyId, buoyName, buoyNameEn, operator, lat, lng, observedAt, hm0, hmax, t02, tp, waterTemp, windSpeed, distanceKm` — a MEASURED buoy reading. Never feeds `flag`.

## Conventions
- **No build step (frontend).** Don't add Vite/bundlers, TypeScript compilation, or `@google/genai` (all were removed). Everything is ESM (`"type":"module"`). The server (`server.mjs`) uses only Node built-ins + global `fetch` — **keep it dependency-free** (it ships as a plain `node server.mjs`, no install needed).
- **i18n**: add every new UI string to BOTH `en` and `bg` in the `translations` object in `app.js`. Elements whose `id` matches a translation key are auto-filled by `applyLanguage()`.
- **Rendering**: use the `fmt()` helper for numbers (returns `—` for null). DOM is in `index.html`; any new element id used by `app.js` must exist there.
- **CSS**: reuse the existing custom properties / dark-mode selectors; don't hardcode colors.
- **Map markers**: `.custom-marker-icon` MUST stay `position: absolute`. Leaflet positions marker
  icons absolutely (out of flow) via a transform; `position: relative` drops them into the pane's
  normal flow and they drift progressively on zoom. `iconAnchor` is the box centre `[15,21]` (round
  disc). Verify marker placement at MULTIPLE zoom levels.

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
