# 🏖️ FlagWatch - Bulgarian Black Sea Beach Safety & Cleanliness Monitor

FlagWatch is a real-time beach safety and water cleanliness dashboard for the Bulgarian Black Sea coast. It combines live weather data with scientific satellite measurements to provide a comprehensive overview of swimming conditions, helping locals and tourists make informed decisions for a safe and enjoyable beach day.

### ✨ Key Features

-   **🌊 Real-Time Safety Flags**: Live, color-coded flag status (🟢 Safe, 🟡 Caution, 🔴 Danger) calculated from wave height and wind speed. When live inputs are missing the flag is shown as **⚪ Unknown** — never an assumed "safe".
-   **🔬 Scientific Algae Reports**: Near-real-time water cleanliness based on satellite **Chlorophyll-a** data from the **Copernicus Marine Service**. When no recent satellite value is available for a point, it is honestly marked **Unavailable** rather than guessed.
-   **🌗 Light & Dark Mode**: A user-selectable dark theme with automatic system-preference detection.
-   **🗺️ Interactive Map & List**: A Leaflet map and a searchable, filterable list of 47 beaches. The flag filter applies to **both** the list and the map pins.
-   **🌡️ Detailed Live Data**: Wave height, water & air temperature, wind speed, **wind gusts & direction** (for kite/wind-surfers), and UV index.
-   **🌐 Bilingual Support**: Full EN / BG interface and data.
-   **📱 Progressive Web App (PWA)**: Installable, with offline access to cached data.

> **Honesty first.** FlagWatch is a safety tool, so it never fabricates data. Missing measurements
> render as `—`, water cleanliness can be `Unavailable`, and the safety flag is `Unknown` when its
> inputs are incomplete.

## 🚀 Live Demo

Visit the live app: **[flagwatch.netlify.app](https://flagwatch.netlify.app)**

## 🛠️ Technology Stack

-   **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3 — no build step.
-   **Mapping**: Leaflet.js with OpenStreetMap tiles.
-   **Backend**: **Netlify Functions** (v2, ESM) + **Netlify Blobs**. A scheduled "collector"
    function fetches & precomputes all beach data every 2 hours and stores a snapshot in Blobs; an
    on-demand function serves that snapshot instantly at `/api/beaches`.
-   **Data APIs**:
    -   **Open-Meteo**: real-time atmospheric & marine weather (keyless).
    -   **Copernicus Marine Service** (WMTS): satellite Chlorophyll-a (algae) and Black Sea sea-surface temperature.
-   **Styling**: CSS Custom Properties, responsive mobile-first design.
-   **PWA**: Service Worker (offline cache) + Web App Manifest.
-   **Deployment**: Netlify.

## 📊 Data Algorithms

### 1. Beach Safety Algorithm (Flags)
Calculated from real-time **Open-Meteo** data. The flag requires **both** wave height and wind
speed; if either is missing it is reported as **⚪ Unknown**, never green.
-   **🔴 Danger** — wave height > **2.0 m** OR wind speed > **40 km/h**
-   **🟡 Caution** — wave height > **1.25 m** OR wind speed > **25 km/h**
-   **🟢 Safe** — both known and below the caution thresholds

### 2. Water Cleanliness Algorithm (Algae Reports)
Based on **Chlorophyll-a (CHL)** concentration from the **Copernicus Marine Service**.
-   **High (potential bloom)** — CHL > **20 mg/m³**
-   **Moderate** — CHL between **5 and 20 mg/m³**
-   **Clear** — CHL < **5 mg/m³**
-   **Unavailable** — no recent satellite value for the point (shown neutrally; never implies clean water)

See `DATA_SOURCES.md` for endpoints, product IDs, and transparency notes.

## 📁 Project Structure

```
flagwatch/
├── index.html              # App shell, DOM, PWA head
├── app.js                  # Core app logic (BeachSafetyApp), rendering, i18n, map
├── style.css               # Themes + responsive layout
├── sw.js                   # Service Worker (offline cache)
├── manifest.webmanifest    # PWA manifest
├── icons/                  # PWA icons (192/512 PNG + SVG)
├── data/
│   └── beaches.json        # Single source of truth: 47 beaches (metadata)
├── lib/
│   ├── copernicus.mjs      # Copernicus Marine WMTS (CHL + SST), honest "unavailable"
│   └── fetch-beach-data.mjs# Open-Meteo + Copernicus -> merged beach records
├── netlify/functions/
│   ├── collect.mjs         # Scheduled (2h) collector -> Netlify Blobs
│   └── get-beach-data.mjs  # On-demand server at /api/beaches (reads Blobs)
├── netlify.toml            # Build/publish/redirect config
├── DATA_SOURCES.md         # Data-source documentation
├── ROADMAP.md              # Roadmap & status
└── AI_CONTEXT_MEMO.md      # Technical context memo
```

## 📦 Local Development

### Prerequisites
-   Node.js 18+ (uses global `fetch`)

### Setup
```bash
git clone https://github.com/Gokaroth/FlagWatch.git
cd FlagWatch
npm install
npx netlify-cli dev      # serves static files + functions + local Blobs at http://localhost:8888
```
`/api/beaches` works locally — the first request cold-starts a fast build, and the scheduled
collector (or hitting `/.netlify/functions/collect`) enriches the snapshot with Copernicus data.

> Copernicus access is currently **keyless**, so no credentials are needed. If that ever changes,
> set `COPERNICUS_USERNAME` / `COPERNICUS_PASSWORD` (or `COPERNICUS_TOKEN`) — see `.env.example`.

## 🤝 Contributing
1.  Follow the existing code style and conventions.
2.  Keep features responsive and tested on mobile + desktop.
3.  **Never fabricate data** — missing values must surface as `—` / `Unknown` / `Unavailable`.
4.  Update docs (`README.md`, `DATA_SOURCES.md`, etc.) for any changes.

## 🙏 Acknowledgments
-   **Open-Meteo** — free, high-quality weather & marine API.
-   **Copernicus Marine Service** — public scientific satellite data.
-   **Leaflet.js** & **OpenStreetMap** — mapping.
-   **Netlify** — hosting, functions, and blob storage.

***

**Made with ❤️ for safer and cleaner beach experiences on the Bulgarian Black Sea coast.**

## 📞 Support
- 🐛 [Open an issue](https://github.com/Gokaroth/FlagWatch/issues)
- 🌐 Live demo: [flagwatch.netlify.app](https://flagwatch.netlify.app)
