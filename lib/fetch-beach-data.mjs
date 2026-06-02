// lib/fetch-beach-data.mjs
//
// Builds the merged beach data array consumed by the FlagWatch frontend (ESM, dependency-free).
//
// Single source of truth for the static beach list is data/beaches.json (47 beaches).
// For every beach we attach:
//   - conditions  (live weather + marine from Open-Meteo, sea temp possibly from Copernicus)
//   - cleanliness (chlorophyll-a water quality from Copernicus, honest "unavailable" on failure)
//
// HONESTY: any missing/failed numeric value is null (never 0). flag is null whenever EITHER
// waveHeight or windSpeed is null (a swim-safety flag must not be inferred from partial inputs).
// cleanliness comes straight from copernicus.getWaterQuality, which already returns an honest
// "unavailable" object on any failure.

import beaches from "../data/beaches.json" with { type: "json" };
import { getWaterQuality, getSeaSurfaceTemp, UNAVAILABLE_CLEANLINESS } from "./copernicus.mjs";

const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";
const MARINE_URL = "https://marine-api.open-meteo.com/v1/marine";
const OPEN_METEO_TIMEOUT_MS = 10000;
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

// Fetch a batched Open-Meteo endpoint. On ANY failure returns [] so that all
// per-beach fields degrade to null rather than throwing the whole build.
async function fetchOpenMeteo(baseUrl, latStr, lngStr, currentParam) {
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
    if (!res.ok) return [];
    const data = await res.json();
    return asArray(data);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// Flag thresholds. SAFETY: a swim-safety flag requires BOTH inputs to be known —
// wave height is the primary drowning hazard, so a missing wave height must NEVER
// resolve to a confident "green/yellow/red". If either input is null, return null
// (the UI renders this as "unknown"), never an implied-safe flag.
function computeFlag(waveHeight, windSpeed) {
  if (waveHeight === null || windSpeed === null) return null;
  if (waveHeight > 2 || windSpeed > 40) return "red";
  if (waveHeight > 1.25 || windSpeed > 25) return "yellow";
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
    ? beaches.map(() => ({ sst: { value: null, source: "open-meteo", observedAt: null }, quality: UNAVAILABLE_CLEANLINESS }))
    : await mapWithConcurrency(beaches, COPERNICUS_CONCURRENCY, async (b) => {
        const { lat, lng } = b.coordinates;
        const [sst, quality] = await Promise.all([
          getSeaSurfaceTemp(lat, lng),
          getWaterQuality(lat, lng),
        ]);
        return { sst, quality };
      });

  const lastUpdated = new Date().toISOString();

  // 3. Merge per beach (by index).
  return beaches.map((beach, i) => {
    const w = weather[i] && weather[i].current ? weather[i].current : {};
    const m = marine[i] && marine[i].current ? marine[i].current : {};
    const { sst, quality } = copernicus[i];

    const waveHeight = num(m.wave_height);
    const airTemp = num(w.temperature_2m);
    const windSpeed = num(w.wind_speed_10m);
    const windGust = num(w.wind_gusts_10m);
    const windDirection = num(w.wind_direction_10m);
    const uvIndex = num(w.uv_index);
    const openMeteoSst = num(m.sea_surface_temperature);

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
        waterTemp,
        waterTempSource,
        airTemp,
        windSpeed,
        windGust,
        windDirection,
        uvIndex,
        flag: computeFlag(waveHeight, windSpeed),
        lastUpdated,
      },
      cleanliness: quality,
    };
  });
}
