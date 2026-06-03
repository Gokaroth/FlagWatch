# FlagWatch Data Sources

This document explains where FlagWatch's data comes from and how it is interpreted. We use
reputable, scientific sources and are transparent about their limitations. **FlagWatch never
fabricates data**: when a value is unavailable it is reported as such, never guessed.

## 1. Beach Safety Conditions (Flags: 🟢 🟡 🔴 ⚪)

Live meteorological + marine data from the **Open-Meteo API** (keyless).

-   **Weather** — `https://api.open-meteo.com/v1/forecast` with
    `current=temperature_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m,uv_index`
-   **Marine** — `https://marine-api.open-meteo.com/v1/marine` with
    `current=wave_height,sea_surface_temperature`
-   All 56 beaches are queried in a single batched multi-location request per endpoint. Using the
    `current=` parameter (rather than indexing hourly arrays) avoids timezone-offset errors.
-   Each batched request **retries (3×, with backoff) on a transient failure** (timeout / 429 / 5xx).
    A single hiccup must not blank wind — and therefore the flag — for every beach at once.

**Flag logic** — requires **both** wave height and wind speed; if either is missing the flag is
**⚪ Unknown** (never an assumed-safe green):
-   `🔴 Danger`: wave height > 2 m OR wind speed > 40 km/h
-   `🟡 Caution`: wave height > 1.25 m OR wind speed > 25 km/h
-   `🟢 Safe`: both known and below the above

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
on the actual shoreline, which keeps both the map pin and the Open-Meteo / Copernicus sample point at
the right place. Coverage runs Durankulak → Rezovo; the southernmost beach (Rezovo) sits on the
Bulgaria–Turkey border. No coordinate lies outside Bulgaria.

## 6. Notes on method
-   L4 CHL is **gap-filled / interpolated**, not a single raw satellite pass — a deliberate trade
    for daily coverage.
-   Authentication: the Copernicus WMTS is currently **keyless**. Optional credential wiring exists
    (`COPERNICUS_USERNAME`/`COPERNICUS_PASSWORD` or `COPERNICUS_TOKEN`) and is dormant.
