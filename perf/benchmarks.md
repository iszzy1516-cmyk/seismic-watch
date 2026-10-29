# Benchmarks

End-to-end HTTP latency against the containerized stack (Docker Compose on a
developer machine, 2026-10-29). Each number is the **median of 20 iterations**,
measured from request start until the response body is fully received and parsed
(`fetch` + `res.json()`), i.e. what the UI actually experiences.

Reproduce:

```bash
docker compose up --build -d          # stack running, ETL seeded
cd server
# baseline (real seed, ~1.9k rows for the past 30 days, mag >= 2.5)
DATABASE_URL=postgres://geo:geo@localhost:5434/geo node bench/benchmark.js --iters 20
# scaled (adds 100k synthetic rows for the run, removes them afterwards)
DATABASE_URL=postgres://geo:geo@localhost:5434/geo node bench/benchmark.js --scale 100000 --iters 20
```

Synthetic rows are random global points with realistic magnitudes (2.5–8), ids
prefixed `bench-*`, deleted in a `finally` block — the benchmark never pollutes
real data.

## Results

### Baseline — 1,937 real rows (30 days of USGS data, mag ≥ 2.5)

| Endpoint | median ms | min | max |
|---|---|---|---|
| GET /api/quakes (world, limit 20000) | 24 | 22 | 70 |
| GET /api/quakes (Japan bbox) | 3.3 | 2.0 | 4.9 |
| GET /api/quakes (minMag=4.5, world) | 9.2 | 8.6 | 11 |
| GET /api/heatmap (precision 0.5) | 6.7 | 5.5 | 8.6 |
| GET /api/heatmap (precision 2.0) | 5.2 | 3.9 | 6.6 |
| GET /api/analytics/summary | 1.9 | 1.2 | 4.8 |
| GET /api/analytics/timeseries (30 d) | 2.8 | 2.3 | 4.2 |
| GET /api/zones (incl. per-zone quakeCount) | 1.2 | 0.9 | 14 |

### Scaled — 101,937 rows (baseline + 100k synthetic)

| Endpoint | median ms | min | max |
|---|---|---|---|
| GET /api/quakes (world, limit 20000) | 291 | 222 | 432 |
| GET /api/quakes (Japan bbox) | 43 | 34 | 61 |
| GET /api/quakes (minMag=4.5, world) | 274 | 230 | 324 |
| GET /api/heatmap (precision 0.5) | 422 | 367 | 541 |
| GET /api/heatmap (precision 2.0) | 204 | 161 | 279 |
| GET /api/analytics/summary | 20 | 16 | 33 |
| GET /api/analytics/timeseries (30 d) | 141 | 118 | 215 |
| GET /api/zones (incl. per-zone quakeCount) | 2.3 | 1.5 | 26 |

## Reading the numbers

- **Spatial index does its job.** The Japan-bbox query touches a fixed geographic
  area, so 52× more total rows cost ~13× more time (3.3 → 43 ms) — and even that is
  dominated by serializing the returned features, not the lookup.
- **World queries are transfer-bound.** ~290 ms for 20k features at 102k rows is
  JSON serialization + payload size, not SQL. This is exactly why the client
  fetches per viewport instead of holding the whole dataset.
- **Aggregation scales better than raw retrieval.** `ST_SnapToGrid` heatmap cells
  and the zones-with-counts query return hundreds of rows regardless of table size;
  precision 2.0 (~4× fewer cells than 0.5°) halves the heatmap cost.
- **The zones endpoint is effectively flat** (1.2 → 2.3 ms) because geofence
  counting only visits quakes near each zone's circle, thanks to `ST_DWithin` +
  the GIST index.

Machine: commodity Linux developer box, Docker Compose, PostgreSQL 16/PostGIS 3.4
defaults — no tuning. Absolute numbers will vary; the *shape* (index-pruned queries
scale with result size, not table size) is the point.
