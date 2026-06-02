// netlify/functions/get-beach-data.mjs
// On-demand server (Netlify Functions v2, ESM). Served at /api/beaches via redirect.
//
// Reads the "latest" snapshot written by the scheduled collector (collect.mjs)
// from the "flagwatch" blob store and returns just the beaches array. On a cold
// start (no snapshot yet) it builds the data live, writes it back, and serves it.

import { getStore } from "@netlify/blobs";
import { buildAllBeachData } from "../../lib/fetch-beach-data.mjs";

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "public, max-age=300",
};

export default async (req, context) => {
  try {
    const store = getStore("flagwatch");

    // Strong consistency so we read the freshest snapshot written by collect.
    const snapshot = await store.get("latest", { type: "json", consistency: "strong" });

    if (snapshot && Array.isArray(snapshot.beaches)) {
      console.log(
        `get-beach-data: serving cached snapshot (updatedAt=${snapshot.updatedAt}, ${snapshot.beaches.length} beaches)`
      );
      return new Response(JSON.stringify(snapshot.beaches), {
        status: 200,
        headers: JSON_HEADERS,
      });
    }

    // Cold start: no snapshot yet. Build live in FAST mode (Open-Meteo only, ~2s) so we
    // stay well under the function timeout; the scheduled collector enriches with Copernicus
    // (CHL + 3km SST) within the next run. Cleanliness is honestly "unavailable" until then.
    console.log("get-beach-data: no snapshot found, building live (fast mode)");
    const beaches = await buildAllBeachData({ fast: true });

    try {
      await store.setJSON("latest", {
        updatedAt: new Date().toISOString(),
        beaches,
      });
      console.log(`get-beach-data: wrote fresh snapshot (${beaches.length} beaches)`);
    } catch (writeErr) {
      // Persisting is best-effort; still serve the freshly-built data.
      const wmsg = writeErr && writeErr.message ? writeErr.message : String(writeErr);
      console.warn(`get-beach-data: failed to persist snapshot: ${wmsg}`);
    }

    return new Response(JSON.stringify(beaches), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    console.error("get-beach-data: failed:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
};
