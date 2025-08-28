# 🚩 FlagWatch Data Accuracy Roadmap

This document outlines the strategic, multi-phase plan to evolve FlagWatch from an app using regional forecast models to a highly accurate, data-driven tool that reflects hyper-local, on-the-beach conditions.

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

### **Phase 2: Data Cross-Validation**

**Goal:** Introduce a second, high-resolution weather model to cross-reference with Open-Meteo, increasing data reliability.

**Why this adds value:**
-   **Confidence Score:** By comparing two independent models, the system can identify discrepancies. If both models agree, we can be highly confident in the data. If they differ, we can flag it or use the more historically accurate model.
-   **Resilience:** If one data provider is down, the app can automatically fall back to the other, ensuring continuous operation.

**Action Items:**
1.  Securely add an API key for a commercial, high-resolution weather service (e.g., Stormglass.io, AccuWeather) within the Netlify Function.
2.  Update the function to call both Open-Meteo and the new service.
3.  Implement comparison logic to generate a "confidence score" for the returned data.

---

### **Phase 3: Hyper-Local "Ground Truth" Integration**

**Goal:** Incorporate live, on-site data from official Bulgarian sources to get as close to reality as possible.

**Why this is the ultimate goal:**
-   **Unmatched Accuracy:** This moves beyond forecasts and incorporates real-time observations. It can account for hyper-local microclimates that large models miss.
-   **Trust:** Being able to cite live data from official national sources builds ultimate user trust.

**Action Items:**
1.  Identify reliable, public data sources (e.g., National Institute of Meteorology and Hydrology (NIMH) data tables, Port Authority reports, live data from webcams).
2.  Use a lightweight scraping library (like `cheerio`) inside the Netlify Function to extract this live data.
3.  Implement the final "fusion logic" that prioritizes this "ground truth" data, using the model data from Phase 2 as a robust fallback.

---

### **The End Result: A "Data Fusion" System**

Upon completion, FlagWatch will no longer just be a weather app. It will be a data processing engine that intelligently selects, compares, and delivers the most accurate possible snapshot of beach conditions, making our new disclaimer a true "boss move."