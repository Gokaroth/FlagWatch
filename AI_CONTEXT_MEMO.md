# FlagWatch — Technical Context Memo

**Last updated:** 2026-06-02

A concise orientation for any developer or AI agent picking up this project. It describes the
*current* architecture after the 2026 honesty/reliability overhaul. For data-source detail see
`DATA_SOURCES.md`; for direction see `ROADMAP.md`.

---

## 1. What FlagWatch is

A real-time **beach safety + water-cleanliness** Progressive Web App for the Bulgarian Black Sea
coast (**47 beaches**, Durankulak → Rezovo). Live at **flagwatch.netlify.app**. Bilingual EN/BG,
light/dark theme, installable PWA, offline-capable. Hosted on Netlify.

**Guiding principle: never fabricate.** This is a safety tool. Missing data is shown as
unknown/unavailable — it is never papered over with a plausible-looking number or a reassuring
"green / clear". (The previous version generated "plausible demo data" on failure; that has been
removed.)

## 2. Architecture

Buildless static frontend + Netlify Functions backend. No bundler.

```
data/beaches.json          ← single source of truth (47 beaches: id, names EN/BG, coordinates,
                             region, type, facilities, descriptions). Frontend fetches it for an
                             instant first render; functions import it.

Frontend (repo root, served statically):
  index.html               DOM + PWA head (real /manifest.webmanifest + /icons)
  app.js                   class BeachSafetyApp — Leaflet map, list, modal, i18n, theme, PWA,
                           geolocation. Fetches /data/beaches.json then GET /api/beaches.
  style.css                themes + responsive
  sw.js                    service worker (cache v11), precaches core assets + beaches.json

Backend (Netlify Functions v2, ESM, export default => Response):
  lib/copernicus.mjs       Copernicus Marine WMTS GetFeatureInfo (KEYLESS today). CHL water
                           quality + Black Sea SST. Returns honest "unavailable"/null on any
                           failure. Optional auth wiring is dormant (env vars below).
  lib/fetch-beach-data.mjs buildAllBeachData({fast}) — batched Open-Meteo (current=) + per-beach
                           Copernicus; computes flag + cleanliness. fast=true skips Copernicus.
  netlify/functions/collect.mjs        SCHEDULED every 2h → writes the full snapshot to Netlify
                                       Blobs (store "flagwatch", key "latest").
  netlify/functions/get-beach-data.mjs On-demand, served at /api/beaches (netlify.toml redirect).
                                       Reads the Blobs snapshot (instant). Cold start: fast
                                       Open-Meteo-only build, persists, serves.
```

**Why collector + Blobs:** users get a precomputed snapshot instantly instead of waiting on
~94 external calls per request; the slow/uncertain Copernicus work happens in the background
where it can fail gracefully; and it decouples user load from third-party APIs.

### Merged beach record (what `/api/beaches` returns — an array of these)
```
{ ...static fields from beaches.json,
  conditions: { waveHeight, waterTemp, waterTempSource, airTemp, windSpeed, windGust,
                windDirection, uvIndex, flag, lastUpdated },   // numbers or null; flag green|yellow|red|null
  cleanliness: { status, value, source, observedAt, report_en, report_bg } }  // status clear|moderate|high|unavailable
```

## 3. Data sources (verified live 2026-06-02)

- **Open-Meteo** (keyless): forecast `current=temperature_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m,uv_index`;
  marine `current=wave_height,sea_surface_temperature`. Batched multi-location (one array response).
  Using `current=` fixed an earlier UTC `getHours()` hourly-index bug.
- **Copernicus Marine WMTS** `https://wmts.marine.copernicus.eu/teroWmts` (the old
  `nrt.cmems-du.eu` WMS was decommissioned April 2024). GetFeatureInfo, `INFOFORMAT=application/json`:
  - CHL (algae): `OCEANCOLOUR_BLK_BGC_L4_NRT_009_152` — gap-free daily L4, 1 km (chosen so coastal
    point queries return a value instead of cloud-gapped nulls). CHL lags ~1 day; code tries recent dates.
  - SST: `BLKSEA_ANALYSISFORECAST_PHY_007_001` — Black Sea physics ~2.5 km, surface `thetao`.
    Falls back to Open-Meteo SST (labeled `waterTempSource:"open-meteo"`) when the model pixel is null/land.

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

- `package.json`: `"type":"module"`; dep `@netlify/blobs`. (`@google/genai` + vite removed.)
- `netlify.toml`: `command=""`, `publish="."` (stops Netlify's Vite auto-detect), functions dir,
  `/api/beaches` → `/.netlify/functions/get-beach-data` redirect.
- **Copernicus creds are OPTIONAL** — WMTS is currently keyless. Dormant auth uses
  `COPERNICUS_USERNAME`/`COPERNICUS_PASSWORD` or `COPERNICUS_TOKEN` (see `.env.example`). Set them
  as Netlify env vars only if Copernicus ever starts requiring auth.
- Local: `npm install` then `npx netlify-cli dev` → http://localhost:8888 (static + functions +
  local Blobs). `/api/beaches` works; first hit cold-starts a fast build. Node 18+ (global fetch).
- Deploy: push to GitHub `main`; Netlify builds (no build step) and registers the scheduled `collect`.

## 6. Known limitations / next steps

- Coastal **SST accuracy** is bounded by model resolution → disclaimer shown.
- ~Half the beaches currently report CHL **`unavailable`** because the exact shoreline point lands on
  a land/coastal-masked grid cell. **Refinement idea:** sample a point nudged slightly seaward.
- L4 CHL is gap-filled/modeled (not a single raw observation) — stated transparently.
- On a brand-new deploy, cleanliness is `unavailable` until the first scheduled collector run (≤2h).
- ROADMAP **Phase 3** = official ground-truth (NIMH / buoys) fusion (future).

## 7. Repo hygiene note

A prior version of this file contained a pasted personal conversation. It has been replaced; see
`HISTORY_SCRUB.md` for removing that content from past git history.
