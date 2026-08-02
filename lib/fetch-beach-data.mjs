// lib/fetch-beach-data.mjs
//
// Builds the merged beach data array consumed by the FlagWatch frontend (ESM, dependency-free).
//
// Single source of truth for the static beach list is data/beaches.json (56 beaches).
// For every beach we attach:
//   - conditions  (live weather + marine from Open-Meteo, sea temp possibly from Copernicus)
//   - cleanliness (chlorophyll-a water quality from Copernicus, honest "unavailable" on failure)
//
// HONESTY: any missing/failed numeric value is null (never 0). `flag` holds a modelled SEA-STATE
// band (see computeSeaState) — it is NOT a swim-safety flag and must never be rendered as one.
// It is null whenever wave height is missing, or both wind measures are missing.
// cleanliness comes straight from copernicus.getWaterQuality, which already returns an honest
// "unavailable" object on any failure. Note cleanliness is chlorophyll-a (algae) — it says nothing
// about bacteriological bathing-water quality (E. coli / enterococci, Directive 2006/7/EC).

import beaches from "../data/beaches.json" with { type: "json" };
import { getWaterQuality, getSeaSurfaceTemp, getWaveState, UNAVAILABLE_CLEANLINESS } from "./copernicus.mjs";

const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";
const MARINE_URL = "https://marine-api.open-meteo.com/v1/marine";
const OPEN_METEO_TIMEOUT_MS = 10000;
const OPEN_METEO_RETRIES = 3;
const OPEN_METEO_RETRY_BASE_MS = 600; // backoff: 600ms, 1200ms between attempts
// 8, not 12: the full build now makes FOUR WMTS calls per beach (SST, CHL, VHM0, VCMX).
// At 12 the service throttled a large share of wave reads into the Open-Meteo fallback.
const COPERNICUS_CONCURRENCY = 8;

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

// Coerce an Open-Meteo current value to a finite number, else null. NEVER 0 as a default.
function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// Open-Meteo returns a single object for one location, or an array for many.
// Normalise to an array indexed the same as the beaches list.
function asArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") return [payload];
  return [];
}

// One attempt at a batched Open-Meteo request. Throws on timeout / non-OK so the
// retry wrapper can distinguish a transient failure from an empty payload.
async function fetchOpenMeteoOnce(baseUrl, latStr, lngStr, currentParam) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPEN_METEO_TIMEOUT_MS);
  try {
    const p = new URLSearchParams();
    p.set("latitude", latStr);
    p.set("longitude", lngStr);
    p.set("current", currentParam);
    p.set("timezone", "auto");
    const url = `${baseUrl}?${p.toString()}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Open-Meteo ${res.status} for ${baseUrl}`);
    return asArray(await res.json());
  } finally {
    clearTimeout(timer);
  }
}

// Fetch a batched Open-Meteo endpoint with retries. A single transient hiccup
// (timeout / 429 / 5xx) must NOT blank an entire field for every beach — that
// once turned every swim-safety flag "unknown" in production. Retries with
// backoff; only after all attempts fail do we return [] (→ honest nulls).
async function fetchOpenMeteo(baseUrl, latStr, lngStr, currentParam) {
  let lastErr;
  for (let attempt = 1; attempt <= OPEN_METEO_RETRIES; attempt++) {
    try {
      return await fetchOpenMeteoOnce(baseUrl, latStr, lngStr, currentParam);
    } catch (e) {
      lastErr = e;
      if (attempt < OPEN_METEO_RETRIES) {
        await new Promise((r) => setTimeout(r, OPEN_METEO_RETRY_BASE_MS * attempt));
      }
    }
  }
  console.warn(`fetch-beach-data: Open-Meteo batch failed after ${OPEN_METEO_RETRIES} attempts:`, lastErr?.message || lastErr);
  return [];
}

// Sea-state bands. This is NOT a swim-safety flag and must never be presented as one —
// it describes modelled sea conditions offshore. See DATA_SOURCES.md §5 for why.
//
// Calibration history: the original thresholds (>1.25 yellow, >2 red) were ocean-coast numbers
// applied to a fetch-limited basin. Across the whole 2025 bathing season the Black Sea never once
// reached 2 m Hs or 40 km/h mean wind, so "red" was unreachable and ~98% of the season resolved to
// a single band.
//
// The numbers below are for NEARSHORE Copernicus BLKSEA values, which run higher than the old
// Open-Meteo offshore ones (shoaling): observed coast-wide p50 0.74 m vs 0.60 m. They are anchored
// on swimmer-relevant physical magnitudes rather than fitted to any single day — 0.7 m Hs is
// choppy, a 1.5 m breaking crest is dangerous. TODO: revisit once /api/history has a full season,
// which is the first chance to check these against a real local distribution.
//
// GUSTS, NOT MEAN WIND. Gusts run ~2.2x mean here and are what actually builds the short
// steep chop this basin produces; mean wind smooths that away. windGust was already being
// fetched and displayed while this function ignored it.
// ROUGH is driven by VCMX — the model's MAXIMUM CREST HEIGHT — not by significant wave height.
// Hs is the mean of the highest third; roughly 1 in 10 waves exceeds it. What knocks a swimmer
// down is the biggest wave, and this model gives us that directly, so use it rather than applying
// a textbook Rayleigh multiplier to a mean. (Observed VCMX/Hs across the coast today: ~1.35x.)
// Hs still drives MODERATE, and stands in for ROUGH when VCMX is unavailable.
const CREST_ROUGH = 1.5; // m — a breaking crest this size is genuinely dangerous to a swimmer
const WAVE_ROUGH = 1.2; // m Hs — fallback when VCMX is missing
const WAVE_MODERATE = 0.7; // m Hs — choppy
const GUST_ROUGH = 50;
const GUST_MODERATE = 32;
const WIND_ROUGH = 40; // fallback thresholds, mean wind, used only when gust is missing
const WIND_MODERATE = 25;

// HONESTY: requires a known wave height AND at least one known wind measure. A missing
// wave height must NEVER resolve to a confident band — return null (UI renders "unknown"),
// never an implied-calm state. waveMax is optional; its absence degrades ROUGH to the Hs rule
// rather than silently disabling the band.
function computeSeaState(waveHeight, waveMax, windGust, windSpeed) {
  if (waveHeight === null) return null;
  const hasGust = windGust !== null;
  const wind = hasGust ? windGust : windSpeed;
  if (wind === null) return null;
  const roughWind = hasGust ? GUST_ROUGH : WIND_ROUGH;
  const moderateWind = hasGust ? GUST_MODERATE : WIND_MODERATE;
  const roughWave = waveMax !== null ? waveMax > CREST_ROUGH : waveHeight > WAVE_ROUGH;
  if (roughWave || wind > roughWind) return "red";
  if (waveHeight > WAVE_MODERATE || wind > moderateWind) return "yellow";
  return "green";
}

// Run an async mapper over items with a bounded concurrency limit.
// Results are returned in the original index order.
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(null).map(async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) break;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Public API.
// ---------------------------------------------------------------------------

/**
 * buildAllBeachData({ fast } = {}) -> Promise<MergedBeachRecord[]>
 * Loads data/beaches.json, fetches Open-Meteo (batched) + Copernicus (per beach),
 * computes flag + cleanliness, and returns the full merged array.
 *
 * fast=true skips the (slow, ~per-beach) Copernicus calls entirely: water temp comes
 * from Open-Meteo and cleanliness is reported honestly as "unavailable". This keeps the
 * on-demand cold-start path well under Netlify's function timeout; the scheduled collector
 * runs the full build (fast=false) to enrich the snapshot with Copernicus CHL + SST.
 */
export async function buildAllBeachData({ fast = false } = {}) {
  const latStr = beaches.map((b) => b.coordinates.lat).join(",");
  const lngStr = beaches.map((b) => b.coordinates.lng).join(",");

  // 1. Open-Meteo weather + marine, batched and in parallel.
  const [weather, marine] = await Promise.all([
    fetchOpenMeteo(
      WEATHER_URL,
      latStr,
      lngStr,
      "temperature_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m,uv_index"
    ),
    fetchOpenMeteo(MARINE_URL, latStr, lngStr, "wave_height,sea_surface_temperature"),
  ]);

  // 2. Copernicus SST + water quality per beach (skipped in fast mode).
  const copernicus = fast
    ? beaches.map(() => ({
        sst: { value: null, source: "open-meteo", observedAt: null },
        quality: UNAVAILABLE_CLEANLINESS,
        wave: { waveHeight: null, waveMax: null, source: null },
      }))
    : await mapWithConcurrency(beaches, COPERNICUS_CONCURRENCY, async (b) => {
        const { lat, lng } = b.coordinates;
        // Waves are sampled at the pre-calibrated wet point (tools/calibrate-wave-points.mjs),
        // NOT at the pin — a pin on the sand lands on a land cell and returns null.
        const ws = b.waveSample;
        const [sst, quality, wave] = await Promise.all([
          getSeaSurfaceTemp(lat, lng),
          getWaterQuality(lat, lng),
          ws ? getWaveState(ws.lat, ws.lng) : Promise.resolve({ waveHeight: null, waveMax: null, source: null }),
        ]);
        return { sst, quality, wave };
      });

  const lastUpdated = new Date().toISOString();

  // 3. Merge per beach (by index).
  return beaches.map((beach, i) => {
    const w = weather[i] && weather[i].current ? weather[i].current : {};
    const m = marine[i] && marine[i].current ? marine[i].current : {};
    const { sst, quality, wave } = copernicus[i];

    const openMeteoWave = num(m.wave_height);
    const airTemp = num(w.temperature_2m);
    const windSpeed = num(w.wind_speed_10m);
    const windGust = num(w.wind_gusts_10m);
    const windDirection = num(w.wind_direction_10m);
    const uvIndex = num(w.uv_index);
    const openMeteoSst = num(m.sea_surface_temperature);

    // Waves: prefer the 2.5 km Black Sea regional model sampled at this beach's calibrated point
    // (median 2 km offshore, disclosed via waveSampleKm). Fall back to Open-Meteo's global ~8 km
    // MFWAM only when Copernicus has nothing — and SAY SO via waveSource, because that fallback is
    // silently sampled a median 11 km out (max 21 km) and 56 beaches collapse onto 24 of its cells.
    let waveHeight;
    let waveSource;
    let waveSampleKm;
    if (wave && typeof wave.waveHeight === "number" && Number.isFinite(wave.waveHeight)) {
      waveHeight = wave.waveHeight;
      waveSource = wave.source;
      waveSampleKm = beach.waveSample ? beach.waveSample.offsetKm : null;
    } else if (openMeteoWave !== null) {
      waveHeight = openMeteoWave;
      waveSource = "open-meteo-mfwam-8km";
      waveSampleKm = null;
    } else {
      waveHeight = null;
      waveSource = null;
      waveSampleKm = null;
    }
    // Modelled maximum crest height. Only meaningful alongside a Copernicus wave height.
    const waveMax =
      waveSource === wave?.source && typeof wave?.waveMax === "number" && Number.isFinite(wave.waveMax)
        ? wave.waveMax
        : null;

    // Water temp: prefer a finite Copernicus value, else Open-Meteo, else null.
    let waterTemp;
    let waterTempSource;
    if (sst && typeof sst.value === "number" && Number.isFinite(sst.value)) {
      waterTemp = sst.value;
      waterTempSource = sst.source;
    } else if (openMeteoSst !== null) {
      waterTemp = openMeteoSst;
      waterTempSource = "open-meteo";
    } else {
      waterTemp = null;
      waterTempSource = "open-meteo";
    }

    return {
      ...beach,
      conditions: {
        waveHeight,
        waveMax,
        waveSource,
        waveSampleKm,
        waterTemp,
        waterTempSource,
        airTemp,
        windSpeed,
        windGust,
        windDirection,
        uvIndex,
        flag: computeSeaState(waveHeight, waveMax, windGust, windSpeed),
        lastUpdated,
      },
      cleanliness: quality,
    };
  });
}
