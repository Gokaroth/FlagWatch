# 🚩 FlagWatch Data Accuracy & Feature Roadmap

The plan to evolve FlagWatch from a regional-forecast app into an accurate, **trustworthy**
beach-conditions tool. Our goal is a "data fusion" system reliable enough that our disclaimers
become a mark of confidence, not a crutch.

> ### ⭐ Guiding principle: Data honesty (added 2026)
> FlagWatch is a safety tool, so it **never fabricates**. Missing measurements render as `—`,
> water cleanliness can be a first-class **`Unavailable`** state (neutral grey, never implying
> clean water), and the safety flag is **`Unknown`** when its inputs are incomplete. The old
> "generate plausible demo data" fallback has been removed.

---

### **Phase 1: Backend Proxy Foundation — ✅ COMPLETE**
All external API calls run in Netlify Functions (ESM v2), not the browser. This hides any future
keys, sidesteps CORS, and simplifies the frontend to a single `/api/beaches` call.

### **Phase 2: Proactive Caching & Resilience — ✅ COMPLETE**
A scheduled **collector** (`collect.mjs`, every 2 h) precomputes the full dataset and writes a
snapshot to **Netlify Blobs**. The on-demand `get-beach-data.mjs` serves that snapshot instantly at
`/api/beaches` (with a fast Open-Meteo-only cold-start fallback). Users no longer wait on ~94
external calls per load, and a transient API outage during a fetch degrades gracefully to
`unavailable` instead of breaking the app.

*Note:* the originally-considered Stormglass cross-validation was unnecessary — the migrated
Copernicus Marine **WMTS** turned out to be **keyless**, providing both CHL (gap-free L4) and a
Black Sea ~2.5 km SST model directly.

### **Phase 3: Hyper-Local "Ground Truth" Integration — 🔜 FUTURE**
Incorporate live official Bulgarian sources (e.g. NIMH tables, Port Authority / buoy reports) and
add fusion logic that prioritizes on-site observations over models. Likely via a lightweight
scrape/fetch inside the collector.

### **Phase 4: UI/UX & Feature Enhancements**
1.  **Map Pin Filtering** — ✅ DONE. The flag filter now updates both the list and the map pins.
2.  **Advanced Water-Sports Data** — ✅ DONE. Wind gusts + wind direction (with compass cardinal)
    are fetched and shown in the beach detail modal.
3.  **Redesign Beach Detail Modal** — ◻️ PARTIAL. Conditions grid extended (gusts/direction,
    water-temp disclaimer); fuller visual-hierarchy grouping still pending.
4.  **Enhance Map Visuals** — ◻️ PENDING:
    -   Switch base tiles to a minimalist style (e.g. CARTO Positron).
    -   Regional status circles around markers.
    -   Algae emoji indicators (🌿 / 🌿🌿).

---

### Refinement ideas / backlog
-   **Reduce CHL "unavailable" rate**: ~half the beaches currently return `unavailable` because the
    exact shoreline point lands on a land/coastal-masked grid cell. Sampling a point nudged slightly
    seaward should land on a water pixel and return a value, without lying about coverage.
-   **Better coastal SST**: continue evaluating the Black Sea physics model vs. ground-truth once
    Phase 3 sources are integrated.

### The End Result: a "Data Fusion" system
A processing engine that selects, compares, and delivers the most accurate honest snapshot of beach
conditions — and says "unknown" plainly when it can't.
