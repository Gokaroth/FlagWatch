// netlify/functions/collect.mjs
// Scheduled collector (Netlify Functions v2, ESM).
//
// Runs every 2 hours (UTC). Builds the full merged beach dataset via
// buildAllBeachData() and writes it to the "flagwatch" blob store under
// the key "latest". The on-demand get-beach-data function reads this blob.

import { getStore } from "@netlify/blobs";
import { buildAllBeachData } from "../../lib/fetch-beach-data.mjs";

export default async (req) => {
  const startedAt = new Date().toISOString();
  console.log(`collect: starting scheduled build at ${startedAt}`);

  try {
    const beaches = await buildAllBeachData();
    console.log(`collect: built ${beaches.length} beach records`);

    const store = getStore("flagwatch");
    const payload = {
      updatedAt: new Date().toISOString(),
      beaches,
    };
    await store.setJSON("latest", payload);
    console.log(`collect: wrote "latest" to blob store at ${payload.updatedAt}`);

    return new Response("ok", { status: 200 });
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    console.error("collect: failed:", message);
    return new Response(`collect failed: ${message}`, { status: 500 });
  }
};

// Every 2 hours, on the hour (UTC).
export const config = { schedule: "0 */2 * * *" };
