// FlagWatch a11y + honesty smoke test (jsdom + axe-core).
// Dev-only (devDependencies; never shipped — Netlify build is empty, publish=".").
// Run: npm install && npm test   (or: node test/a11y-smoke.mjs)
//
// What it does:
//  1. Loads index.html into jsdom, stubs Leaflet (L), fetch, localStorage, matchMedia, navigator.
//  2. Executes the real app.js and lets it render the beach list from a fixture.
//  3. Asserts the HONESTY invariants still hold (— / Unknown / Unavailable; never assumed-green).
//  4. Runs axe-core for structural a11y rules (button-name, label, aria-*, list, region…).
//  5. Runs a deterministic WCAG 2.x contrast calculator on the theme tokens (axe can't do
//     color-contrast reliably in jsdom — no real layout/getComputedStyle for colors).
//
// Exit non-zero if: honesty regressions, axe serious/critical violations, or a contrast pair fails.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';
import axe from 'axe-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

let failures = 0;
const fail = (msg) => { failures++; console.error('  ✗ ' + msg); };
const ok = (msg) => console.log('  ✓ ' + msg);

// ---------------------------------------------------------------------------
// Fixture: varied flags + cleanliness, incl. a null-flag / unavailable / null-numeric beach.
// ---------------------------------------------------------------------------
const fixture = [
  mk('sunny', 'Sunny Beach', 'Слънчев бряг', 'green', 'clear',
     { waveHeight: 0.3, waterTemp: 24.1, airTemp: 27, windSpeed: 12, windGust: 20, windDirection: 90, uvIndex: 7 },
     { lifeguards: true, restaurants: true }),
  mk('balchik', 'Balchik', 'Балчик', 'yellow', 'moderate',
     { waveHeight: 0.8, waterTemp: 22.5, airTemp: 25, windSpeed: 28, windGust: 40, windDirection: 200, uvIndex: 6 },
     { family: true }),
  mk('kavarna', 'Kavarna', 'Каварна', 'red', 'high',
     { waveHeight: 1.8, waterTemp: 20, airTemp: 23, windSpeed: 45, windGust: 65, windDirection: 315, uvIndex: 5 },
     { blueflag: true }),
  // The honesty case: no flag (unknown), unavailable algae, several null numerics.
  mk('wild', 'Wild Cove', 'Дива клисура', null, 'unavailable',
     { waveHeight: null, waterTemp: null, airTemp: 21, windSpeed: null, windGust: null, windDirection: null, uvIndex: null },
     { camping: true }),
];

// Synthetic condition history with deliberate GAPS (null) to verify gaps render as breaks, not 0.
const SYNTH_HISTORY = [
  { t: "2026-05-30T00:00:00.000Z", waterTemp: 19.0, waveHeight: 0.4, chl: 1.2, flag: "green" },
  { t: "2026-05-31T00:00:00.000Z", waterTemp: 20.1, waveHeight: 0.6, chl: null, flag: "green" }, // chl gap
  { t: "2026-06-01T00:00:00.000Z", waterTemp: null, waveHeight: 0.5, chl: 2.0, flag: "green" }, // temp gap
  { t: "2026-06-02T00:00:00.000Z", waterTemp: 21.5, waveHeight: 1.1, chl: 3.1, flag: "yellow" },
  { t: "2026-06-03T00:00:00.000Z", waterTemp: 22.0, waveHeight: 0.7, chl: 1.8, flag: "green" },
];

function mk(id, name, name_bg, flag, cleanliness, cond, facilities) {
  return {
    id, name, name_bg,
    coordinates: { lat: 43 + Math.random() * 0.5, lng: 28 + Math.random() * 0.5 },
    region: 'Test', type: 'urban', facilities,
    description: name + ' description', description_bg: name_bg + ' описание',
    conditions: { ...cond, waterTempSource: 'model', flag, lastUpdated: '2026-06-02T12:00:00.000Z' },
    cleanliness: {
      status: cleanliness, value: cleanliness === 'unavailable' ? null : 0.5, source: 'Copernicus',
      observedAt: '2026-06-02T00:00:00.000Z',
      report_en: cleanliness === 'unavailable' ? '' : 'Algae report EN',
      report_bg: cleanliness === 'unavailable' ? '' : 'Доклад BG',
    },
  };
}

// ---------------------------------------------------------------------------
// Leaflet stub — chainable; markers expose a real DOM element so a11y attrs can be set/read.
// ---------------------------------------------------------------------------
function makeLeafletStub(documentRef) {
  const chain = () => {
    const o = {};
    for (const m of ['setView', 'addTo', 'on', 'off', 'remove', 'removeLayer', 'addLayer',
                     'flyTo', 'invalidateSize', 'setUrl', 'openPopup', 'bindPopup', 'setLatLng']) {
      o[m] = () => o;
    }
    return o;
  };
  return {
    map: () => chain(),
    tileLayer: () => chain(),
    divIcon: (opts) => ({ options: opts }),
    marker: () => {
      const el = documentRef.createElement('div');
      const m = chain();
      m.getElement = () => el;
      return m;
    },
  };
}

// ---------------------------------------------------------------------------
// Boot the app inside jsdom.
// ---------------------------------------------------------------------------
async function boot(theme = 'light') {
  const html = read('index.html');
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost:8888/' });
  const { window } = dom;

  // Stubs (several window/navigator props are getter-only in jsdom -> defineProperty)
  const store = new Map();
  if (theme === 'dark') store.set('theme', 'dark');
  const def = (obj, k, value) => Object.defineProperty(obj, k, { value, configurable: true, writable: true });
  def(window, 'localStorage', {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  });
  def(window, 'matchMedia', (q) => ({
    matches: theme === 'dark' && /dark/.test(q),
    media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  }));
  def(window.navigator, 'onLine', true);
  def(window.navigator, 'geolocation', { getCurrentPosition() {} });
  def(window.navigator, 'serviceWorker', { register: () => Promise.resolve({}) });
  def(window, 'L', makeLeafletStub(window.document));
  def(window, 'fetch', async (url) => {
    const u = String(url);
    if (u.includes('/api/history')) {
      return { ok: true, status: 200, json: async () => ({ beach: 'x', range: '7d', samples: SYNTH_HISTORY }) };
    }
    return { ok: true, status: 200, json: async () => fixture };
  });
  // Silence app console noise
  def(window, 'console', { log() {}, warn() {}, error() {}, info() {} });

  // Run the real app source, expose the class, instantiate, and wait for render.
  let src = read('app.js');
  src += '\n;window.__BeachSafetyApp = BeachSafetyApp;';
  window.eval(src);
  const app = new window.__BeachSafetyApp();

  // Wait until the list has rendered (or timeout).
  await waitFor(() => {
    const list = window.document.getElementById('beach-list-desktop') || window.document.getElementById('beach-list');
    return list && list.querySelector('.beach-item');
  }, 3000);

  // Simulate the post-load state (app reveals #app after a setTimeout we don't wait on).
  window.document.getElementById('app')?.classList.remove('hidden');
  const ls = window.document.getElementById('loading-screen');
  if (ls) ls.style.display = 'none';

  return { dom, window, app };
}

function waitFor(pred, ms) {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      try { if (pred()) return resolve(true); } catch {}
      if (Date.now() - start > ms) return resolve(false);
      setTimeout(tick, 10);
    };
    tick();
  });
}

// ---------------------------------------------------------------------------
// axe-core run inside the jsdom window.
// ---------------------------------------------------------------------------
async function runAxe(window, label) {
  window.eval(axe.source);
  const results = await window.axe.run(window.document, {
    resultTypes: ['violations'],
    // color-contrast can't run reliably in jsdom (no layout) -> handled separately.
    rules: { 'color-contrast': { enabled: false } },
  });
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  console.log(`\n[axe] ${label}: ${results.violations.length} violations (${serious.length} serious/critical)`);
  for (const v of results.violations) {
    const tag = (v.impact || '?').toUpperCase();
    console.log(`   [${tag}] ${v.id}: ${v.help} (${v.nodes.length} node(s))`);
    for (const n of v.nodes.slice(0, 3)) console.log(`        ${n.target.join(' ')}`);
  }
  if (serious.length) fail(`axe found ${serious.length} serious/critical violation(s) in ${label}`);
  else ok(`axe: no serious/critical violations in ${label}`);
  return results;
}

// ---------------------------------------------------------------------------
// Deterministic WCAG contrast check on the theme tokens (parsed from style.css).
// ---------------------------------------------------------------------------
function relLum({ r, g, b }) {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function ratio(a, b) { const L1 = relLum(a), L2 = relLum(b); const hi = Math.max(L1, L2), lo = Math.min(L1, L2); return (hi + 0.05) / (lo + 0.05); }
function hex(h) {
  h = h.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}
function tokenVal(css, name, scope = ':root') {
  // crude scoped lookup: find the scope block, then the token.
  const block = scope === ':root'
    ? css.slice(css.indexOf(':root'))
    : css.slice(css.indexOf(scope));
  const m = block.match(new RegExp(name + '\\s*:\\s*(#[0-9a-fA-F]{3,6})'));
  return m ? m[1] : null;
}
function checkContrast(css) {
  console.log('\n[contrast] WCAG 2.x text contrast (target 4.5:1 normal, 3:1 large/graphical):');
  // Pairs that must meet 4.5:1 (status TEXT on its surface). Token names may be the originals
  // (baseline) or the new *-text tokens (after). We probe both and report whichever exists.
  const surfaceLight = '#ffffff'; // modal/card surface in light theme
  const surfaceDark = '#2c2e33';
  const probes = [
    ['light success text', ['--color-success-text', '--color-success'], surfaceLight, 4.5],
    ['light warning text', ['--color-warning-text', '--color-warning'], surfaceLight, 4.5],
    ['light danger text',  ['--color-danger-text', '--color-danger'],  surfaceLight, 4.5],
    ['light info text',    ['--color-info-text', '--color-info'],      surfaceLight, 4.5],
  ];
  for (const [name, names, surf, min] of probes) {
    let val = null, used = null;
    for (const n of names) { val = tokenVal(css, n); if (val) { used = n; break; } }
    if (!val) { console.log(`   ? ${name}: token not found`); continue; }
    const r = ratio(hex(val), hex(surf));
    const pass = r >= min;
    console.log(`   ${pass ? '✓' : '✗'} ${name} (${used} ${val} on ${surf}): ${r.toFixed(2)}:1 ${pass ? '' : '< ' + min}`);
    if (!pass) fail(`contrast ${name} = ${r.toFixed(2)}:1 (need ${min}:1)`);
  }
}

// ---------------------------------------------------------------------------
// Honesty + structural assertions.
// ---------------------------------------------------------------------------
function checkHonesty(window, app) {
  console.log('\n[honesty] invariants:');
  const doc = window.document;
  // Open the unknown/unavailable beach modal and inspect honest rendering.
  app.openBeachDetailModal('wild');
  const flag = doc.getElementById('beach-flag').textContent;
  if (/unknown|неизвестно|⚪/i.test(flag)) ok(`null flag renders Unknown (not green): "${flag}"`);
  else fail(`null flag did not render Unknown: "${flag}"`);

  const waves = doc.getElementById('waves-value').textContent.trim();
  if (waves === '—') ok('null waveHeight renders —'); else fail(`null waveHeight rendered "${waves}" (expected —)`);
  const wind = doc.getElementById('wind-value').textContent.trim();
  if (wind === '—') ok('null windSpeed renders —'); else fail(`null windSpeed rendered "${wind}" (expected —)`);

  const clean = doc.getElementById('cleanliness-status').textContent.trim();
  if (/unavailable|недостъпно/i.test(clean)) ok(`unavailable cleanliness labeled: "${clean}"`);
  else fail(`unavailable cleanliness rendered "${clean}"`);
  const cleanClass = doc.getElementById('cleanliness-status').className;
  if (!/\b(clear)\b/.test(cleanClass)) ok('unavailable not styled as clear'); else fail('unavailable styled as clear');
}

function checkInteractions(window, app) {
  console.log('\n[interaction] keyboard behaviour:');
  const doc = window.document;
  const KeyEv = (key, opts = {}) => new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts });

  // Beach card is a real button that opens the modal.
  const btn = doc.querySelector('.beach-item .beach-item__btn');
  if (btn && btn.tagName === 'BUTTON') ok('beach card is a <button>'); else fail('beach card is not a <button>');
  btn?.click();
  const modal = doc.getElementById('beach-modal');
  if (modal && !modal.classList.contains('hidden')) ok('clicking card opens the modal'); else fail('card click did not open modal');

  // Focus moved into the dialog, background made inert.
  if (modal && modal.contains(doc.activeElement)) ok('focus moved into the dialog'); else fail('focus not moved into dialog');
  if (doc.getElementById('app').hasAttribute('inert')) ok('background (#app) is inert while modal open'); else fail('#app not inert');

  // Escape closes and restores focus to the trigger.
  doc.dispatchEvent(KeyEv('Escape'));
  if (modal.classList.contains('hidden')) ok('Escape closes the modal'); else fail('Escape did not close modal');
  if (!doc.getElementById('app').hasAttribute('inert')) ok('inert removed on close'); else fail('inert not removed on close');

  // Radiogroup: arrow key moves selection + aria-checked + roving tabindex.
  app.setFilter('all');
  const group = doc.querySelector('.filter-controls[role="radiogroup"]');
  const radios = Array.from(group.querySelectorAll('.filter-btn'));
  group.dispatchEvent(KeyEv('ArrowRight'));
  if (app.currentFilter === radios[1].dataset.filter) ok(`ArrowRight selects next radio (${app.currentFilter})`); else fail(`ArrowRight did not move selection (got ${app.currentFilter})`);
  if (radios[1].getAttribute('aria-checked') === 'true' && radios[0].getAttribute('aria-checked') === 'false') ok('aria-checked moved with selection'); else fail('aria-checked not updated');
  if (radios[1].tabIndex === 0 && radios[0].tabIndex === -1) ok('roving tabindex: only checked radio is tabbable'); else fail('roving tabindex incorrect');
  app.setFilter('all'); // reset
}

async function checkTrends(window, app) {
  console.log('\n[trends] sparklines (gaps must render as breaks, never 0):');
  const doc = window.document;
  app.openBeachDetailModal('balchik');
  await app.loadTrends('balchik');
  const body = doc.getElementById('trends-body');
  const svgs = body.querySelectorAll('svg.trend-svg');
  if (svgs.length >= 1) ok(`renders ${svgs.length} sparkline(s)`); else fail('no sparkline rendered');
  const labelled = svgs.length && Array.from(svgs).every((s) => s.getAttribute('role') === 'img' && s.getAttribute('aria-label'));
  if (labelled) ok('each sparkline is role=img with an aria-label'); else fail('sparkline missing role=img / aria-label');
  // The synthetic data has a null in waterTemp and in chl → those metrics must split into >1 segment.
  const polys = body.querySelectorAll('polyline').length;
  if (polys >= 4) ok(`gaps split the lines (${polys} polyline segments across metrics)`); else fail(`expected gap-split segments, got ${polys}`);
  app.renderTrends([]);
  if (/trends-empty/.test(body.innerHTML)) ok('empty history → honest "not enough history" state'); else fail('no honest empty state');
  app.toggleModal('beach-modal', false);
}

function checkI18n(app) {
  console.log('\n[i18n] EN/BG key parity:');
  const en = app.translations.en, bg = app.translations.bg;
  const diff = (a, b, path) => {
    const ak = Object.keys(a), bk = Object.keys(b);
    const missingInB = ak.filter((k) => !(k in b));
    const missingInA = bk.filter((k) => !(k in a));
    if (missingInB.length) fail(`bg${path} missing: ${missingInB.join(', ')}`);
    if (missingInA.length) fail(`en${path} missing: ${missingInA.join(', ')}`);
    // Recurse into nested objects present in both.
    for (const k of ak) {
      if (a[k] && typeof a[k] === 'object' && b[k] && typeof b[k] === 'object') diff(a[k], b[k], `${path}.${k}`);
    }
  };
  diff(en, bg, '');
  if (!failures) ok('en and bg translation keys match (incl. nested objects)');
}

function checkStructure(window) {
  console.log('\n[structure] a11y patterns (informational on baseline, required after):');
  const doc = window.document;
  const probe = (cond, msg) => console.log(`   ${cond ? '✓' : '·'} ${msg}`);

  probe(!!doc.querySelector('.skip-link, [href="#main-content"]'), 'skip link present');
  probe(!!doc.querySelector('.visually-hidden, .sr-only'), 'visually-hidden utility used');
  probe(!!doc.querySelector('#beach-modal[aria-modal="true"]'), 'beach-modal has aria-modal="true"');
  const item = doc.querySelector('.beach-item');
  probe(!!(item && (item.tagName === 'BUTTON' || item.querySelector('button') || item.getAttribute('role') === 'button')), 'beach-item is/contains a button');
  probe(!!doc.querySelector('[role="radiogroup"]'), 'filter row is a radiogroup');
  probe(!!doc.querySelector('[role="status"][aria-live], [aria-live="polite"]'), 'polite live region present');
  probe(!!doc.querySelector('label[for="search-input"], label[for="search-input-desktop"]'), 'search input has a <label>');
}

// ---------------------------------------------------------------------------
async function main() {
  console.log('=== FlagWatch a11y + honesty smoke ===');

  const css = read('style.css');

  // Light theme pass
  console.log('\n--- LIGHT THEME ---');
  const light = await boot('light');
  checkI18n(light.app);
  checkHonesty(light.window, light.app);
  checkStructure(light.window);
  checkInteractions(light.window, light.app);
  await checkTrends(light.window, light.app);
  // reset modal state before axe (close it) to scan the main view
  light.app.toggleModal?.('beach-modal', false);
  await runAxe(light.window, 'light / main view');
  // scan with a beach modal open
  light.app.openBeachDetailModal('balchik');
  await runAxe(light.window, 'light / beach modal open');

  // Dark theme pass (structural only; tokens differ)
  console.log('\n--- DARK THEME ---');
  const dark = await boot('dark');
  await runAxe(dark.window, 'dark / main view');

  // Contrast (token math)
  checkContrast(css);

  console.log('\n=== RESULT ===');
  if (failures) { console.error(`FAILED: ${failures} issue(s).`); process.exit(1); }
  console.log('PASSED: no honesty regressions, no serious/critical axe violations, contrast OK.');
  // The app under test arms a 30-min setInterval (periodic refresh) that keeps the Node
  // event loop alive, so we MUST exit explicitly or the process hangs after printing.
  process.exit(0);
}

main().catch((e) => { console.error('Harness error:', e); process.exit(2); });
