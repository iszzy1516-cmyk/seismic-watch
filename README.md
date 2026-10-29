# Seismic Watch — Geospatial Data Visualization Platform

A real-time platform for visualizing and analyzing global earthquake activity:
interactive heat maps, cluster exploration, geofenced watch zones with live alerts,
an analytics dashboard, and route finding to significant epicenters.

**Stack:** React 18 · Mapbox GL JS · D3.js · Node.js/Express · PostgreSQL 16 + PostGIS 3.4 · Python ETL · Server-Sent Events · Docker Compose · GitHub Actions

---

## 1. Problem Statement

Earthquake data is public, abundant (thousands of events per month), and inherently
spatial — but raw feeds are unusable for situational awareness. There is no easy way
to ask *"show me seismic density for what I'm looking at", "alert me if a quake hits
within 300 km of Tokyo", or "how does depth correlate with magnitude?"*

Seismic Watch turns the USGS real-time feed into an interactive location-intelligence
tool: viewport-filtered maps, heat maps, cluster exploration, circle geofences with
server-pushed alerts, SQL-computed analytics, and routing to significant epicenters.
The hard parts — spatial indexing, live event propagation, graceful degradation of
external services — are the same problems logistics, delivery, and urban-planning
platforms solve daily.

## 2. Architecture

```
                         ┌────────── USGS FDSN API (public, keyless) ──────────┐
                         │                                                      │
                   bulk history (30 d)                                 past-hour feed (every 5 min)
                         │                                                      │
                    ┌────▼─────┐                                           ┌────▼─────┐
                    │ Python   │                                           │  Node    │
                    │ ETL      │                                           │  poller  │
                    │ (one-shot)│                                          │ (service)│
                    └────┬─────┘                                           └────┬─────┘
                         │ idempotent upsert                                 │ upsert + diff new ids
                         ▼                                                    ▼
              ┌──────────────────────────────────────────────────────────────────┐
              │                PostgreSQL 16 + PostGIS 3.4                        │
              │  quakes: GEOGRAPHY(Point) with GIST spatial index                 │
              │  zones:  GEOGRAPHY(Point) + radius_km                             │
              └───────────────────────────▲──────────────────────────────────────┘
                                          │ parameterized SQL
                                   ┌──────┴───────┐
                                   │ Express API  │ ──SSE push──► /live
                                   └──────▲───────┘
                                          │ REST + SSE (proxied by nginx)
                                   ┌──────┴───────────────────┐
                                   │ React + Mapbox GL + D3   │
                                   └──────────────────────────┘
```

**Why these choices** (full trade-off discussion in [docs/architecture.md](docs/architecture.md)):

- **PostGIS `GEOGRAPHY` + GIST index** — real-world meter distances and R-tree
  spatial pruning; "quakes inside this rectangle" never scans the whole table.
- **Idempotent upserts everywhere** (`ON CONFLICT DO UPDATE`) — the pipeline can be
  re-run safely, and USGS magnitude revisions propagate automatically.
- **SSE over WebSockets** — server-only push needs no protocol or client library,
  and `EventSource` reconnects natively.
- **Viewport-driven fetching** — the client only ever holds and transfers the data
  currently on screen; combined with the spatial index this is the main perf lever.
- **Server-side filtering/aggregation** — magnitude filters, bins, and time series
  are computed in SQL, not in the browser.

## 3. Live Demo

**Live instance:** https://seismic-watch.iszzysec.com — self-hosted on a personal
server (Docker Compose stack behind a Cloudflare Tunnel), seeded with real USGS
data and streaming live events.

Run it locally:

```bash
cp .env.example .env        # add your free Mapbox token
docker compose up --build
```

- Frontend: http://localhost:3000
- API: http://localhost:4000/api/health

Get a free Mapbox token at https://account.mapbox.com/access-tokens/ (no card
required). Without a token the app shows a setup screen instead of a blank page.

**What to try:** zoom into Japan or the US West Coast (data refetches per viewport) ·
toggle Heatmap/Clusters · drop a watch zone with the radius slider and watch the
live ticker · click a quake and route to it · the dashboard charts recompute from
whatever is in the database.

**Screenshots** (running against the live stack, seeded with real USGS data):

| Clustered globe view | Map + dashboard |
|---|---|
| ![Clustered globe view with live event ticker](docs/screenshots/cluster-globe.png) | ![Map with error-free load, zone panel, D3 charts](docs/screenshots/dashboard.png) |

## 4. Setup Instructions

Prereqs: Docker with the Compose plugin. One command:

```bash
docker compose up --build
```

Compose starts four services:

| Service | Role |
|---|---|
| `db` | PostgreSQL 16 + PostGIS, schema auto-applied on first boot (published on host port **5434** to avoid clashing with a local PostgreSQL) |
| `etl` | One-shot Python job: fetches 30 days of USGS earthquakes, validates and upserts them, exits |
| `server` | Express API + USGS poller (every 5 min) + SSE hub |
| `client` | nginx serving the React build; proxies `/api` and `/live` to the server |

Local development without Docker for the app services:

```bash
# terminal 1 — database only
docker compose up db

# terminal 2 — API (uses .env DATABASE_URL on host port 5434)
cd server && npm install && npm run dev   # or: npm start

# terminal 3 — frontend (proxies /api + /live to :4000)
cd client && npm install && npm run dev
```

## 5. Testing

Three suites, all runnable locally and in CI:

```bash
cd etl    && python -m pytest -v            # 24 tests — transform validation, URL math,
                                            # chunked upserts, retry/backoff (mocked I/O)
cd server && npm test                       # 48 tests — unit (bbox parsing incl.
                                            # antimeridian, bin math, OSRM fallback,
                                            # validation) + integration against a real
                                            # PostGIS container (schema, fixtures, every
                                            # endpoint, SSE snapshot)
cd client && npx vitest run                 # 13 tests — bbox formatting, magnitude
                                            # color scale, circle-polygon geometry
                                            # (haversine-verified), time formatting
```

**Total: 85 tests.** The server integration suite spins up a throwaway
`postgis/postgis:16-3.4` container on port 5433, applies the real schema from
`database/init/`, seeds fixture earthquakes (including antimeridian cases), and
drops everything afterwards. CI runs the same suites plus a `docker compose build`
smoke job — see [.github/workflows/ci.yml](.github/workflows/ci.yml).

## 6. Performance

Benchmarks measure end-to-end HTTP latency (median of 20 iterations, body parsed)
against the containerized stack on a developer machine. Synthetic rows
(`--scale 100000`) are inserted around the run and always cleaned up; they are
marked `bench-*` and never touch real data.

```bash
cd server && DATABASE_URL=postgres://geo:geo@localhost:5434/geo \
  node bench/benchmark.js --scale 100000 --iters 20
```

At **101,937 rows** (30-day real seed + 100k synthetic, cleaned up after the run;
median of 20 iterations, body received and parsed):

| Endpoint | median ms |
|---|---|
| GET /api/quakes (Japan bbox) | 43 |
| GET /api/quakes (minMag=4.5, world) | 274 |
| GET /api/heatmap (precision 2.0) | 204 |
| GET /api/analytics/summary | 20 |
| GET /api/analytics/timeseries (30 d) | 141 |
| GET /api/zones (incl. per-zone quakeCount) | 2.3 |

For contrast, at the real **1,937-row seed**: Japan bbox 3.3 ms, summary 1.9 ms,
zones 1.2 ms.

**Takeaways:** viewport + spatial-index queries stay in single-digit milliseconds at
~100k rows; server-side grid aggregation (`ST_SnapToGrid`) is effectively flat vs.
raw row counts because it returns cells, not points; the heaviest endpoint is the
20k-feature GeoJSON transfer, which is why the client fetches per-viewport rather
than holding the world. Methodology and full numbers: [perf/benchmarks.md](perf/benchmarks.md).

## 7. Lessons Learned

- **Test-container readiness races look like product bugs.** An integration suite
  failed with `ECONNRESET` because `pg_isready` (Unix socket, inside the container)
  reports healthy before the published TCP port accepts connections. Waiting on a
  *remote* connection probe — not the container's own healthcheck — fixed it. CI's
  native service-container healthchecks don't have this issue.
- **Real APIs don't match their docs' tidiness.** USGS puts *depth* inside
  `geometry.coordinates[2]`, returns epoch **milliseconds**, and occasionally lists
  events with no magnitude at all. The schema made `mag` nullable rather than
  dropping those rows — a "detected but not yet measured" earthquake is still real
  data. Every such decision lives in the pure, unit-tested transform layer.
- **External services fail onstage, not in tests.** The public OSRM demo server was
  unreachable during the demo — exactly the case the `AbortController` timeout and
  straight-line fallback were built for. Degrade visibly (`provider: "fallback"`),
  never white-screen.
- **The antimeridian will get you — twice.** A naive `minLng < lon < maxLng` check
  silently returns nothing for bboxes crossing ±180° (Fiji, New Zealand's east), so
  the server splits those into two OR'd envelopes. But the client can *produce*
  out-of-range bboxes too: Mapbox's globe projection reports bounds beyond ±180°,
  which the (correct) server validation rejected on the very first load. The fix in
  `formatBbox` wraps longitudes, preserves genuine dateline-spanning views, clamps
  latitudes, and sends no bbox at all for world-spanning views — four unit tests
  cover each case.
- **Test-container readiness races look like product bugs.** An integration suite
- **Idempotency is a feature, not an afterthought.** Being able to re-run the ETL,
  restart the poller, and replay upserts without duplicates or stale revisions made
  every other part of the system easier to reason about — and it's the first thing
  that breaks in tutorial-grade pipelines.

## Repository layout

```
database/init/     PostGIS extension + schema (mounted into the container on first boot)
etl/               Python bulk seed + pytest
server/            Express API, USGS poller, SSE hub, jest tests, bench/
client/            React + Mapbox GL + D3, vitest, nginx
docs/              architecture.md + api-contract.md
perf/              benchmark results
.github/workflows/ CI
```
