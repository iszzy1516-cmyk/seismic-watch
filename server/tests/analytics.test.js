'use strict';

const request = require('supertest');

jest.mock('../src/db', () => ({ query: jest.fn() }));

const { query } = require('../src/db');
const app = require('../src/app');

describe('GET /api/analytics', () => {
  beforeEach(() => {
    query.mockReset();
  });

  test('summary maps the aggregate row to the contract shape', async () => {
    query.mockResolvedValue({
      rows: [{ total: 123, avg_mag: 3.4567, max_mag: 7.1, last24h: 12, with_tsunami: 3 }],
    });
    const res = await request(app).get('/api/analytics/summary');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ total: 123, avgMag: 3.46, maxMag: 7.1, last24h: 12, withTsunami: 3 });
  });

  test('summary returns nulls for an empty table', async () => {
    query.mockResolvedValue({
      rows: [{ total: 0, avg_mag: null, max_mag: null, last24h: 0, with_tsunami: 0 }],
    });
    const res = await request(app).get('/api/analytics/summary');
    expect(res.body).toEqual({ total: 0, avgMag: null, maxMag: null, last24h: 0, withTsunami: 0 });
  });

  test('magnitude-hist bins are floored to the bin lower bound', async () => {
    query.mockResolvedValue({
      rows: [
        { bin: 2.5, count: 340 },
        { bin: 3, count: 12 },
        { bin: 3.5, count: 1 },
      ],
    });
    const res = await request(app).get('/api/analytics/magnitude-hist?binsize=0.5');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { bin: 2.5, count: 340 },
      { bin: 3, count: 12 },
      { bin: 3.5, count: 1 },
    ]);
    expect(query.mock.calls[0][1]).toEqual([0.5]);
  });

  test('magnitude-hist defaults binsize to 0.5 and rejects bad values', async () => {
    query.mockResolvedValue({ rows: [] });
    await request(app).get('/api/analytics/magnitude-hist');
    expect(query.mock.calls[0][1]).toEqual([0.5]);
    expect((await request(app).get('/api/analytics/magnitude-hist?binsize=0')).status).toBe(400);
    expect((await request(app).get('/api/analytics/magnitude-hist?binsize=xx')).status).toBe(400);
  });

  test('timeseries zero-fills missing days, oldest first', async () => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayStr = today.toISOString().slice(0, 10);
    const twoAgo = new Date(today);
    twoAgo.setUTCDate(twoAgo.getUTCDate() - 2);
    const twoAgoStr = twoAgo.toISOString().slice(0, 10);

    query.mockResolvedValue({
      rows: [
        { date: todayStr, count: 5, avg_mag: 3.3333 },
        { date: twoAgoStr, count: 2, avg_mag: 4 },
      ],
    });

    const res = await request(app).get('/api/analytics/timeseries?days=3');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(res.body[0].date).toBe(twoAgoStr);
    expect(res.body[0]).toEqual({ date: twoAgoStr, count: 2, avgMag: 4 });
    expect(res.body[1]).toMatchObject({ count: 0, avgMag: null });
    expect(res.body[2]).toMatchObject({ count: 5, avgMag: 3.33 });
    expect(res.body[2].date).toBe(todayStr);
  });

  test('depth-scatter defaults and caps limit', async () => {
    query.mockResolvedValue({ rows: [{ mag: 5.2, depth_km: 8.4 }] });
    const res = await request(app).get('/api/analytics/depth-scatter');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ mag: 5.2, depthKm: 8.4 }]);
    expect(query.mock.calls[0][1]).toEqual([4.5, 2000]);
    expect((await request(app).get('/api/analytics/depth-scatter?limit=99999')).status).toBe(400);
    expect((await request(app).get('/api/analytics/depth-scatter?minMag=nope')).status).toBe(400);
  });
});
