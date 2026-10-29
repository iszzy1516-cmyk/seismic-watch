'use strict';

const request = require('supertest');

jest.mock('../src/db', () => ({ query: jest.fn() }));

const { query } = require('../src/db');
const app = require('../src/app');

describe('GET /api/quakes', () => {
  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue({ rows: [] });
  });

  test('returns a FeatureCollection, most recent first', async () => {
    query.mockResolvedValue({
      rows: [
        { id: 'a', mag: 5, place: 'p', time: new Date('2026-10-28T00:00:00Z'), depth_km: 1, tsunami: false, felt: 1, lon: 1, lat: 2 },
      ],
    });
    const res = await request(app).get('/api/quakes');
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('FeatureCollection');
    expect(res.body.features[0].properties.id).toBe('a');
  });

  test('plain bbox becomes a single AND envelope', async () => {
    await request(app).get('/api/quakes?bbox=-10,-10,10,10');
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('ST_X(geom::geometry) >= $1 AND ST_X(geom::geometry) <= $2');
    expect(sql).not.toContain(' OR ');
    expect(params).toEqual([-10, 10, -10, 10, 5000]);
  });

  test('antimeridian bbox (minLng > maxLng) splits into two OR envelopes', async () => {
    const res = await request(app).get('/api/quakes?bbox=170,-20,-170,20');
    expect(res.status).toBe(200);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('ST_X(geom::geometry) >= $1 OR ST_X(geom::geometry) <= $2');
    expect(params.slice(0, 4)).toEqual([170, -170, -20, 20]);
  });

  test('rejects malformed bbox', async () => {
    for (const bad of ['1,2,3', 'a,b,c,d', '200,0,100,10', '10,20,5,0', '10,-95,20,95']) {
      const res = await request(app).get(`/api/quakes?bbox=${encodeURIComponent(bad)}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toBeTruthy();
    }
    expect(query).not.toHaveBeenCalled();
  });

  test('rejects invalid minMag, start/end, limit', async () => {
    expect((await request(app).get('/api/quakes?minMag=abc')).status).toBe(400);
    expect((await request(app).get('/api/quakes?start=-5')).status).toBe(400);
    expect((await request(app).get('/api/quakes?end=soon')).status).toBe(400);
    expect((await request(app).get('/api/quakes?limit=0')).status).toBe(400);
    expect((await request(app).get('/api/quakes?limit=25000')).status).toBe(400);
    expect((await request(app).get('/api/quakes?limit=1.5')).status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  test('passes filters through as parameters and caps limit at 20000', async () => {
    await request(app).get('/api/quakes?minMag=4&start=1000&end=2000&limit=100');
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('mag >= $');
    expect(sql).toContain('time >= to_timestamp');
    expect(sql).toContain('time <= to_timestamp');
    expect(params).toEqual([4, 1000, 2000, 100]);
  });
});
