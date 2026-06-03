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
All external API calls run server-side (a single dependency-free Node server, `server.mjs`), not the
browser. This hides any future keys, sidesteps CORS, and simplifies the frontend to a single
`/api/beaches` call. *(Originally Netlify Functions; consolidated onto one Fly.io server in 2026.)*

### **Phase 2: Proactive Caching & Resilience — ✅ COMPLETE**
An **in-process collector** rebuilds the full dataset every 2 h and persists a snapshot (+ rolling
history) to a **Fly volume** at `/state`. `/api/beaches` serves that snapshot instantly (with a fast
Open-Meteo-only build on cold boot), and SSE (`/api/stream`) pushes updates to open browsers. Users
no longer wait on the external calls; the batched Open-Meteo fetch **retries on transient failure**
(so one hiccup can't blank every flag); and any API outage degrades gracefully to `unavailable` /
`unknown` instead of breaking the app. *(Originally a Netlify scheduled fn + Blobs.)*

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
3.  **Redesign Beach Detail Modal** — ✅ DONE. Safety flag as a hero, grouped metric cards,
    water-temp disclaimer, trend sparklines, and footer actions: **Show on Map**, **Directions**
    (Google Maps), and **Share** (native share sheet → clipboard fallback on desktop).
4.  **Enhance Map Visuals** — ◻️ MOSTLY DONE:
    -   ✅ Minimalist CARTO base tiles (Positron / dark_matter, theme-aware).
    -   ✅ Algae emoji indicators on markers (🌿 / 🌿🌿), shown by shape not colour alone (WCAG 1.4.1).
    -   ◻️ Regional status circles around markers — still pending.

---

### Refinement ideas / backlog
-   **Beach coordinate accuracy** — ✅ DONE (2026). Every beach pin was re-verified against
    OpenStreetMap `natural=beach` polygons (several were 1–6 km off, landing inland), coverage grew
    from 47 to **56 beaches**, and a marker-rendering bug that made pins drift on zoom was fixed.
-   **Reduce CHL "unavailable" rate**: ~half the beaches currently return `unavailable` because the
    exact shoreline point lands on a land/coastal-masked grid cell. Sampling a point nudged slightly
    seaward should land on a water pixel and return a value, without lying about coverage.
-   **Better coastal SST**: continue evaluating the Black Sea physics model vs. ground-truth once
    Phase 3 sources are integrated.

### The End Result: a "Data Fusion" system
A processing engine that selects, compares, and delivers the most accurate honest snapshot of beach
conditions — and says "unknown" plainly when it can't.
