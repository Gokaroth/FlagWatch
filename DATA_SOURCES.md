# FlagWatch Data Sources

This document explains where FlagWatch's data comes from and how it is interpreted. We use
reputable, scientific sources and are transparent about their limitations. **FlagWatch never
fabricates data**: when a value is unavailable it is reported as such, never guessed.

## 1. Sea Conditions (Calm / Moderate / Rough / Unknown)

Live meteorological + marine data from the **Open-Meteo API** (keyless).

-   **Weather** — `https://api.open-meteo.com/v1/forecast` with
    `current=temperature_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m,uv_index`
-   **Marine** — `https://marine-api.open-meteo.com/v1/marine` with
    `current=wave_height,sea_surface_temperature`
-   All 56 beaches are queried in a single batched multi-location request per endpoint. Using the
    `current=` parameter (rather than indexing hourly arrays) avoids timezone-offset errors.
-   Each batched request **retries (3×, with backoff) on a transient failure** (timeout / 429 / 5xx).
    A single hiccup must not blank wind — and therefore the flag — for every beach at once.

> **This is NOT a swim-safety flag.** Bulgarian beach flags are set by a lifeguard on the sand under
> Наредба за водноспасителната дейност (ПМС № 82/2024, ДВ бр. 30). That ordinance defines the flags
> precisely (green 348C / yellow 124C / red 186C, 600×400 mm) but attaches **no numeric thresholds** —
> the call is lifeguard discretion, and flags exist only at guarded beaches. No official live feed
> publishes them. FlagWatch therefore reports **modelled sea state** and defers to the physical flag.

**Waves come from Copernicus, not Open-Meteo.** Primary source is
**`BLKSEA_ANALYSISFORECAST_WAV_007_003`** (`cmems_mod_blk_wav_anfc_2.5km_PT1H-i_202411`), a **2.5 km
Black-Sea-only** WAM model (HEREON), hourly, on the same keyless `wmts.marine.copernicus.eu/teroWmts`
service already used for SST. Variables read: **`VHM0`** (significant wave height) and **`VCMX`**
(maximum crest height). Unlike a global model it solves depth refraction and wave breaking.
Open-Meteo's `wave_height` remains only as a labelled fallback (`waveSource: open-meteo-mfwam-8km`).

**Sea-state logic** — requires a known wave height AND at least one wind measure; otherwise
**Unknown** (never an assumed-calm state):
-   `Rough`: **max crest (VCMX) > 1.5 m** OR gust > 50 km/h
-   `Moderate`: wave height > 0.7 m OR gust > 32 km/h
-   `Calm`: known and below the above
-   Fallbacks: Hs > 1.2 m stands in for ROUGH when VCMX is missing; mean-wind thresholds
    (40 / 25 km/h) are used only when gust is missing.

**ROUGH keys off the maximum crest, not the mean.** Hs is the mean of the highest third — roughly
1 in 10 waves exceeds it. What knocks a swimmer down is the biggest wave, and this model reports it
directly, so we use the modelled maximum rather than applying a textbook Rayleigh multiplier.
Observed VCMX/Hs across the coast is ~1.35x.

**Why gusts, and why these numbers.** The previous thresholds (>1.25 m yellow, >2 m red) were
ocean-coast values. Across the whole 2025 bathing season the Black Sea never reached 2 m Hs or
40 km/h mean wind, so `red` was unreachable and ~98% of the season collapsed to a single band.
The bands above are anchored to the local distribution (Hs 0.6 m ≈ median, 1.0 m ≈ p95), and use
**gusts**, which run ~2.2× mean wind here and drive the short steep chop this fetch-limited basin
produces. `wind_gusts_10m` was already being fetched and displayed while the flag logic ignored it.

**Threshold provenance.** These are nearshore Copernicus magnitudes, which run higher than the old
Open-Meteo offshore ones because of shoaling (observed coast-wide p50 0.74 m vs 0.60 m). They are
anchored on swimmer-relevant physical values rather than fitted to any single day: 0.7 m Hs is
choppy; a 1.5 m breaking crest is dangerous. They should be revisited against a real local
distribution once `/api/history` holds a full season.

## 1b. Measured buoy observations (NIMH / IO-BAS) — the only real instrument

Everything else in this document is model output. These are physical buoys in the water.

-   **Source**: `http://mm.meteo-varna.net/` — the marine buoy network of НИМХ (National Institute of
    Meteorology and Hydrology), published under the MASRI / Euro-Argo project with IO-BAS. Six buoys:
    Варна-залив (47), Бургас-залив (44), Ахтопол (1289), Шабла (32987), Варна-море (30889, IO-BAS
    DOORS), Шкорпиловци (32732). Timestamps UTC, roughly half-hourly.
-   **One request per build.** The page's own map calls `in2.php?q=<id>` per marker over XHR, but
    that endpoint accepts a connection and never responds to a plain GET (verified: 40 s, 0 bytes).
    The landing page already embeds recent history for all six buoys, so we parse that instead.
-   **Malformed markup**: rows carry a closing `</tr>` with no opening `<tr>` (102 closes, 2 opens).
    Browsers repair this silently; a `<tr>...</tr>` regex finds one row. The parser splits on the
    CLOSING tag.
-   **Quality control.** The Black Sea is fetch-limited and cannot produce ocean swell, so peak
    periods above ~12 s are physically impossible. The IO-BAS DOORS buoy intermittently emits rows
    with tp of 20.5–25.6 s and inflated heights (12 of 102 rows on 2026-08-02, exclusively from that
    buoy). Those are rejected, as are readings older than 6 h, `hmax < hm0`, and duplicates.
-   **Coverage**: attached to a beach only when a buoy is within **25 km** — 50 of 56 beaches. It is
    displayed as a clearly-labelled measurement and **never feeds the sea-state band**, so all 56
    beaches stay computed the same way.
-   Only the two bay buoys (Варна-залив, Бургас-залив) report `Hmax`.
-   HTTP, not HTTPS. Fine server-side; a browser on an HTTPS page could not fetch it.

**Model validation, 2026-08-02** — first time this app was ever checked against an instrument:

| Buoy | Measured Hm0 | Nearest beach | Model Hs | Δ | Separation |
|---|---|---|---|---|---|
| Шабла | 0.61 m | shabla | 0.69 m | +0.08 | 1.0 km |
| Ахтопол | 1.01 m | ahtopol | 1.08 m | +0.07 | 1.4 km |
| Варна-залив | 0.35 m | varna_beach | 0.55 m | +0.20 | 1.7 km |
| Шкорпиловци | 0.47 m | shkorpilovtsi | 0.70 m | +0.23 | 2.5 km |
| Варна-море | 0.38 m | saints_constantine | 0.63 m | +0.25 | 5.5 km |
| Бургас-залив | 0.41 m | burgas_north | 0.68 m | +0.27 | 6.0 km |

The model reads high by +0.18 m on average, but the error tracks buoy-to-beach separation almost
monotonically: at ~1 km it is +0.07/+0.08 m, at ~6 km it is +0.27 m. Much of the gap is therefore
genuine spatial difference rather than model error. Not corrected for — one day is not a calibration
set, and the bias is in the conservative direction.

**Open question**: measured `Hmax/Hm0` at the two bay buoys averages **1.74** (consistent with the
Rayleigh expectation), while the model's `VCMX/VHM0` runs **~1.35**. Both are crest-to-trough maxima.
In absolute terms the model still reads higher than the buoys, so ROUGH is not under-firing — but
the ratio discrepancy is unexplained and worth revisiting.

## 2. Water Cleanliness (Algae Reports)

Near-real-time satellite **Chlorophyll-a (CHL)** — the primary indicator of phytoplankton (algae).

-   **Source**: [Copernicus Marine Service](https://marine.copernicus.eu/) via the **WMTS** service
    `https://wmts.marine.copernicus.eu/teroWmts` (`GetFeatureInfo`, `INFOFORMAT=application/json`).
    *(The previous `nrt.cmems-du.eu` WMS was decommissioned in April 2024.)*
-   **Product**: `OCEANCOLOUR_BLK_BGC_L4_NRT_009_152` — Black Sea ocean-colour, **gap-free daily
    L4**, 1 km. The gap-free L4 is chosen over raw L3 so coastal point queries return a value
    instead of cloud-gapped nulls.
-   **Data point**: `CHL`, milligrams per cubic metre (mg/m³). The NRT product lags ~1 day, so the
    app requests the most recent available date.

**Status logic**:
-   `Clear`: CHL **< 5 mg/m³**
-   `Moderate`: CHL **5–20 mg/m³**
-   `High`: CHL **> 20 mg/m³**
-   `Unavailable`: no recent satellite value for the point (e.g. a land/coastal-masked grid cell, or
    a service error). Shown as a neutral state — **it never implies the water is clean.**

## 3. Sea-Surface Temperature

-   Primary: Copernicus Marine **`BLKSEA_ANALYSISFORECAST_PHY_007_001`** (Black Sea physics, ~2.5 km,
    surface temperature) via the same WMTS, labeled `waterTempSource: "copernicus-blksea-3km"`.
-   Fallback: **Open-Meteo** `sea_surface_temperature` (labeled `"open-meteo"`) when the Black Sea
    model pixel is null/land.
-   **Transparency**: sea temperature is a **modeled estimate**; at the shoreline it can differ from
    the modeled offshore value by roughly 2–4 °C. The app shows this disclaimer in the detail view.

## 4. Honesty & failure behavior

There is **no demo/synthetic-data fallback**. On any failure (network error, non-2xx response,
auth rejection, missing/NaN value) the affected field is `null` (rendered `—`), cleanliness is
`unavailable`, and the safety flag is `unknown`. The cleanliness status can only be `clear`/
`moderate`/`high` when a real numeric CHL value was returned.

## 5. Beach locations & sampling points

The 56 beach coordinates in `data/beaches.json` are verified against **OpenStreetMap**
`natural=beach` polygons (via Nominatim + an Overpass sweep of the Bulgarian coast). Each point sits
on the actual shoreline, which keeps the **map pin** in the right place.

**Wave sample points are offset seaward, by a known amount.** A pin on the sand lands on a land cell
in any marine model. Rather than let a provider silently substitute somewhere else, every beach
carries a **pre-calibrated `waveSample`** — the nearest wet cell of the 2.5 km grid, resolved once by
`tools/calibrate-wave-points.mjs` and stored in `beaches.json` with its distance. Result across all
56 beaches: **11 resolve at the pin itself, median offset 2.04 km, max 4.68 km, none unresolved.**
That distance is surfaced per beach in the UI (`waveSampleKm`).

**Why this replaced Open-Meteo.** MFWAM (~1/12° ≈ 8 km) land-masks coastal cells and silently returns
the nearest wet cell with no indication it did so — **median 11 km offshore, max 21 km** (Ahtopol),
31 of 56 beaches >10 km out, and all 56 collapsing onto just **24 distinct grid cells** (seven
southern beaches spanning ~25 km shared one, receiving byte-identical values). Nearshore shoaling,
refraction and depth-limited breaking mean offshore Hs is neither an upper nor a lower bound on what
a swimmer meets at the waterline. Copernicus instead returns an honest `null` on a land pixel, which
is what makes the calibrated-offset approach possible at all — and the same honesty is why 29 beaches
show algae as "unavailable" (CHL has no equivalent calibration yet). Coverage runs Durankulak → Rezovo; the southernmost beach (Rezovo) sits on the
Bulgaria–Turkey border. No coordinate lies outside Bulgaria.

## 6. Notes on method
-   L4 CHL is **gap-filled / interpolated**, not a single raw satellite pass — a deliberate trade
    for daily coverage.
-   Authentication: the Copernicus WMTS is currently **keyless**. Optional credential wiring exists
    (`COPERNICUS_USERNAME`/`COPERNICUS_PASSWORD` or `COPERNICUS_TOKEN`) and is dormant.
