# API Contract — GeoViz Seismic Platform

This document is the single source of truth between the Node.js API (`server/`)
and the React client (`client/`). All endpoints are prefixed `/api` except `/live`.
Errors use `{ "error": "<message>" }` with an appropriate status code (400 bad params, 404 not found, 500 server).

## Conventions

- Quake GeoJSON Feature:
  ```json
  {
    "type": "Feature",
    "geometry": { "type": "Point", "coordinates": [lng, lat] },
    "properties": { "id": "us7000abc", "mag": 5.2, "place": "10 km SE of Pahala, Hawaii",
                    "time": "2026-10-28T14:23:01.000Z", "depthKm": 8.4, "tsunami": false, "felt": 42 }
  }
  ```
  `felt` may be `null`.
- `time` is ISO 8601 UTC everywhere. `time` epoch ms accepted as query param.
- `bbox` query param: `minLng,minLat,maxLng,maxLat` (EPSG:4326). May cross the
  antimeridian (minLng > maxLng); server must handle it. All four values must be
  valid floats in range (lng [-180,180], lat [-90,90]); otherwise 400.

## Endpoints

### GET /api/health
`200` → `{ "status": "ok", "db": "up", "quakeCount": 12345 }` (`db: "down"` + 503 if DB unreachable).

### GET /api/quakes
Viewport + filter query for map display.
Params (all optional): `bbox`, `minMag` (float, default 0), `start` / `end` (epoch ms),
`limit` (int, default 5000, max 20000).
`200` → GeoJSON FeatureCollection, most recent first.

### GET /api/analytics/summary
`200` → `{ "total": int, "avgMag": float|null, "maxMag": float|null, "last24h": int, "withTsunami": int }`

### GET /api/analytics/timeseries?days=30
`200` → `[{ "date": "2026-10-28", "count": 12, "avgMag": 3.4 }, ...]` — one entry per day, oldest first, zero-filled days included.

### GET /api/analytics/magnitude-hist?binsize=0.5
`200` → `[{ "bin": 2.5, "count": 340 }, ...]` — lower bound of each bin, ascending.

### GET /api/analytics/depth-scatter?limit=2000&minMag=4.5
`200` → `[{ "mag": 5.2, "depthKm": 8.4 }, ...]` — most recent matching quakes up to `limit` (max 5000).

### GET /api/heatmap?bbox=&precision=0.5
Server-side density grid via `ST_SnapToGrid`.
`200` → GeoJSON FeatureCollection of Point features, one per occupied cell,
`properties: { count }`, `precision` clamped to [0.1, 5].

### GET /api/zones
`200` → `[{ "id": 1, "name": "Tokyo", "lng": 139.69, "lat": 35.68, "radiusKm": 250, "quakeCount": 4 }, ...]`
(`quakeCount` = quakes inside the zone right now).

### POST /api/zones
Body: `{ "name": "Tokyo", "lng": 139.69, "lat": 35.68, "radiusKm": 250 }`
Validation: name 1–100 chars, lng [-180,180], lat [-90,90], radiusKm (1–20000). Bad input → 400.
`201` → created zone object (same shape as GET list items).

### DELETE /api/zones/:id
`204` on success, `404` if unknown id.

### GET /api/zones/:id/quakes
`200` → GeoJSON FeatureCollection of quakes within the zone radius, most recent first.
`404` if unknown id.

### POST /api/routes
Body: `{ "lng": -122.42, "lat": 37.77, "limit": 5 }`
Finds the nearest significant epicenters and routes to the top-ranked one.
`200` →
```json
{
  "candidates": [{ "id": "us7000abc", "mag": 6.1, "place": "...", "distanceKm": 210.4, "lng": -122.9, "lat": 37.1 }],
  "route": { "provider": "osrm", "distanceKm": 312.5, "durationMin": 214,
             "geometry": { "type": "LineString", "coordinates": [[lng,lat],...] } }
}
```
`route.provider` is `"fallback"` with a straight-line `geometry` when OSRM is unreachable;
`route` is `null` if no candidates exist.

## Live — GET /live (Server-Sent Events)

`Content-Type: text/event-stream`. On connect, server sends:
```
event: snapshot
data: {"quakes": [ <feature>, ... up to 20 most recent ]}
```
Then, as the poller discovers new events (and matching zone hits), it sends:
```
event: quake
data: { <feature> }

event: zone-alert
data: { "zoneId": 3, "zoneName": "Tokyo", "quake": { <feature> } }
```
Clients use the native `EventSource` (auto-reconnects). Heartbeat comment `: ping` every 25 s.
