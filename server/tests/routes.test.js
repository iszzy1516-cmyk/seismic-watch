'use strict';

const request = require('supertest');

jest.mock('../src/db', () => ({ query: jest.fn() }));

const { query } = require('../src/db');
const app = require('../src/app');

const CANDIDATE_ROWS = [
  {
    id: 'us7000abc', mag: 6.1, place: 'Near the coast',
    lng: -122.9, lat: 37.1, distance_km: 210.4,
  },
  {
    id: 'us7000def', mag: 5.0, place: 'Elsewhere',
    lng: -121.0, lat: 36.5, distance_km: 95.2,
  },
];

describe('POST /api/routes', () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
    query.mockReset();
  });

  test('validates body', async () => {
    for (const body of [{}, { lng: 200, lat: 0 }, { lng: 0 }, { lng: 0, lat: 0, limit: 0 }]) {
      const res = await request(app).post('/api/routes').send(body);
      expect(res.status).toBe(400);
      expect(res.body.error).toBeTruthy();
    }
    expect(query).not.toHaveBeenCalled();
  });

  test('routes via OSRM on success', async () => {
    query.mockResolvedValue({ rows: CANDIDATE_ROWS });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        routes: [{
          distance: 312500,
          duration: 12840,
          geometry: { type: 'LineString', coordinates: [[-122.42, 37.77], [-122.9, 37.1]] },
        }],
      }),
    });

    const res = await request(app).post('/api/routes').send({ lng: -122.42, lat: 37.77, limit: 5 });
    expect(res.status).toBe(200);
    expect(res.body.candidates).toHaveLength(2);
    expect(res.body.candidates[0]).toEqual({
      id: 'us7000abc', mag: 6.1, place: 'Near the coast', distanceKm: 210.4, lng: -122.9, lat: 37.1,
    });
    expect(res.body.route).toEqual({
      provider: 'osrm',
      distanceKm: 312.5,
      durationMin: 214,
      geometry: { type: 'LineString', coordinates: [[-122.42, 37.77], [-122.9, 37.1]] },
    });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('router.project-osrm.org/route/v1/driving/-122.42,37.77;-122.9,37.1?overview=full&geometries=geojson'),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  test('falls back to a straight 2-point LineString when OSRM is unreachable', async () => {
    query.mockResolvedValue({ rows: CANDIDATE_ROWS });
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));

    const res = await request(app).post('/api/routes').send({ lng: -122.42, lat: 37.77 });
    expect(res.status).toBe(200);
    expect(res.body.route.provider).toBe('fallback');
    expect(res.body.route.durationMin).toBeNull();
    expect(res.body.route.geometry.type).toBe('LineString');
    expect(res.body.route.geometry.coordinates).toHaveLength(2);
    expect(res.body.route.geometry.coordinates[0]).toEqual([-122.42, 37.77]);
    expect(res.body.route.geometry.coordinates[1]).toEqual([-122.9, 37.1]);
    expect(typeof res.body.route.distanceKm).toBe('number');
  });

  test('falls back when OSRM returns non-200', async () => {
    query.mockResolvedValue({ rows: CANDIDATE_ROWS });
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

    const res = await request(app).post('/api/routes').send({ lng: -122.42, lat: 37.77 });
    expect(res.status).toBe(200);
    expect(res.body.route.provider).toBe('fallback');
    expect(res.body.route.geometry.coordinates).toHaveLength(2);
  });

  test('route is null when there are no candidates', async () => {
    query.mockResolvedValue({ rows: [] });
    global.fetch = jest.fn();
    const res = await request(app).post('/api/routes').send({ lng: 0, lat: 0 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ candidates: [], route: null });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
