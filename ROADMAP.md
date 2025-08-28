# 🚩 FlagWatch Data Accuracy & Feature Roadmap

This document outlines the strategic, multi-phase plan to evolve FlagWatch from an app using regional forecast models to a highly accurate, data-driven tool that reflects hyper-local, on-the-beach-conditions, incorporating user feedback for an enhanced experience.

Our goal is to build a "Data Fusion" system so reliable that our disclaimer becomes a mark of confidence, not a necessity.

---

### **Phase 1: Backend Proxy Foundation (Complete)**

**Goal:** Centralize all external API calls into a secure backend function running on Netlify.

**Why this is critical:**
-   **Security:** Prepares the app to use commercial APIs that require secret keys, which can't be exposed in the frontend JavaScript.
-   **Reliability:** Bypasses browser limitations like CORS that can restrict access to certain data sources.
-   **Simplicity:** Drastically simplifies the frontend code by consolidating data fetching into a single, managed endpoint.

**Action Items:**
1.  **[DONE]** Create a `get-beach-data` Netlify Function.
2.  **[DONE]** Move all data fetching logic (Open-Meteo and Copernicus) from `app.js` into this function.
3.  **[DONE]** Refactor `app.js` to make a single call to our new function to get all necessary data.

---

### **Phase 2: Proactive Caching & Data Cross-Validation (Next Step)**

**Goal:** Leverage the free tier of a premium, high-resolution API (like Stormglass) by proactively fetching and caching data on a schedule, cross-validating it with our existing sources.

**Why this is a game-changer:**
-   **Hyper-Accuracy for Free:** Allows us to use a rate-limited premium API for our most popular beaches without incurring costs.
-   **Blazing Fast Performance:** Users receive pre-processed data instantly, as our main function no longer waits for external APIs to respond.
-   **Extreme Resilience:** If an external API is down during a scheduled fetch, the app continues to serve the last known good data seamlessly.

**New Architecture:**
-   **The Collector (`fetch-and-store-data`):** A new **Scheduled Netlify Function** that runs on a timer (e.g., every 2 hours).
-   **The Storage (`Netlify Blobs`):** The Collector function will save the combined data as a single JSON object in Netlify's free blob storage.
-   **The Server (`get-beach-data`):** Our existing function will be modified to simply read the pre-built JSON file from Netlify Blobs and serve it instantly.

**Action Items:**
1.  Obtain a free-tier API key from a premium data provider (e.g., Stormglass.io).
2.  Securely add the API key as an Environment Variable in the Netlify project settings.
3.  Create the new `fetch-and-store-data` scheduled function.
4.  Refactor the existing `get-beach-data` function to read from Netlify Blobs.

---

### **Phase 3: Hyper-Local "Ground Truth" Integration**

**Goal:** Incorporate live, on-site data from official Bulgarian sources to get as close to reality as possible.

**Why this is the ultimate goal:**
-   **Unmatched Accuracy:** This moves beyond forecasts and incorporates real-time observations.
-   **Trust:** Being able to cite live data from official national sources builds ultimate user trust.

**Action Items:**
1.  Identify reliable, public data sources (e.g., NIMH data tables, Port Authority reports).
2.  Use a lightweight scraping library (like `cheerio`) inside the **Collector** Netlify Function to extract this live data.
3.  Implement the final "fusion logic" that prioritizes this "ground truth" data.

---

### **Phase 4: UI/UX & Feature Enhancements (Queued)**

**Goal:** Address direct user feedback to improve usability, provide more valuable information, and enhance the visual presentation of the app.

**Action Items:**
1.  **Implement Map Pin Filtering:** Modify the filtering logic so that selecting a filter (e.g., "Safe") updates both the beach list AND the visible pins on the map.
2.  **Add Advanced Water Sports Data:**
    -   Fetch `wind_gusts` and `wind_direction` from the weather API.
    -   Display this new information prominently in the beach detail modal for kitesurfers and windsurfers.
3.  **Redesign Beach Detail Modal:**
    -   Restructure the modal's layout for a clearer visual hierarchy (e.g., group "Conditions", "Water Quality", etc.).
    -   Make the algae/cleanliness indicator more prominent and easier to understand at a glance.
4.  **Enhance Map Visuals:**
    -   **Map Style:** Switch the base map tile provider from the default OpenStreetMap to a cleaner, minimalist style (e.g., **CARTO Positron**) to make data overlays stand out.
    -   **Regional Visualization:** Replace the infeasible "heatmap" concept with a more practical solution like colored **status circles** around beach markers to provide an at-a-glance regional overview.
    -   **Algae Indicators:** Update the on-map algae indicators to be more intuitive, potentially using emojis (e.g., 🌿 for moderate, 🌿🌿 for high) as suggested.

---

### **The End Result: A "Data Fusion" System**

Upon completion, FlagWatch will no longer just be a weather app. It will be a data processing engine that intelligently selects, compares, and delivers the most accurate possible snapshot of beach conditions, making our new disclaimer a true "boss move."