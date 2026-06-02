// server.mjs — FlagWatch on Fly.io (plain Node http, ESM, ZERO runtime deps).
//
// Replaces the Netlify trio (collect / collect-background / get-beach-data) + Netlify Blobs with
// one always-on process. Fly has no 30s/15min function limit, so the full Copernicus build runs
// inline on a 2-hour timer. Serves the static frontend, the JSON API, a live SSE stream, and a
// rolling condition history for trend sparklines.
//
// HONESTY (project prime directive): we only ever store/serve REAL values. Missing numerics stay
// `null`; cleanliness `unavailable` never implies clean; a build failure keeps the last good
// snapshot (and is surfaced in /api/status) rather than blanking data. History holds real samples
// only — gaps are gaps, never zero.

import { createServer } from "node:http";
import { readFile, stat, mkdir, writeFile } from "node:fs/promises";
import { join, normalize, extname, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAllBeachData } from "./lib/fetch-beach-data.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8080;
const HOST = "0.0.0.0";
const STATE_DIR = process.env.STATE_DIR || "/state";
const FULL_BUILD_MS = Number(process.env.FULL_BUILD_MS) || 2 * 60 * 60 * 1000; // 2h
const HISTORY_DAYS = Number(process.env.HISTORY_DAYS) || 7;
const SSE_HEARTBEAT_MS = 25_000;

const SNAPSHOT_FILE = join(STATE_DIR, "snapshot.json");
const HISTORY_FILE = join(STATE_DIR, "history.json");

// ---------------------------------------------------------------------------
// In-memory state.
// ---------------------------------------------------------------------------
const state = {
  snapshot: null, // { updatedAt, beaches }
  history: { byBeach: {} }, // { byBeach: { [id]: [{t,waveHeight,waterTemp,chl,flag}] } }
  lastFullBuild: null,
  lastFastBuild: null,
  lastError: null,
  startedAt: new Date().toISOString(),
  persist: true,
};
const sseClients = new Set();

// ---------------------------------------------------------------------------
// Static file serving.
// ---------------------------------------------------------------------------
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json", // replaces the old netlify.toml header
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
};

function cacheControl(ext) {
  if (ext === ".html") return "no-cache";
  if ([".png", ".jpg", ".jpeg", ".svg", ".ico", ".webp"].includes(ext)) return "public, max-age=86400";
  return "public, max-age=60"; // js/css/json/manifest
}

// Content-Security-Policy for the HTML document. Allowlist exactly what FlagWatch loads:
// Leaflet JS/CSS from unpkg, CARTO basemap tiles, the data: favicon, same-origin everything else
// (app.js, style.css, /api/*, the SSE stream, /sw.js, the manifest). 'unsafe-inline' for styles is
// required by Leaflet (it sets inline style attributes for map panning/zoom).
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://unpkg.com",
  "style-src 'self' 'unsafe-inline' https://unpkg.com",
  "img-src 'self' data: https://*.basemaps.cartocdn.com https://unpkg.com",
  "connect-src 'self'",
  "font-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join("; ");

async function serveStatic(req, res, urlPath) {
  // Map "/" → index.html; decode + normalise; reject path traversal outside ROOT.
  let rel;
  try {
    rel = decodeURIComponent(urlPath.split("?")[0]); // can throw URIError on malformed %xx
  } catch {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }).end("Bad Request");
    return;
  }
  if (rel === "/" || rel === "") rel = "/index.html";
  const filePath = normalize(join(ROOT, rel));
  // Require ROOT itself or a path UNDER ROOT + separator. A bare startsWith(ROOT) would also
  // accept sibling dirs (e.g. "/app-foo" passes startsWith("/app")).
  if (filePath !== ROOT && !filePath.startsWith(ROOT + sep)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const st = await stat(filePath);
    if (st.isDirectory()) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    const ext = extname(filePath).toLowerCase();
    const body = await readFile(filePath);
    const headers = {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": cacheControl(ext),
      "Content-Length": body.length,
    };
    if (ext === ".html") headers["Content-Security-Policy"] = CSP;
    res.writeHead(200, headers);
    res.end(req.method === "HEAD" ? undefined : body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
  }
}

function sendJSON(res, status, obj, extraHeaders = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    ...extraHeaders,
  });
  res.end(body);
}

// ---------------------------------------------------------------------------
// Persistence (best-effort; degrade to in-memory if the volume isn't writable).
// ---------------------------------------------------------------------------
async function initState() {
  try {
    await mkdir(STATE_DIR, { recursive: true });
  } catch {
    state.persist = false;
    console.warn(`server: STATE_DIR ${STATE_DIR} not writable — running in-memory only`);
  }
  // Load a previous snapshot so we can serve instantly across restarts/deploys.
  try {
    const snap = JSON.parse(await readFile(SNAPSHOT_FILE, "utf8"));
    if (snap && Array.isArray(snap.beaches)) {
      state.snapshot = snap;
      console.log(`server: loaded snapshot (${snap.beaches.length} beaches, updatedAt=${snap.updatedAt})`);
    }
  } catch {
    /* no prior snapshot */
  }
  try {
    const hist = JSON.parse(await readFile(HISTORY_FILE, "utf8"));
    if (hist && hist.byBeach && typeof hist.byBeach === "object") {
      state.history = hist;
      console.log(`server: loaded history (${Object.keys(hist.byBeach).length} beaches)`);
    }
  } catch {
    /* no prior history */
  }
}

async function persistSnapshot() {
  if (!state.persist || !state.snapshot) return;
  try {
    await writeFile(SNAPSHOT_FILE, JSON.stringify(state.snapshot));
  } catch (e) {
    console.warn("server: failed to persist snapshot:", e?.message || e);
  }
}

async function persistHistory() {
  if (!state.persist) return;
  try {
    await writeFile(HISTORY_FILE, JSON.stringify(state.history));
  } catch (e) {
    console.warn("server: failed to persist history:", e?.message || e);
  }
}

// ---------------------------------------------------------------------------
// History (real samples only; pruned to HISTORY_DAYS; gaps stay null).
// ---------------------------------------------------------------------------
function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function appendHistory(beaches) {
  const t = new Date().toISOString();
  const cutoff = Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000;
  for (const b of beaches) {
    const c = b.conditions || {};
    const clean = b.cleanliness || {};
    const arr = state.history.byBeach[b.id] || (state.history.byBeach[b.id] = []);
    arr.push({
      t,
      waveHeight: num(c.waveHeight),
      waterTemp: num(c.waterTemp),
      chl: num(clean.value), // CHL mg/m³ when a real Copernicus pixel was found, else null
      flag: c.flag ?? null,
    });
    // Prune anything older than the window.
    let i = 0;
    while (i < arr.length && new Date(arr[i].t).getTime() < cutoff) i++;
    if (i > 0) arr.splice(0, i);
  }
}

function readHistory(beachId, range) {
  // beachId is user-controlled. Only treat a genuine array as history — a key like
  // "__proto__"/"constructor" would otherwise resolve to a non-array object via the prototype.
  const entry = state.history.byBeach[beachId];
  const all = Array.isArray(entry) ? entry : [];
  const ms = range === "24h" ? 24 * 60 * 60 * 1000 : HISTORY_DAYS * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - ms;
  return all.filter((s) => new Date(s.t).getTime() >= cutoff);
}

// ---------------------------------------------------------------------------
// SSE — push a small "update" event after every successful build.
// ---------------------------------------------------------------------------
function broadcast(payload) {
  const msg = `event: update\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(msg);
    } catch {
      sseClients.delete(res);
    }
  }
}

function handleStream(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(": connected\n\n");
  // Tell a freshly-connected client when the current data is from.
  if (state.snapshot) res.write(`event: update\ndata: ${JSON.stringify({ updatedAt: state.snapshot.updatedAt })}\n\n`);
  sseClients.add(res);
  const hb = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch {
      /* ignore */
    }
  }, SSE_HEARTBEAT_MS);
  req.on("close", () => {
    clearInterval(hb);
    sseClients.delete(res);
  });
}

// ---------------------------------------------------------------------------
// Builds.
// ---------------------------------------------------------------------------
function setSnapshot(beaches) {
  state.snapshot = { updatedAt: new Date().toISOString(), beaches };
}

async function buildFast() {
  try {
    const beaches = await buildAllBeachData({ fast: true });
    setSnapshot(beaches);
    state.lastFastBuild = state.snapshot.updatedAt;
    state.lastError = null;
    await persistSnapshot();
    broadcast({ updatedAt: state.snapshot.updatedAt, mode: "fast" });
    console.log(`server: fast build done (${beaches.length} beaches)`);
  } catch (e) {
    state.lastError = e?.message || String(e);
    console.error("server: fast build failed:", state.lastError);
  }
}

async function buildFull() {
  try {
    const beaches = await buildAllBeachData(); // full: Open-Meteo + Copernicus
    setSnapshot(beaches);
    state.lastFullBuild = state.snapshot.updatedAt;
    state.lastError = null;
    appendHistory(beaches); // history accrues from the 2h full build cadence only
    await Promise.all([persistSnapshot(), persistHistory()]);
    broadcast({ updatedAt: state.snapshot.updatedAt, mode: "full" });
    console.log(`server: full build done (${beaches.length} beaches)`);
  } catch (e) {
    state.lastError = e?.message || String(e);
    console.error("server: full build failed (keeping last good snapshot):", state.lastError);
  }
}

// ---------------------------------------------------------------------------
// Status summary.
// ---------------------------------------------------------------------------
function buildStatus() {
  const beaches = state.snapshot?.beaches || [];
  const flagCounts = { green: 0, yellow: 0, red: 0, unknown: 0 };
  const cleanlinessCounts = { clear: 0, moderate: 0, high: 0, unavailable: 0 };
  for (const b of beaches) {
    const f = b.conditions?.flag || "unknown";
    flagCounts[f] = (flagCounts[f] || 0) + 1;
    const s = b.cleanliness?.status || "unavailable";
    cleanlinessCounts[s] = (cleanlinessCounts[s] || 0) + 1;
  }
  return {
    ok: true,
    updatedAt: state.snapshot?.updatedAt || null,
    lastFullBuild: state.lastFullBuild,
    lastFastBuild: state.lastFastBuild,
    lastError: state.lastError,
    beachCount: beaches.length,
    flagCounts,
    cleanlinessCounts,
    historyDays: HISTORY_DAYS,
    sseClients: sseClients.size,
    persist: state.persist,
    startedAt: state.startedAt,
    uptimeSeconds: Math.round(process.uptime()),
  };
}

// ---------------------------------------------------------------------------
// Router.
// ---------------------------------------------------------------------------
async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const path = url.pathname;

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405).end("Method Not Allowed");
    return;
  }

  if (path === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain" }).end("ok");
    return;
  }
  if (path === "/api/beaches") {
    const beaches = state.snapshot?.beaches;
    if (!Array.isArray(beaches)) {
      sendJSON(res, 503, { error: "data not ready" });
      return;
    }
    sendJSON(res, 200, beaches, { "Cache-Control": "public, max-age=60" });
    return;
  }
  if (path === "/api/status") {
    sendJSON(res, 200, buildStatus(), { "Cache-Control": "no-cache" });
    return;
  }
  if (path === "/api/stream") {
    handleStream(req, res);
    return;
  }
  if (path === "/api/history") {
    const beach = url.searchParams.get("beach");
    const range = url.searchParams.get("range") === "24h" ? "24h" : "7d";
    if (!beach) {
      sendJSON(res, 400, { error: "missing ?beach=" });
      return;
    }
    sendJSON(res, 200, { beach, range, samples: readHistory(beach, range) }, { "Cache-Control": "public, max-age=60" });
    return;
  }

  await serveStatic(req, res, path);
}

const server = createServer((req, res) => {
  // Baseline security headers on every response.
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  // Any throw in routing becomes a 500 — never an unhandled rejection that would crash the process.
  handleRequest(req, res).catch((e) => {
    console.error("server: request handler error:", e && e.message ? e.message : e);
    if (!res.headersSent) {
      try { res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" }); } catch {}
    }
    try { res.end("Internal Server Error"); } catch {}
  });
});

// ---------------------------------------------------------------------------
// Boot.
// ---------------------------------------------------------------------------
async function main() {
  await initState();

  // Serve as fast as possible: if no persisted snapshot, do a fast (Open-Meteo only) build first.
  if (!state.snapshot) {
    await buildFast();
  }

  server.listen(PORT, HOST, () => {
    console.log(`FlagWatch server listening on http://${HOST}:${PORT} (state: ${state.persist ? STATE_DIR : "memory-only"})`);
  });

  // Enrich with the full Copernicus build right away, then on the 2h cadence.
  buildFull();
  const timer = setInterval(buildFull, FULL_BUILD_MS);

  // Graceful shutdown (Fly sends SIGTERM on deploy/restart).
  const shutdown = (sig) => {
    console.log(`server: ${sig} — shutting down`);
    clearInterval(timer);
    for (const res of sseClients) { try { res.end(); } catch {} }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Last-resort safety net: log a stray rejection instead of letting Node's default
  // behaviour terminate this long-running server.
  process.on("unhandledRejection", (reason) => {
    console.error("server: unhandledRejection:", reason && reason.message ? reason.message : reason);
  });
}

main().catch((e) => {
  console.error("server: fatal:", e);
  process.exit(1);
});
