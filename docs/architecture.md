# Architecture

## System overview

```
                         ┌──────────── USGS FDSN API (no key) ───────────┐
                         │                                                │
                   bulk history (30 d)                          past-hour feed (every 5 min)
                         │                                                │
                    ┌────▼─────┐                                     ┌────▼─────┐
                    │ Python   │                                     │  Node    │
                    │ ETL      │                                     │  poller  │
                    │ (one-shot)│                                    │ (service)│
                    └────┬─────┘                                     └────┬─────┘
                         │ idempotent upsert                            │ upsert + diff new ids
                         ▼                                              ▼
              ┌──────────────────────────────────────────────────────────────┐
              │              PostgreSQL 16 + PostGIS 3.4                      │
              │  quakes: GEOGRAPHY(Point) + GIST index                        │
              │  zones:  GEOGRAPHY(Point) + radius_km                         │
              └──────────────────────────▲───────────────────────────────────┘
                                         │ parameterized SQL
                                  ┌──────┴───────┐
                                  │ Express API  │ ──SSE push──► /live
                                  └──────▲───────┘
                                         │ REST + SSE
                                  ┌──────┴───────────────┐
                                  │ React + Mapbox GL + D3 │
                                  └───────────────────────┘
```

## Data flow

1. **Seed.** The ETL container fetches 30 days of USGS earthquakes, validates and
   upserts them into `quakes`. Exits; the table is now the source of truth.
2. **Live updates.** The Node poller fetches the USGS past-hour feed every 5 minutes,
   upserts revisions (`ON CONFLICT DO UPDATE` — USGS revises magnitudes), diffs ids
   to find genuinely new events, and broadcasts them over SSE. Each new event is
   checked against all watch zones with `ST_DWithin`; hits produce `zone-alert`.
3. **Reads.** The React client fetches viewport-filtered quakes (`bbox` param →
   `ST_Intersects` on the GIST index), analytics aggregates, and zone data. It never
   talks to the database — only to the Express API.

## Key decisions and trade-offs

### PostGIS `GEOGRAPHY` over `GEOMETRY`
`GEOGRAPHY` makes distances real-world meters (`ST_DWithin` in meters on the WGS-84
ellipsoid) at the cost of slightly slower index operations than planar `GEOMETRY`.
For a global dataset with radius queries, correctness beats speed.

### GIST spatial index
`CREATE INDEX ... USING GIST (geom)` builds an R-tree over bounding boxes. A
"quakes inside this rectangle" query prunes to candidate boxes instead of scanning
every row — this is what keeps viewport queries at single-digit milliseconds at
100k+ rows (see `perf/benchmarks.md`).

### Idempotent upserts everywhere
Both the ETL and the poller use `INSERT ... ON CONFLICT (id) DO UPDATE`. The pipeline
can be re-run, restarted, or run concurrently without duplicate rows. USGS revises
event magnitudes as more seismograph data arrives; upserts propagate revisions.

### SSE instead of WebSockets
The server only pushes to clients (new quakes, zone alerts); clients never send.
Server-Sent Events is one-way HTTP, needs no library, and the browser reconnects
automatically. WebSockets would add a protocol and client library for no benefit here.

### Mapbox GL over Leaflet
Mapbox GL renders via WebGL on the GPU: heatmaps and clustering over tens of
thousands of points stay smooth at 60fps. Leaflet is DOM/SVG-based and degrades far
earlier. Cost: a free API token and a heavier bundle. The client degrades to a clear
setup screen when the token is missing.

### Server-side filtering over client-side
Magnitude filters, bbox filtering, and aggregation run in SQL. The browser only ever
receives data it will draw. This keeps client memory flat and transfers small.

### Viewport-driven fetching
The map refetches `GET /api/quakes?bbox=<visible area>` on `moveend` (debounced
300 ms). Only what is on screen is ever queried or transferred. Combined with the
GIST index, this is the platform's primary performance lever.

### Circle geofences
Watch zones are circles: `GEOGRAPHY(POINT)` center + `radius_km`, checked with
`ST_DWithin`. Polygon zones would require a draw plugin (mapbox-gl-draw) and
`ST_Intersects` with polygon storage. Circles cover the alert use case with less UI
and no extra dependency.
**Upgrade trigger:** if zones need irregular shapes (coastlines, jurisdictions),
add mapbox-gl-draw and store `GEOGRAPHY(POLYGON)`.

### OSRM demo server for routing
Route geometry comes from the public OSRM demo (`router.project-osrm.org`) with a
5 s timeout and a straight-line fallback. The demo server is not for production.
**Upgrade trigger:** self-host OSRM (or Valhalla) once demo rate limits bite.

### Python for ETL, Node for serving
Python's data ecosystem makes cleaning/validation terse; a one-shot script is its
ideal shape. Node owns request/response and the persistent poller — one runtime for
the always-on process, one for batch work. The USGS parsing logic is duplicated in
both (10 lines); a shared schema registry would be over-engineering at this size.

## Failure modes handled

- **USGS API down:** ETL retries with backoff; the poller logs and keeps the last
  good data. The API keeps serving the database, which is unaffected.
- **OSRM down:** route endpoint falls back to a geodesic line, `provider: "fallback"`.
- **Bad client input:** every endpoint validates and returns 400 with a message —
  the client shows it instead of crashing.
- **SSE reconnection:** native to EventSource; on reconnect the client gets a fresh
  snapshot.
- **Antimeridian:** bboxes crossing ±180° are split into two envelopes in SQL.

## Repository layout

```
database/init/     PostGIS extension + schema (mounted into the container on first boot)
etl/               Python bulk seed + pytest
server/            Express API, poller, SSE hub, jest tests, bench/
client/            React + Mapbox GL + D3, vitest, nginx
docs/              this file + the API contract
.github/workflows/ CI
```
