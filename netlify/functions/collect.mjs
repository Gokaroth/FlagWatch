// netlify/functions/collect.mjs
// Scheduled trigger (Netlify Functions v2). Runs every 2 hours (UTC).
//
// Scheduled functions have a 30s execution limit, but the full Copernicus build can take
// longer. So this function just FIRES the background worker (collect-background.mjs, 15-min
// limit) and returns immediately. The worker does the build and writes Netlify Blobs.

export default async () => {
  const base =
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    process.env.DEPLOY_URL ||
    "";
  const target = `${base}/.netlify/functions/collect-background`;
  try {
    const res = await fetch(target, { method: "POST" });
    console.log(`collect: triggered collect-background -> HTTP ${res.status}`);
  } catch (err) {
    console.error("collect: failed to trigger collect-background:", err && err.message ? err.message : err);
  }
  return new Response("ok", { status: 200 });
};

// Every 2 hours, on the hour (UTC).
export const config = { schedule: "0 */2 * * *" };
