// lib/copernicus.mjs
//
// Copernicus Marine WMTS integration for FlagWatch (ESM, dependency-free).
//
// Service:  https://wmts.marine.copernicus.eu/teroWmts  (the old nrt.cmems-du.eu is decommissioned)
// Method:   WMTS GetFeatureInfo with INFOFORMAT=application/json
//
// Verified LIVE (2026-06-02), KEYLESS (no auth header), HTTP 200, application/json:
//
//   Chlorophyll-a (CHL), gap-free daily L4, 1km multi-sensor:
//     layer = OCEANCOLOUR_BLK_BGC_L4_NRT_009_152/cmems_obs-oc_blk_bgc-plankton_nrt_l4-gapfree-multi-1km_P1D_202207/CHL
//     Sunny Beach (42.688,27.714) -> value 1.1439647674560547 milligram m^-3
//     Varna       (43.205,27.916) -> value null  (coastal/land pixel => honest "unavailable")
//
//   Sea-surface temperature (thetao, surface elevation), Black Sea physics ~2.5-3km:
//     layer = BLKSEA_ANALYSISFORECAST_PHY_007_001/cmems_mod_blk_phy-temp_anfc_2.5km_P1D-m_202511/thetao
//     Sunny Beach (42.688,27.714) -> value 19.38 degrees_C (time 2026-06-01)
//
// TileMatrixSet: EPSG:4326 (urn:ogc:def:crs:EPSG::4326), the GoogleCRS84Quad grid.
//   TopLeftCorner = (lat 90.0, lon -180.0); 256x256 tiles; 11 levels (0..10).
//   Level z: MatrixWidth = 2^(z+1), MatrixHeight = 2^z.
//   We query level 10 (finest available) for best point precision.
//
// Tile math (level z, lon in [-180,180], lat in [-90,90]):
//   degPerTile = 180 / 2^z          (same span for lon-per-tile and lat-per-tile on this grid)
//   colF = (lon + 180) / degPerTile ; tileCol = floor(colF) ; I = floor((colF - tileCol) * 256)
//   rowF = (90  - lat) / degPerTile ; tileRow = floor(rowF) ; J = floor((rowF - tileRow) * 256)
//
// TIME handling: CHL is an OBSERVATION product whose latest available day lags ~1 day, so
//   requesting time="today" returns HTTP 400 (out of range). We therefore try a few recent
//   UTC-midnight dates (today, then back a few days) and accept the first that yields a finite
//   numeric value; observedAt is set to that exact requested date. If every pinned date is
//   rejected with a 400 (date-format/range drift), we fall back to OMITTING time (the server
//   then uses its own latest "Default"), in which case observedAt is null (the response body
//   does not echo the resolved time). SST (thetao) is a FORECAST product and accepts today.
//
// AUTH: keyless works today. If Copernicus ever starts returning 401/403/HTML, the code
//   automatically attaches HTTP Basic auth from process.env.COPERNICUS_USERNAME /
//   COPERNICUS_PASSWORD when those are present. With no creds and a non-2xx/non-JSON
//   response, both functions degrade honestly to unavailable / null.

const WMTS_BASE = "https://wmts.marine.copernicus.eu/teroWmts";

const CHL_LAYER =
  "OCEANCOLOUR_BLK_BGC_L4_NRT_009_152/cmems_obs-oc_blk_bgc-plankton_nrt_l4-gapfree-multi-1km_P1D_202207/CHL";
const CHL_STYLE = "cmap:algae";
const CHL_PRODUCT_SHORT = "OCEANCOLOUR_BLK_BGC_L4_NRT_009_152";

// Black Sea REGIONAL wave model, 2.5 km, hourly (WAM Cycle 6, HEREON). Same keyless WMTS service
// as SST. Unlike a global model it solves depth refraction and wave breaking, so it means something
// near the coast. It honestly returns value:null on a land pixel — which is why every beach carries
// a pre-calibrated `waveSample` point (see tools/calibrate-wave-points.mjs).
//   VHM0 = significant wave height (m, the mean-of-highest-third statistic)
//   VCMX = maximum crest height (m) — a modelled maximum, NOT a multiplier off the mean
const WAV_DATASET =
  "BLKSEA_ANALYSISFORECAST_WAV_007_003/cmems_mod_blk_wav_anfc_2.5km_PT1H-i_202411";
const WAV_STYLE = "cmap:amp";
export const WAV_SOURCE = "copernicus-blksea-wav-2.5km";

const SST_LAYER =
  "BLKSEA_ANALYSISFORECAST_PHY_007_001/cmems_mod_blk_phy-temp_anfc_2.5km_P1D-m_202511/thetao";
const SST_STYLE = "cmap:thermal";
const SST_SOURCE = "copernicus-blksea-3km";
// Surface elevation default from GetCapabilities for this layer (top model level == SST).
const SST_SURFACE_ELEVATION = "-0.5001727938652039";

const TILE_MATRIX_SET = "EPSG:4326";
const ZOOM = 10; // finest level on this grid
const TILE_PX = 256;
const REQUEST_TIMEOUT_MS = 8000;
const DATE_CANDIDATES = 4; // today + 3 previous days

// ---------------------------------------------------------------------------
// Tile-coordinate conversion (GoogleCRS84Quad / EPSG:4326, TopLeft = 90,-180).
// ---------------------------------------------------------------------------
function latLngToTile(lat, lng, z) {
  const degPerTile = 180 / Math.pow(2, z); // span of one tile in degrees
  const colF = (lng + 180) / degPerTile;
  const rowF = (90 - lat) / degPerTile;
  const tileCol = Math.floor(colF);
  const tileRow = Math.floor(rowF);
  let i = Math.floor((colF - tileCol) * TILE_PX);
  let j = Math.floor((rowF - tileRow) * TILE_PX);
  // clamp pixel indices into [0,255] to be safe at exact tile edges
  if (i < 0) i = 0;
  if (i > TILE_PX - 1) i = TILE_PX - 1;
  if (j < 0) j = 0;
  if (j > TILE_PX - 1) j = TILE_PX - 1;
  return { tileMatrix: String(z), tileCol, tileRow, i, j };
}

// Recent UTC-midnight ISO timestamps (today, yesterday, ...), most-recent first.
function recentUtcDates(count) {
  const out = [];
  const now = new Date();
  for (let d = 0; d < count; d++) {
    const dt = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - d,
        0,
        0,
        0,
        0
      )
    );
    out.push(dt.toISOString().replace(/\.\d{3}Z$/, ".000Z"));
  }
  return out;
}

function buildHeaders() {
  const user = process.env.COPERNICUS_USERNAME;
  const pass = process.env.COPERNICUS_PASSWORD;
  const token = process.env.COPERNICUS_TOKEN;
  const headers = { Accept: "application/json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  } else if (user && pass) {
    const basic = Buffer.from(`${user}:${pass}`).toString("base64");
    headers.Authorization = `Basic ${basic}`;
  }
  return headers;
}

function buildFeatureInfoUrl({ layer, style, tile, time, elevation }) {
  const p = new URLSearchParams();
  p.set("service", "WMTS");
  p.set("version", "1.0.0");
  p.set("request", "GetFeatureInfo");
  p.set("layer", layer);
  p.set("style", style);
  p.set("format", "image/png");
  p.set("tilematrixset", TILE_MATRIX_SET);
  p.set("TileMatrix", tile.tileMatrix);
  p.set("TileRow", String(tile.tileRow));
  p.set("TileCol", String(tile.tileCol));
  p.set("I", String(tile.i));
  p.set("J", String(tile.j));
  p.set("infoformat", "application/json");
  if (time) p.set("time", time);
  if (elevation) p.set("elevation", elevation);
  return `${WMTS_BASE}?${p.toString()}`;
}

// Performs one GetFeatureInfo request. Returns:
//   { ok:true, value:number|null }   -> HTTP 200 + valid JSON feature (value may be null = no-data)
//   { ok:false, outOfRange:boolean } -> any failure (non-2xx, non-JSON, network, timeout, abort)
async function fetchFeatureValue(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: buildHeaders(),
      signal: controller.signal,
    });
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!res.ok) {
      // Detect the "time out of range" 400 so the caller can try another date.
      let outOfRange = false;
      try {
        const body = await res.text();
        outOfRange = res.status === 400 && /out of range/i.test(body);
      } catch {
        /* ignore */
      }
      return { ok: false, outOfRange };
    }
    if (!ct.includes("application/json")) {
      // HTML/XML (e.g. an auth/login page or capability/exception doc) => not usable.
      return { ok: false, outOfRange: false };
    }
    const data = await res.json();
    const feats = data && Array.isArray(data.features) ? data.features : null;
    if (!feats || feats.length === 0) return { ok: true, value: null };
    const props = feats[0] && feats[0].properties ? feats[0].properties : {};
    const raw = props.value;
    const num = typeof raw === "number" ? raw : Number.NaN;
    return { ok: true, value: Number.isFinite(num) ? num : null };
  } catch {
    // network error, timeout, abort, JSON parse error -> failure
    return { ok: false, outOfRange: false };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// CHL report strings.
// ---------------------------------------------------------------------------
function chlReports(status, value) {
  const v = typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : null;
  const suffix = v !== null ? ` (CHL: ${v} mg/m³)` : "";
  if (status === "high") {
    return {
      report_en: `High chlorophyll levels detected; an algal bloom is possible. Take care when swimming.${suffix}`,
      report_bg: `Засечени са високи нива на хлорофил; възможно е цъфтеж на водорасли. Бъдете внимателни при къпане.${suffix}`,
    };
  }
  if (status === "moderate") {
    return {
      report_en: `Moderate chlorophyll levels — some algae present.${suffix}`,
      report_bg: `Умерени нива на хлорофил — има известно количество водорасли.${suffix}`,
    };
  }
  // clear
  return {
    report_en: `Low chlorophyll — little algae detected. Says nothing about bacteria.${suffix}`,
    report_bg: `Ниско ниво на хлорофил — засечени са малко водорасли. Не казва нищо за бактерии.${suffix}`,
  };
}

export const UNAVAILABLE_CLEANLINESS = Object.freeze({
  status: "unavailable",
  value: null,
  source: "unavailable",
  observedAt: null,
  report_en: "Algae data is temporarily unavailable.",
  report_bg: "Данните за водораслите са временно недостъпни.",
});

function classifyChl(value) {
  // Defensive: a non-finite value must NEVER fall through to "clear" (which would
  // fabricate a clean-water report). Callers also guard, but enforce it here too.
  if (typeof value !== "number" || !Number.isFinite(value)) return "unavailable";
  if (value >= 20) return "high";
  if (value >= 5) return "moderate";
  return "clear";
}

// ---------------------------------------------------------------------------
// Public API.
// ---------------------------------------------------------------------------

/**
 * getWaterQuality(lat, lng) -> { status, value, source, observedAt, report_en, report_bg }
 * Honest "unavailable" on ANY failure or missing/non-finite value.
 */
export async function getWaterQuality(lat, lng) {
  try {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { ...UNAVAILABLE_CLEANLINESS };
    }
    const tile = latLngToTile(lat, lng, ZOOM);
    const dates = recentUtcDates(DATE_CANDIDATES);

    let allOutOfRange = true;
    for (const time of dates) {
      const url = buildFeatureInfoUrl({
        layer: CHL_LAYER,
        style: CHL_STYLE,
        tile,
        time,
      });
      const r = await fetchFeatureValue(url);
      if (r.ok) {
        allOutOfRange = false;
        if (typeof r.value === "number" && Number.isFinite(r.value)) {
          const status = classifyChl(r.value);
          const reports = chlReports(status, r.value);
          return {
            status,
            value: r.value,
            source: `copernicus-${CHL_PRODUCT_SHORT}`,
            observedAt: time,
            ...reports,
          };
        }
        // ok but value null (land/no-data pixel) for this date; older dates won't help
        // a non-water point, but try them anyway in case of transient gaps.
      } else if (!r.outOfRange) {
        allOutOfRange = false;
      }
    }

    // If every pinned date was rejected as out-of-range, retry once WITHOUT a time
    // param so the server uses its latest "Default" available day.
    if (allOutOfRange) {
      const url = buildFeatureInfoUrl({ layer: CHL_LAYER, style: CHL_STYLE, tile });
      const r = await fetchFeatureValue(url);
      if (r.ok && typeof r.value === "number" && Number.isFinite(r.value)) {
        const status = classifyChl(r.value);
        const reports = chlReports(status, r.value);
        return {
          status,
          value: r.value,
          source: `copernicus-${CHL_PRODUCT_SHORT}`,
          observedAt: null, // server-default time is not echoed in the response
          ...reports,
        };
      }
    }

    return { ...UNAVAILABLE_CLEANLINESS };
  } catch {
    return { ...UNAVAILABLE_CLEANLINESS };
  }
}

/**
 * getSeaSurfaceTemp(lat, lng) -> { value:number|null, source:string, observedAt:string|null }
 * value:null when Copernicus SST is not obtainable, so the caller falls back to Open-Meteo.
 */
/**
 * getWaveState(lat, lng) -> { waveHeight, waveMax, source }
 *
 * Queries the 2.5 km Black Sea wave model at an ALREADY-CALIBRATED wet point (the caller passes
 * beach.waveSample, not the beach pin — a pin on the sand lands on a land cell and returns null).
 *
 * The layer's TIME dimension defaults to the current hour, so no date walk is needed (unlike CHL,
 * which is an observation product lagging ~1 day).
 *
 * HONESTY: any failure or land pixel yields null, never a substituted value from somewhere else.
 */
export async function getWaveState(lat, lng) {
  const FALLBACK = { waveHeight: null, waveMax: null, source: WAV_SOURCE };
  try {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return FALLBACK;
    const tile = latLngToTile(lat, lng, ZOOM);

    // RETRY, and read the two variables SEQUENTIALLY. The full build already issues SST + CHL per
    // beach; firing VHM0 and VCMX in parallel on top of that doubled in-flight WMTS requests and
    // the service throttled ~40% of them into the Open-Meteo fallback. One retry pass fixes it.
    const read = async (variable, attempts) => {
      const url = buildFeatureInfoUrl({
        layer: `${WAV_DATASET}/${variable}`,
        style: WAV_STYLE,
        tile,
      });
      for (let attempt = 1; attempt <= attempts; attempt++) {
        const r = await fetchFeatureValue(url);
        // ok:true with value null is a genuine land/no-data pixel — retrying will not help.
        if (r.ok) {
          return typeof r.value === "number" && Number.isFinite(r.value) ? r.value : null;
        }
        if (attempt < attempts) await new Promise((res) => setTimeout(res, 500 * attempt));
      }
      return null;
    };

    const waveHeight = await read("VHM0", 3);
    // VCMX is supplementary — if the height failed there is nothing to qualify, so skip it.
    const waveMax = waveHeight === null ? null : await read("VCMX", 2);
    return { waveHeight, waveMax, source: WAV_SOURCE };
  } catch {
    return FALLBACK;
  }
}

export async function getSeaSurfaceTemp(lat, lng) {
  const FALLBACK = { value: null, source: SST_SOURCE, observedAt: null };
  try {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return FALLBACK;
    const tile = latLngToTile(lat, lng, ZOOM);
    const dates = recentUtcDates(DATE_CANDIDATES);

    let allOutOfRange = true;
    for (const time of dates) {
      const url = buildFeatureInfoUrl({
        layer: SST_LAYER,
        style: SST_STYLE,
        tile,
        time,
        elevation: SST_SURFACE_ELEVATION,
      });
      const r = await fetchFeatureValue(url);
      if (r.ok) {
        allOutOfRange = false;
        if (typeof r.value === "number" && Number.isFinite(r.value)) {
          return { value: r.value, source: SST_SOURCE, observedAt: time };
        }
      } else if (!r.outOfRange) {
        allOutOfRange = false;
      }
    }

    if (allOutOfRange) {
      const url = buildFeatureInfoUrl({
        layer: SST_LAYER,
        style: SST_STYLE,
        tile,
        elevation: SST_SURFACE_ELEVATION,
      });
      const r = await fetchFeatureValue(url);
      if (r.ok && typeof r.value === "number" && Number.isFinite(r.value)) {
        return { value: r.value, source: SST_SOURCE, observedAt: null };
      }
    }

    return FALLBACK;
  } catch {
    return FALLBACK;
  }
}
