# FlagWatch — Technical Context Memo

**Last updated:** 2026-06-03

A concise orientation for any developer or AI agent picking up this project. It describes the
*current* architecture after the 2026 honesty/reliability overhaul **and the migration from Netlify
to Fly.io**. For data-source detail see `DATA_SOURCES.md`; for direction see `ROADMAP.md`; for the
day-to-day working guide see `CLAUDE.md`.

---

## 1. What FlagWatch is

A real-time **beach safety + water-cleanliness** Progressive Web App for the Bulgarian Black Sea
coast (**56 beaches**, Durankulak → Rezovo). Live at **https://flagwatch.gokaroth.com**. Bilingual
EN/BG, light/dark theme, installable PWA, offline-capable.

**Guiding principle: never fabricate.** This is a safety tool. Missing data is shown as
unknown/unavailable — it is never papered over with a plausible-looking number or a reassuring
"green / clear". (The previous version generated "plausible demo data" on failure; that has been
removed.)

## 2. Architecture

Buildless static frontend + **one dependency-free Node server** (`server.mjs`) on **Fly.io**. No
bundler, no serverless functions, no install step for the server.

```
data/beaches.json   single source of truth (56 beaches: id, names EN/BG, coordinates — verified
                    against OpenStreetMap natural=beach polygons — region, type, facilities,
                    descriptions). Frontend fetches it for an instant first render; the server imports it.

Frontend (repo root, served by server.mjs):
  index.html   DOM + PWA head (real /manifest.webmanifest + /icons)
  app.js       class BeachSafetyApp — Leaflet map, list, beach-detail modal (Show on Map,
               Directions → Google Maps, Share with clipboard fallback), EN/BG i18n, theme, PWA,
               SSE live-refresh, trend sparklines, geolocation. Fetches /data/beaches.json then GET /api/beaches.
  style.css    themes + responsive (WCAG 2.2 AA). NOTE: .custom-marker-icon MUST stay position:absolute —
               position:relative drops markers into the pane's normal flow and they drift on zoom.
  sw.js        service worker — precache + NETWORK-FIRST (so a deploy reaches users on reload, no cache bump needed)

Backend (server.mjs, ESM, zero runtime deps — Node built-ins + global fetch):
  lib/copernicus.mjs        Copernicus Marine WMTS GetFeatureInfo (KEYLESS today). CHL water quality
                            + Black Sea SST. Returns honest "unavailable"/null on any failure.
  lib/fetch-beach-data.mjs  buildAllBeachData({fast}) — batched Open-Meteo (current=, retries 3× on a
                            transient failure so one hiccup can't blank every flag) + per-beach
                            Copernicus; computes flag + cleanliness. fast=true skips Copernicus.
  server.mjs                serves static files + the API; runs the collector in-process. Endpoints:
                              GET /api/beaches   current snapshot (array)
                              GET /api/status    build metadata / freshness / counts
                              GET /healthz       Fly health check
                              GET /api/stream    SSE — pushes {updatedAt} after each build
                              GET /api/history?beach=<id>&range=24h|7d   rolling samples
                            Boot: load snapshot → fast build (Open-Meteo) → full build → 2h refresh.
                            State persisted to STATE_DIR (Fly volume /state): snapshot.json + history.json.
```

**Why one in-process server (vs. the old Netlify Functions + Blobs split):** Fly has no 30 s / 15 min
function limits, so the full Copernicus build runs inline — no `collect` / `collect-background` split.
An always-on machine keeps the 2 h collector running; a **Fly volume** (`flagwatch_state` at `/state`)
persists the snapshot + history across deploys; and SSE pushes `{updatedAt}` so open browsers refetch
the moment a new build lands. Users still get a precomputed snapshot instantly instead of waiting on
the external calls.

### Merged beach record (what `/api/beaches` returns — an array of these)
```
{ ...static fields from beaches.json,
  conditions: { waveHeight, waterTemp, waterTempSource, airTemp, windSpeed, windGust,
                windDirection, uvIndex, flag, lastUpdated },   // numbers or null; flag green|yellow|red|null
  cleanliness: { status, value, source, observedAt, report_en, report_bg } }  // status clear|moderate|high|unavailable
```

## 3. Data sources (verified live 2026-06-03)

- **Beach coordinates**: each beach is snapped to its OpenStreetMap `natural=beach` polygon (verified
  via Nominatim + an Overpass sweep of the coast). Keeps both the map pin and the Open-Meteo/Copernicus
  sample point on the actual shoreline.
- **Open-Meteo** (keyless): forecast `current=temperature_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m,uv_index`;
  marine `current=wave_height,sea_surface_temperature`. Batched multi-location (one array response),
  with retry-on-transient-failure. Using `current=` fixed an earlier UTC `getHours()` hourly-index bug.
- **Copernicus Marine WMTS** `https://wmts.marine.copernicus.eu/teroWmts` (the old `nrt.cmems-du.eu`
  WMS was decommissioned April 2024). GetFeatureInfo, `INFOFORMAT=application/json`:
  - CHL (algae): `OCEANCOLOUR_BLK_BGC_L4_NRT_009_152` — gap-free daily L4, 1 km (so coastal point
    queries return a value instead of cloud-gapped nulls). CHL lags ~1 day; code tries recent dates.
  - SST: `BLKSEA_ANALYSISFORECAST_PHY_007_001` — Black Sea physics ~2.5 km, surface `thetao`. Falls
    back to Open-Meteo SST (labeled `waterTempSource:"open-meteo"`) when the model pixel is null/land.

## 4. Honesty rules (do not regress these)

- Missing/failed numeric → `null` → UI renders `—`. **Never** default to `0`.
- `cleanliness.status` is `clear/moderate/high` **only** with a real numeric CHL value; any failure
  (network, non-2xx, 401/403, null, NaN) → `unavailable` (neutral grey, never implies clean water).
- Safety **flag requires BOTH** wave height and wind speed; if either is missing the flag is `null`
  → "⚪ Unknown" (never an implied-safe green).
- Water temp shows a disclaimer (modeled estimate; shoreline may differ 2–4 °C).
- Thresholds: flag red `wave>2m OR wind>40km/h`, yellow `>1.25m OR >25km/h`, else green.
  CHL `>=20 high, >=5 moderate, else clear`.

## 5. Config / env / local dev

- `package.json`: `"type":"module"`; **no runtime deps** (server is `node server.mjs`, no install).
  Dev tooling only: jsdom + axe for `npm test`. (`@netlify/blobs`, `@google/genai`, vite all removed.)
- Local: `STATE_DIR=./.state npm start` → http://localhost:8080. First boot does a fast Open-Meteo
  build (~2 s) then the full Copernicus build; refreshes every 2 h. Node 22+ (global fetch).
- Deploy: **`fly deploy`** (manual; builds the `node:22-alpine` Docker image, boots 1 always-on
  machine in `fra`). Fly volume `flagwatch_state` at `/state`. Served at `flagwatch.gokaroth.com`
  (Cloudflare CNAME → `flagwatch.fly.dev`).
- **Copernicus creds are OPTIONAL** — WMTS is currently keyless. Dormant auth uses
  `COPERNICUS_USERNAME`/`COPERNICUS_PASSWORD` or `COPERNICUS_TOKEN` (see `.env.example`).

## 6. Known limitations / next steps

- Coastal **SST accuracy** is bounded by model resolution → disclaimer shown.
- ~Half the beaches currently report CHL **`unavailable`** because the exact shoreline point lands on
  a land/coastal-masked grid cell. **Refinement idea:** sample a point nudged slightly seaward.
- L4 CHL is gap-filled/modeled (not a single raw observation) — stated transparently.
- On a brand-new deploy, cleanliness is `unavailable` until the first full build completes (seconds).
- ROADMAP **Phase 3** = official ground-truth (NIMH / buoys) fusion (future).

## 7. Note

This memo replaced an earlier, shorter one. (A long personal chat log once lived in a *local,
uncommitted* copy of this file but was never committed to git — verified: no personal content
appears anywhere in the repo's history.)
