'use strict';

const request = require('supertest');

jest.mock('../src/db', () => ({ query: jest.fn() }));

const { query } = require('../src/db');
const app = require('../src/app');

describe('POST /api/zones', () => {
  beforeEach(() => {
    query.mockReset();
  });

  function validBody(overrides = {}) {
    return { name: 'Tokyo', lng: 139.69, lat: 35.68, radiusKm: 250, ...overrides };
  }

  test('creates a zone and returns 201 with the contract shape', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 7 }] })
      .mockResolvedValueOnce({
        rows: [{ id: 7, name: 'Tokyo', lng: 139.69, lat: 35.68, radius_km: 250, quake_count: 4 }],
      });
    const res = await request(app).post('/api/zones').send(validBody());
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: 7, name: 'Tokyo', lng: 139.69, lat: 35.68, radiusKm: 250, quakeCount: 4,
    });
    expect(query.mock.calls[0][1]).toEqual(['Tokyo', 139.69, 35.68, 250]);
  });

  test.each([
    ['missing name', { name: undefined }],
    ['empty name', { name: '' }],
    ['name too long', { name: 'x'.repeat(101) }],
    ['lng out of range', { lng: 181 }],
    ['lat out of range', { lat: -91 }],
    ['radiusKm too small', { radiusKm: 0 }],
    ['radiusKm too large', { radiusKm: 20001 }],
    ['non-numeric lng', { lng: 'abc' }],
  ])('rejects %s with 400', async (label, overrides) => {
    const res = await request(app).post('/api/zones').send(validBody(overrides));
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
    expect(query).not.toHaveBeenCalled();
  });

  test('rejects non-object body', async () => {
    const res = await request(app).post('/api/zones').send('"hello"');
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/zones/:id', () => {
  beforeEach(() => query.mockReset());

  test('204 on success', async () => {
    query.mockResolvedValue({ rows: [{ id: 3 }] });
    const res = await request(app).delete('/api/zones/3');
    expect(res.status).toBe(204);
  });

  test('404 when unknown id', async () => {
    query.mockResolvedValue({ rows: [] });
    const res = await request(app).delete('/api/zones/999');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeTruthy();
  });
});

describe('GET /api/zones/:id/quakes', () => {
  beforeEach(() => query.mockReset());

  test('404 when unknown id', async () => {
    query.mockResolvedValue({ rows: [] });
    const res = await request(app).get('/api/zones/999/quakes');
    expect(res.status).toBe(404);
  });

  test('returns FeatureCollection within zone radius', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({
        rows: [
          { id: 'a', mag: 5, place: 'p', time: new Date('2026-10-28T00:00:00Z'), depth_km: 1, tsunami: false, felt: null, lon: 139.7, lat: 35.7 },
        ],
      });
    const res = await request(app).get('/api/zones/1/quakes');
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('FeatureCollection');
    expect(res.body.features).toHaveLength(1);
  });
});
