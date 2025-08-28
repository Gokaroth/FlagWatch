
# FlagWatch Data Sources

This document explains where the data for the FlagWatch app comes from and how it is interpreted. We are committed to providing the most accurate and transparent information possible by using reputable, scientific data sources.

## 1. Beach Safety Conditions (Flags: 🟢 🟡 🔴)

The primary safety status for each beach is determined by real-time meteorological and marine data.

-   **Source**: [Open-Meteo Marine Weather API](https://open-meteo.com/en/docs/marine-weather-api)
-   **Data Points Used**:
    -   `wave_height`: The significant height of combined wind-waves and swell.
    -   `wind_speed_10m`: The wind speed at 10 meters above sea level.
    -   `sea_surface_temperature`: The temperature of the water at the surface.
    -   `temperature_2m`: The air temperature at 2 meters above ground.
    -   `uv_index`: The Ultraviolet Index.

-   **Flag Calculation Logic**:
    A simple but effective ruleset is applied to determine the flag status:
    -   `🔴 Danger`: Wave height is greater than 2 meters OR wind speed is greater than 40 km/h.
    -   `🟡 Caution`: Wave height is greater than 1.25 meters OR wind speed is greater than 25 km/h.
    -   `🟢 Safe`: All other conditions.

## 2. Water Cleanliness (Algae Reports)

The algae reports are based on near-real-time satellite measurements of Chlorophyll-a concentration, which is the primary scientific indicator used to estimate the amount of phytoplankton (algae) in the water.

-   **Source**: [Copernicus Marine Service](https://marine.copernicus.eu/)
-   **Specific Product**: Black Sea Ocean Colour Plankton (Near Real Time L3 Observations)
-   **Data Point Used**:
    -   `CHL`: Mass concentration of chlorophyll-a in the water, measured in milligrams per cubic meter (mg/m³).

-   **Status Calculation Logic**:
    The raw Chlorophyll-a data is converted into a user-friendly status based on standard oceanographic thresholds:
    -   `Clear`: Chlorophyll-a concentration is **less than 5 mg/m³**. This indicates low biological activity and clear water.
    -   `Moderate`: Chlorophyll-a concentration is **between 5 and 20 mg/m³**. This can indicate the beginning of a bloom or patches of algae.
    -   `High`: Chlorophyll-a concentration is **greater than 20 mg/m³**. This indicates a high concentration of algae, characteristic of a widespread bloom.

**Fallback Mechanism**: If the Copernicus Marine Service is unavailable, the app will generate plausible demo data to ensure the user interface remains functional.
