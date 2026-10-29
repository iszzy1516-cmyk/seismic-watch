'use strict';

process.env.DATABASE_URL_TEST = process.env.DATABASE_URL_TEST
  || 'postgres://geo:geo@localhost:5433/geo_test';

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { query, pool } = require('../src/db');
const app = require('../src/app');

function hoursAgo(n) {
  return new Date(Date.now() - n * 60 * 60 * 1000);
}

const FIXTURES = [
  { id: 'test-1', mag: 5.5, place: 'Tokyo', time: hoursAgo(1), depth_km: 10, tsunami: false, felt: 12, lon: 139.69, lat: 35.68 },
  { id: 'test-2', mag: 6.0, place: 'Fiji region', time: hoursAgo(2), depth_km: 550, tsunami: true, felt: 3, lon: 179.9, lat: -17.7 },
  { id: 'test-3', mag: 4.8, place: 'West of Fiji', time: hoursAgo(3), depth_km: 33, tsunami: false, felt: null, lon: -178.5, lat: -18.0 },
  { id: 'test-4', mag: 3.0, place: 'California', time: hoursAgo(5), depth_km: 5, tsunami: false, felt: null, lon: -122.42, lat: 37.77 },
  { id: 'test-5', mag: 4.5, place: 'Chile', time: hoursAgo(8), depth_km: 20, tsunami: false, felt: 8, lon: -70.6, lat: -33.4 },
  { id: 'test-6', mag: 2.9, place: 'Iceland', time: hoursAgo(12), depth_km: 2, tsunami: false, felt: null, lon: -19.0, lat: 64.1 },
  { id: 'test-7', mag: 7.2, place: 'Alaska', time: hoursAgo(20), depth_km: 40, tsunami: true, felt: 500, lon: -151.0, lat: 61.5 },
  { id: 'test-8', mag: 5.1, place: 'Japan east coast', time: hoursAgo(30), depth_km: 15, tsunami: false, felt: 42, lon: 141.5, lat: 36.2 },
  { id: 'test-9', mag: 4.0, place: 'Old quake', time: hoursAgo(24 * 30), depth_km: 12, tsunami: false, felt: null, lon: 25.0, lat: 38.0 },
  { id: 'test-10', mag: 6.5, place: 'Two days ago', time: hoursAgo(24 * 2), depth_km: 25, tsunami: false, felt: 77, lon: 95.0, lat: 5.0 },
];

async function seedQuake(q) {
  await query(
    `INSERT INTO quakes (id, mag, place, time, depth_km, tsunami, felt, geom)
     VALUES ($1, $2, $3, $4, $5, $6, $7, ST_SetSRID(ST_MakePoint($8, $9), 4326)::geography)`,
    [q.id, q.mag, q.place, q.time, q.depth_km, q.tsunami, q.felt, q.lon, q.lat]
  );
}

beforeAll(async () => {
  const initDir = path.join(__dirname, '..', '..', 'database', 'init');
  for (const file of ['01_extensions.sql', '02_schema.sql']) {
    const sql = fs.readFileSync(path.join(initDir, file), 'utf8');
    await query(sql);
  }
  for (const q of FIXTURES) await seedQuake(q);
}, 60000);

afterAll(async () => {
  await query('DROP TABLE IF EXISTS zones');
  await query('DROP TABLE IF EXISTS quakes');
  await pool.end();
}, 30000);

describe('integration: real PostGIS database', () => {
  test('GET /api/health reports ok and quake count', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'up', quakeCount: 10 });
  });

  test('GET /api/quakes filters by bbox and minMag', async () => {
    const res = await request(app).get('/api/quakes?bbox=139,35,140,36&minMag=5');
    expect(res.status).toBe(200);
    const ids = res.body.features.map((f) => f.properties.id);
    expect(ids).toEqual(['test-1']);
    expect(res.body.features[0].properties.mag).toBe(5.5);
    expect(res.body.features[0].geometry.coordinates).toEqual([139.69, 35.68]);
  });

  test('antimeridian bbox returns the Fiji quakes on both sides', async () => {
    const res = await request(app).get('/api/quakes?bbox=170,-25,-170,-10');
    expect(res.status).toBe(200);
    const ids = res.body.features.map((f) => f.properties.id).sort();
    expect(ids).toEqual(['test-2', 'test-3']);
  });

  test('GET /api/quakes defaults limit and returns most recent first', async () => {
    const res = await request(app).get('/api/quakes');
    expect(res.status).toBe(200);
    expect(res.body.features).toHaveLength(10);
    const times = res.body.features.map((f) => f.properties.time);
    expect([...times].sort().reverse()).toEqual(times);
  });

  test('GET /api/analytics/summary', async () => {
    const res = await request(app).get('/api/analytics/summary');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(10);
    expect(res.body.maxMag).toBe(7.2);
    expect(res.body.withTsunami).toBe(2);
    expect(res.body.last24h).toBe(7); // test-8 is 30h old, test-9 is 30 days old
    expect(res.body.avgMag).toBeCloseTo(
      FIXTURES.reduce((s, q) => s + q.mag, 0) / 10, 1);
  });

  test('GET /api/analytics/timeseries zero-fills days', async () => {
    const res = await request(app).get('/api/analytics/timeseries?days=7');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(7);
    expect(res.body[0].date < res.body[6].date).toBe(true);
    const counts = res.body.map((d) => d.count);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(9); // everything except the 30-day-old quake
  });

  test('GET /api/analytics/magnitude-hist groups in SQL bins', async () => {
    const res = await request(app).get('/api/analytics/magnitude-hist?binsize=1');
    expect(res.status).toBe(200);
    const bins = Object.fromEntries(res.body.map((b) => [b.bin, b.count]));
    expect(bins[2]).toBe(1); // test-6 (2.9)
    expect(bins[3]).toBe(1); // test-4 (3.0)
    expect(bins[4]).toBe(3); // test-9 (4.0), test-5 (4.5), test-3 (4.8)
    expect(bins[5]).toBe(2); // test-1 (5.5), test-8 (5.1)
    expect(bins[7]).toBe(1); // test-7 (7.2)
    expect(res.body[0].bin).toBeLessThanOrEqual(res.body[res.body.length - 1].bin);
  });

  test('GET /api/analytics/depth-scatter respects minMag and limit', async () => {
    const res = await request(app).get('/api/analytics/depth-scatter?minMag=5&limit=3');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    for (const p of res.body) expect(p.mag).toBeGreaterThanOrEqual(5);
  });

  test('GET /api/heatmap returns count cells and clamps precision', async () => {
    const res = await request(app).get('/api/heatmap');
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('FeatureCollection');
    expect(res.body.features.length).toBeGreaterThan(0);
    for (const f of res.body.features) {
      expect(f.geometry.type).toBe('Point');
      expect(f.properties.count).toBeGreaterThanOrEqual(1);
    }
    const clamped = await request(app).get('/api/heatmap?precision=99&bbox=139,35,140,36');
    expect(clamped.status).toBe(200);
    expect(clamped.body.features.reduce((s, f) => s + f.properties.count, 0)).toBe(1);
  });

  test('zones create/list/quakes/delete cycle', async () => {
    const create = await request(app).post('/api/zones')
      .send({ name: 'Tokyo', lng: 139.69, lat: 35.68, radiusKm: 250 });
    expect(create.status).toBe(201);
    const zone = create.body;
    expect(zone).toMatchObject({ name: 'Tokyo', lng: 139.69, lat: 35.68, radiusKm: 250 });
    expect(zone.id).toBeGreaterThan(0);
    expect(zone.quakeCount).toBeGreaterThanOrEqual(1);

    const list = await request(app).get('/api/zones');
    expect(list.status).toBe(200);
    expect(list.body.some((z) => z.id === zone.id && z.quakeCount >= 1)).toBe(true);

    const inZone = await request(app).get(`/api/zones/${zone.id}/quakes`);
    expect(inZone.status).toBe(200);
    const ids = inZone.body.features.map((f) => f.properties.id);
    expect(ids).toContain('test-1');

    const del = await request(app).delete(`/api/zones/${zone.id}`);
    expect(del.status).toBe(204);
    const delAgain = await request(app).delete(`/api/zones/${zone.id}`);
    expect(delAgain.status).toBe(404);
    const quakesUnknown = await request(app).get(`/api/zones/${zone.id}/quakes`);
    expect(quakesUnknown.status).toBe(404);
  });

  test('POST /api/zones validates input', async () => {
    const res = await request(app).post('/api/zones').send({ name: '', lng: 0, lat: 0, radiusKm: 10 });
    expect(res.status).toBe(400);
  });

  test('POST /api/routes returns candidates and an OSRM route', async () => {
    const realFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        routes: [{
          distance: 100000,
          duration: 3600,
          geometry: { type: 'LineString', coordinates: [[139.7, 35.7], [139.69, 35.68]] },
        }],
      }),
    });
    try {
      const res = await request(app).post('/api/routes').send({ lng: 139.7, lat: 35.7, limit: 3 });
      expect(res.status).toBe(200);
      expect(res.body.candidates.length).toBeGreaterThan(0);
      expect(res.body.candidates[0]).toHaveProperty('distanceKm');
      expect(res.body.route.provider).toBe('osrm');
      expect(res.body.route.distanceKm).toBe(100);
      expect(res.body.route.durationMin).toBe(60);
    } finally {
      global.fetch = realFetch;
    }
  });

  test('unknown /api route returns 404 error shape', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });

  test('GET /live streams an SSE snapshot of recent quakes', async () => {
    const http = require('http');
    const server = app.listen(0);
    try {
      const { port } = server.address();
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('SSE snapshot timeout')), 8000);
        const req = http.get({ host: '127.0.0.1', port, path: '/live' }, (res) => {
          expect(res.headers['content-type']).toContain('text/event-stream');
          let text = '';
          res.on('data', (d) => {
            text += d.toString();
            if (text.includes('event: snapshot')) {
              clearTimeout(timer);
              expect(text).toContain('"quakes"');
              expect(text).toContain('test-1');
              req.destroy();
              resolve();
            }
          });
        });
        req.on('error', () => {});
      });
    } finally {
      await new Promise((r) => server.close(r));
    }
  }, 15000);
});
