// tools/calibrate-wave-points.mjs
//
// ONE-OFF (re-runnable) calibration: resolve, for every beach in data/beaches.json, the nearest
// WET cell of the Copernicus BLKSEA 2.5 km wave model, and write that sample point back into
// beaches.json as `waveSample`.
//
// WHY THIS EXISTS
// Open-Meteo's wave model (MFWAM, ~8 km) land-masks coastal cells and then SILENTLY returns the
// nearest wet cell instead — median 11 km offshore, max 21 km, with 56 beaches collapsing onto 24
// distinct cells. You never learn it happened. The Copernicus BLKSEA model is 2.5 km, solves depth
// refraction + wave breaking, and honestly returns `value: null` on a land pixel. So we do the
// walk-to-water ourselves, ONCE, and record exactly how far we had to go — which turns an invisible
// error into a disclosed, per-beach number the UI can show.
//
// Runtime then does exactly one GetFeatureInfo per beach against a known-good point.
//
// Usage:  node tools/calibrate-wave-points.mjs [--dry-run]
//
// Re-run this if beaches.json coordinates change or the dataset version is bumped.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const BEACHES_FILE = join(HERE, "..", "data", "beaches.json");

const WMTS_BASE = "https://wmts.marine.copernicus.eu/teroWmts";
const WAV_DATASET =
  "BLKSEA_ANALYSISFORECAST_WAV_007_003/cmems_mod_blk_wav_anfc_2.5km_PT1H-i_202411";
const WAV_STYLE = "cmap:amp";
const Z = 10;
const DEG_PER_TILE = 180 / 2 ** Z;

const DRY_RUN = process.argv.includes("--dry-run");
const CONCURRENCY = 6;

// Candidate offsets from the pin, in degrees [dLat, dLng], tried in order: the pin itself first,
// then progressively further seaward. The Bulgarian coast faces broadly EAST, so eastward offsets
// dominate; N/S variants cover bays (Balchik, Burgas) whose water lies off-axis.
// 0.025 deg lng ~ 2.0 km at 43N; 0.08 deg ~ 6.5 km.
const OFFSETS = [
  [0, 0],
  [0, 0.025],
  [0.015, 0.02],
  [-0.015, 0.02],
  [0, 0.05],
  [0.03, 0.04],
  [-0.03, 0.04],
  [0.05, 0.03],
  [-0.05, 0.03],
  [0, 0.08],
  [0.06, 0.06],
  [-0.06, 0.06],
];

function tileFor(lat, lng) {
  const colF = (lng + 180) / DEG_PER_TILE;
  const rowF = (90 - lat) / DEG_PER_TILE;
  const tileCol = Math.floor(colF);
  const tileRow = Math.floor(rowF);
  return {
    tileCol,
    tileRow,
    i: Math.floor((colF - tileCol) * 256),
    j: Math.floor((rowF - tileRow) * 256),
  };
}

function featureInfoUrl(lat, lng, variable) {
  const t = tileFor(lat, lng);
  const p = new URLSearchParams({
    service: "WMTS",
    version: "1.0.0",
    request: "GetFeatureInfo",
    layer: `${WAV_DATASET}/${variable}`,
    style: WAV_STYLE,
    format: "image/png",
    infoformat: "application/json",
    tilematrixset: "EPSG:4326",
    tilematrix: String(Z),
    tilerow: String(t.tileRow),
    tilecol: String(t.tileCol),
    i: String(t.i),
    j: String(t.j),
  });
  return `${WMTS_BASE}?${p.toString()}`;
}

async function probe(lat, lng) {
  try {
    const res = await fetch(featureInfoUrl(lat, lng, "VHM0"), {
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const v = json?.features?.[0]?.properties?.value;
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

// Great-circle distance, km.
function haversineKm(aLat, aLng, bLat, bLng) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

async function resolveBeach(beach) {
  const { lat, lng } = beach.coordinates;
  for (const [dLat, dLng] of OFFSETS) {
    const sLat = lat + dLat;
    const sLng = lng + dLng;
    const v = await probe(sLat, sLng);
    if (v !== null) {
      return {
        lat: Number(sLat.toFixed(5)),
        lng: Number(sLng.toFixed(5)),
        offsetKm: Number(haversineKm(lat, lng, sLat, sLng).toFixed(2)),
        probe: v,
      };
    }
  }
  return null;
}

async function main() {
  const raw = await readFile(BEACHES_FILE, "utf8");
  const beaches = JSON.parse(raw);
  console.log(`calibrating ${beaches.length} beaches against ${WAV_DATASET}\n`);

  const resolved = new Array(beaches.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (true) {
        const i = next++;
        if (i >= beaches.length) break;
        resolved[i] = await resolveBeach(beaches[i]);
        const r = resolved[i];
        console.log(
          `  ${beaches[i].id.padEnd(24)} ${
            r ? `${String(r.offsetKm).padStart(5)} km  VHM0=${r.probe.toFixed(2)}` : "UNRESOLVED"
          }`
        );
      }
    })
  );

  const ok = resolved.filter(Boolean);
  const offsets = ok.map((r) => r.offsetKm).sort((a, b) => a - b);
  const atPin = ok.filter((r) => r.offsetKm === 0).length;
  const median = offsets[Math.floor(offsets.length / 2)];
  console.log(
    `\nresolved ${ok.length}/${beaches.length} | at pin: ${atPin} | median offset: ${median} km | max: ${offsets.at(-1)} km`
  );

  const unresolved = beaches.filter((_, i) => !resolved[i]).map((b) => b.id);
  if (unresolved.length) console.log(`UNRESOLVED: ${unresolved.join(", ")}`);

  if (DRY_RUN) {
    console.log("\n--dry-run: beaches.json not written");
    return;
  }

  for (let i = 0; i < beaches.length; i++) {
    const r = resolved[i];
    // No wet cell found => omit waveSample entirely. Runtime then reports the wave height as
    // unavailable rather than silently sampling somewhere arbitrary.
    if (!r) {
      delete beaches[i].waveSample;
      continue;
    }
    beaches[i].waveSample = { lat: r.lat, lng: r.lng, offsetKm: r.offsetKm };
  }

  await writeFile(BEACHES_FILE, JSON.stringify(beaches, null, 2) + "\n");
  console.log(`\nwrote waveSample into ${BEACHES_FILE}`);
}

main().catch((e) => {
  console.error("calibration failed:", e);
  process.exit(1);
});
