# FlagWatch Project - AI Context Memo
**Date:** August 28, 2025 (for context preservation)
**Subject:** Save state for FlagWatch development. Resume with Phase 2 implementation.

---

## 1. Project Goal

To create a highly accurate, reliable, and user-friendly beach safety and water cleanliness application for the entire Bulgarian Black Sea coast. The primary focus is on data trustworthiness.

## 2. Current State & Key Progress

-   **Massive Scope Expansion:** The app has been successfully expanded from 15 to 49 beaches.
-   **Scientific Data Integration:** We have moved beyond fictional data. The app uses real scientific data from two primary sources:
    -   **Open-Meteo:** For weather and marine data (wave height, wind speed, temps) to calculate safety flags.
    -   **Copernicus Marine Service:** For Chlorophyll-a satellite data to determine water cleanliness and algae bloom risk.
-   **CRITICAL ARCHITECTURAL SHIFT (Phase 1 Complete):** We have successfully refactored the application from a frontend-only model to a client-server model using Netlify Functions.
    -   A backend function at `netlify/functions/get-beach-data.js` now handles ALL external API calls.
    -   The frontend (`app.js`) has been simplified to make a single call to our own backend endpoint.
    -   This change was foundational for improving security (hiding future API keys) and reliability.

## 3. The Next Challenge & Agreed-Upon Solution

-   **Challenge:** The user provided on-the-ground feedback that regional model data (from Open-Meteo) can differ from hyper-local conditions at a specific beach (e.g., Kamchia).
-   **Brilliant User Idea:** Instead of paying for a premium API, we can leverage the **free tier** of a service like **Stormglass.io** (which offers 10 high-quality calls per day).
-   **The Solution (The New Phase 2):** We will implement a **proactive caching system**.
    -   **Architecture:** We will create a new **Scheduled Netlify Function** (`fetch-and-store-data`) that acts as a "Collector."
    -   **Functionality:** This Collector will run on a timer (e.g., a few times a day). It will use our 10 precious Stormglass API calls on the 10 most popular beaches to get premium, cross-validated data. It will also fetch standard data for the other 39 beaches.
    -   **Storage:** The Collector will save the combined result (a single JSON file for all 49 beaches) to **Netlify Blobs**.
    -   **Serving:** Our existing `get-beach-data` function will be modified to become a "Server." Its only job will be to instantly read the pre-built JSON file from Netlify Blobs and serve it to the user. This will make the app load almost instantly.

## 4. New User Feedback & Future Scope (UI/UX Enhancements)

-   **New Requirements Received:** We have just received valuable user feedback regarding UI/UX and new features.
-   **Feasibility Analysis:** All suggestions are feasible with our current tech stack, with one exception that has a viable alternative.
-   **Key Enhancements (Queued for Phase 4):**
    1.  **Map Pin Filtering:** Confirmed as actionable. This will involve updating the filtering logic in `app.js` to also show/hide markers on the map.
    2.  **Kitesurfing Data:** Confirmed as actionable. Open-Meteo provides `wind_gusts` and `wind_direction`. This data needs to be fetched in our Netlify function and passed to the frontend.
    3.  **UI Redesign:** Confirmed as actionable. This will involve restructuring the HTML in `index.html` for the modal and updating the corresponding CSS in `style.css`.
    4.  **Map Visuals:**
        -   **Map Style:** Confirmed as easily actionable. Switching the tile URL in `app.js` is a simple change.
        -   **Heatmap:** Researched and confirmed as **not feasible** with our sparse data points.
        -   **Alternative (Status Circles):** The proposed alternative of using colored circles (`L.circle`) around markers is confirmed as a feasible and effective way to achieve the user's goal of regional visualization.
        -   **Algae Markers:** Using emojis is a simple and actionable change to the marker creation logic.
-   **Strategic Decision:** These UI/UX improvements have been formally added to the `ROADMAP.md` as **Phase 4**. The current focus remains on completing the data accuracy improvements in Phase 2 and 3 first.

## 5. IMMEDIATE NEXT STEPS

1.  **Awaiting User Action:** The user needs to sign up for a **free account at Stormglass.io** and obtain their API key.
2.  **My Next Action (Upon Receiving Key):**
    -   Guide the user on how to add the Stormglass API key as a secure **Environment Variable** in their Netlify project settings.
    -   Provide the complete code for the new scheduled "Collector" function (`fetch-and-store-data.js`).
    -   Provide the modified code for the existing "Server" function (`get-beach-data.js`) to read from Netlify Blobs.
    -   Provide instructions for configuring the schedule in `netlify.toml`.