# FlagWatch

Beach conditions for the Bulgarian Black Sea coast: swim-safety flag, water and air
temperature, wind, and an algae/water-cleanliness read for 47 beaches between Durankulak and
Rezovo. It's a small progressive web app, a Leaflet map plus a searchable list and a detail view,
in English and Bulgarian, with a dark mode.

Live at https://flagwatch.gokaroth.com

## The one rule: don't invent data

This is a safety tool, so it never fills in a number it doesn't have. A missing value shows up as
"—", not a zero. The flag needs both wave height and wind speed; without both it reads "Unknown"
instead of a reassuring green. Water cleanliness has a real "Unavailable" state, shown in neutral
grey, which does not mean the water is clean, only that there's no reading. Water temperature is a
model estimate and says as much.

If you ever see green, it's because the actual numbers say so.

## How it decides

- **Flag** (from Open-Meteo wave height and wind speed): danger above 2 m or 40 km/h, caution
  above 1.25 m or 25 km/h, otherwise safe, and only when both numbers are known.
- **Algae** (from Copernicus Marine chlorophyll-a satellite data): roughly clear below 5 mg/m³,
  moderate up to 20, high above that. About half the beaches come back "unavailable" because the
  exact shoreline point sits on a masked land pixel.
- **Water temperature**: the Copernicus Black Sea model when it has a value, otherwise Open-Meteo.

`DATA_SOURCES.md` has the exact products and endpoints.

## How it's built

A single Node server (`server.mjs`, no dependencies) serves the static frontend and a small
read-only JSON API. It rebuilds the dataset every two hours, keeps the latest snapshot and a
rolling history on disk, and pushes updates to open browsers over Server-Sent Events. The frontend
is plain JavaScript, HTML and CSS with no build step; the map is Leaflet on CARTO tiles. It runs on
Fly.io as one always-on machine in Frankfurt, behind a Cloudflare domain. `CLAUDE.md` covers the
architecture in more detail.

## Running it

Needs Node 22 or newer.

```bash
npm install                      # dev tooling only; the server itself has no runtime deps
STATE_DIR=./.state npm start     # http://localhost:8080
```

The first request is up in a couple of seconds (weather only). The full satellite build fills in
shortly after and refreshes every two hours. Copernicus is currently keyless, so there's nothing to
configure; if that ever changes, set `COPERNICUS_USERNAME` / `COPERNICUS_PASSWORD` (see
`.env.example`).

`npm test` runs a jsdom + axe check covering the honesty rules, keyboard accessibility, and the
EN/BG string parity.

## Deploying

```bash
fly deploy
```

First-time setup (app and volume creation, the TLS certificate, the Cloudflare CNAME) is written up
in `CLAUDE.md`.

## License

MIT. See [LICENSE](LICENSE).

## Credits

Weather from [Open-Meteo](https://open-meteo.com), satellite data from the EU's
[Copernicus Marine Service](https://marine.copernicus.eu), maps from
[Leaflet](https://leafletjs.com), [CARTO](https://carto.com) and
[OpenStreetMap](https://www.openstreetmap.org).
