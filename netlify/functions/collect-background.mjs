// netlify/functions/collect-background.mjs
// Background function (Netlify Functions v2). Runs up to 15 minutes — long enough for the
// full Copernicus build, which exceeds the 30s limit of a scheduled function. It is triggered
// by collect.mjs (the scheduled function) and writes the snapshot to the "flagwatch" blob store.

import { getStore } from "@netlify/blobs";
import { buildAllBeachData } from "../../lib/fetch-beach-data.mjs";

export default async () => {
  const startedAt = new Date().toISOString();
  console.log(`collect-background: starting full build at ${startedAt}`);
  try {
    const beaches = await buildAllBeachData();
    const store = getStore("flagwatch");
    const payload = { updatedAt: new Date().toISOString(), beaches };
    await store.setJSON("latest", payload);
    console.log(`collect-background: wrote "latest" (${beaches.length} beaches) at ${payload.updatedAt}`);
  } catch (err) {
    console.error("collect-background failed:", err && err.message ? err.message : err);
  }
  return new Response("done");
};

// Run in the background (15-min limit) so the heavy Copernicus build can't hit a timeout.
export const config = { background: true };
