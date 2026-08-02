// lib/nimh.mjs
//
// NIMH / IO-BAS marine buoy network — the ONLY real instrument in FlagWatch's pipeline.
// Everything else in this app is model output. These are physical buoys in the water.
//
// Source: http://mm.meteo-varna.net/ (Национален институт по метеорология и хидрология,
// buoy data published under the MASRI / Euro-Argo infrastructure project with IO-BAS).
// Six buoys along the Bulgarian coast. Timestamps are UTC.
//
// WHY WE SCRAPE THE LANDING PAGE
// The page's own map calls `in2.php?q=<buoyId>` per marker over XHR. That endpoint accepts a
// TCP connection and then never responds to a plain GET (verified: 40s timeout, 0 bytes), so it
// is unusable. The landing page itself already embeds the recent history for ALL six buoys, so
// one ~26 KB request per build gets everything. Cheaper than six calls anyway.
//
// HTTP, not HTTPS: the host serves plain HTTP. That is fine here because this runs server-side in
// the collector. A browser on an HTTPS page could not fetch it (mixed content) — do not move this
// to the frontend.
//
// HONESTY: a failure returns an empty map. Beaches then simply have no observation, and the app
// falls back to saying nothing rather than implying a measurement exists.

const NIMH_URL = "http://mm.meteo-varna.net/";
const REQUEST_TIMEOUT_MS = 15000;

// Max age of a reading before we stop showing it. Buoys drop out for maintenance and the page
// keeps serving their last row indefinitely — a 3-day-old "measurement" must not read as current.
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

// A beach further than this from a buoy gets no observation. Wave state changes materially along
// this coast (the model resolves real structure at 2.5 km), so a "measurement" 30 km away would be
// misleading precision.
export const MAX_BUOY_DISTANCE_KM = 25;

// Coordinates and ids are read off the page's own Leaflet markers.
const BUOYS = [
  { id: "47", name: "Варна-залив", name_en: "Varna Bay", lat: 43.194168, lng: 27.9415, operator: "NIMH" },
  { id: "44", name: "Бургас-залив", name_en: "Burgas Bay", lat: 42.511665, lng: 27.556168, operator: "NIMH" },
  { id: "1289", name: "Ахтопол", name_en: "Ahtopol", lat: 42.114429, lng: 27.927679, operator: "NIMH" },
  { id: "32987", name: "Шабла", name_en: "Shabla", lat: 43.5392, lng: 28.611601, operator: "NIMH" },
  { id: "30889", name: "Варна - море", name_en: "Varna offshore", lat: 43.182835, lng: 27.996117, operator: "IO-BAS (DOORS)" },
  { id: "32732", name: "Шкорпиловци", name_en: "Shkorpilovtsi", lat: 42.958618, lng: 27.909451, operator: "IO-BAS" },
];

const BY_NAME = new Map(BUOYS.map((b) => [b.name, b]));

// Leading number out of cells like "1.01 / 3" (value / Beaufort-style балa) or "73&deg".
function leadingNumber(cell) {
  const m = /^\s*([\d.]+)/.exec(cell || "");
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

// "02/08/2026 09:32:01" (DD/MM/YYYY, UTC) -> ISO string, or null.
function parseUtc(text) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/.exec((text || "").trim());
  if (!m) return null;
  const [, dd, mm, yyyy, hh, mi, ss] = m;
  const d = new Date(Date.UTC(+yyyy, +mm - 1, +dd, +hh, +mi, +ss));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * QUALITY CONTROL.
 *
 * The Black Sea is fetch-limited: it produces short-period wind sea, not ocean swell. Peak periods
 * above ~12 s are physically impossible here. The IO-BAS DOORS buoy ("Варна - море") intermittently
 * emits rows with tp of 20.5 s and 25.6 s alongside inflated wave heights (12 of 102 rows on
 * 2026-08-02, and ONLY from that buoy). Those are instrument/processing artefacts, not weather.
 * Publishing one as a measurement would be worse than publishing nothing.
 */
function isPlausible(r) {
  if (r.hm0 === null || r.hm0 < 0 || r.hm0 > 12) return false;
  if (r.tp !== null && r.tp > 12) return false;
  if (r.t02 !== null && r.t02 > 9) return false;
  if (r.hmax !== null && r.hm0 !== null && r.hmax < r.hm0) return false; // max below significant
  return true;
}

/**
 * parseBuoyPage(html) -> Map<buoyName, reading>
 * Exported for testing. Returns only the newest PLAUSIBLE reading per buoy.
 */
export function parseBuoyPage(html) {
  const start = html.indexOf("<tbody>");
  const end = html.indexOf("</tbody>");
  if (start < 0 || end < 0) return new Map();
  const body = html.slice(start, end);

  // The markup is malformed: rows carry a closing </tr> but no opening <tr> (102 closes, 2 opens).
  // Browsers silently repair this; a <tr>...</tr> regex finds one row. Split on the CLOSE instead.
  const chunks = body.split("</tr>");
  const latest = new Map();

  for (const chunk of chunks) {
    const cells = [...chunk.matchAll(/<td>(.*?)<\/td>/gs)].map((m) =>
      m[1].replace(/<[^>]*>/g, "").replace(/&deg;?/g, "").trim()
    );
    if (cells.length < 11) continue;

    const buoy = BY_NAME.get(cells[0]);
    if (!buoy) continue;
    const observedAt = parseUtc(cells[1]);
    if (!observedAt) continue;

    const reading = {
      buoyId: buoy.id,
      buoyName: buoy.name,
      buoyNameEn: buoy.name_en,
      operator: buoy.operator,
      lat: buoy.lat,
      lng: buoy.lng,
      observedAt,
      hm0: leadingNumber(cells[2]), // significant wave height, m (measured)
      hmax: leadingNumber(cells[4]), // max crest-to-trough wave height, m — bay buoys only
      t02: leadingNumber(cells[5]),
      tp: leadingNumber(cells[6]),
      waterTemp: leadingNumber(cells[8]),
      windSpeed: leadingNumber(cells[9]), // m/s at the buoy
    };
    if (!isPlausible(reading)) continue;

    // Rows are newest-first, and (buoy, time) duplicates occur — keep the first seen.
    const prev = latest.get(buoy.name);
    if (!prev || reading.observedAt > prev.observedAt) latest.set(buoy.name, reading);
  }
  return latest;
}

export function haversineKm(aLat, aLng, bLat, bLng) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * fetchBuoyReadings() -> Promise<Array<reading>>
 * One request. Returns the newest plausible, non-stale reading per buoy ([] on any failure).
 */
export async function fetchBuoyReadings() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(NIMH_URL, {
      signal: controller.signal,
      headers: { "User-Agent": "FlagWatch/1.0 (+https://flagwatch.gokaroth.com)" },
    });
    if (!res.ok) {
      console.warn(`nimh: HTTP ${res.status}`);
      return [];
    }
    const html = await res.text();
    const readings = [...parseBuoyPage(html).values()];
    const now = Date.now();
    const fresh = readings.filter((r) => now - new Date(r.observedAt).getTime() <= MAX_AGE_MS);
    if (fresh.length < readings.length) {
      console.log(`nimh: dropped ${readings.length - fresh.length} stale reading(s)`);
    }
    return fresh;
  } catch (e) {
    console.warn("nimh: fetch failed:", e?.message || e);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * nearestReading(lat, lng, readings) -> observation | null
 * The closest buoy within MAX_BUOY_DISTANCE_KM, with its distance attached.
 */
export function nearestReading(lat, lng, readings) {
  let best = null;
  let bestKm = Infinity;
  for (const r of readings) {
    const km = haversineKm(lat, lng, r.lat, r.lng);
    if (km < bestKm) {
      bestKm = km;
      best = r;
    }
  }
  if (!best || bestKm > MAX_BUOY_DISTANCE_KM) return null;
  return { ...best, distanceKm: Number(bestKm.toFixed(1)) };
}
