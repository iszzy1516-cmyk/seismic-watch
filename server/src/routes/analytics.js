'use strict';

const express = require('express');
const { query } = require('../db');
const { parseOptionalNumber } = require('../params');

const router = express.Router();

router.get('/summary', async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT count(*)::int AS total,
             avg(mag) AS avg_mag,
             max(mag) AS max_mag,
             count(*) FILTER (WHERE time >= now() - interval '24 hours')::int AS last24h,
             count(*) FILTER (WHERE tsunami)::int AS with_tsunami
      FROM quakes`);
    const r = rows[0];
    res.json({
      total: r.total,
      avgMag: r.avg_mag === null ? null : Math.round(Number(r.avg_mag) * 100) / 100,
      maxMag: r.max_mag === null ? null : Number(r.max_mag),
      last24h: r.last24h,
      withTsunami: r.with_tsunami,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/timeseries', async (req, res, next) => {
  try {
    const days = parseOptionalNumber(req.query.days, 'days', { min: 1, max: 3650, integer: true }) ?? 30;

    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - (days - 1));

    const { rows } = await query(`
      SELECT to_char(time, 'YYYY-MM-DD') AS date,
             count(*)::int AS count,
             avg(mag) AS avg_mag
      FROM quakes
      WHERE time >= $1
      GROUP BY 1
      ORDER BY 1`, [start]);

    const byDate = new Map(rows.map((r) => [r.date, r]));
    const out = [];
    for (let d = new Date(start); out.length < days; d.setUTCDate(d.getUTCDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      const hit = byDate.get(key);
      out.push({
        date: key,
        count: hit ? hit.count : 0,
        avgMag: hit && hit.avg_mag !== null ? Math.round(Number(hit.avg_mag) * 100) / 100 : null,
      });
    }
    res.json(out);
  } catch (err) {
    next(err);
  }
});

router.get('/magnitude-hist', async (req, res, next) => {
  try {
    const binsize = parseOptionalNumber(req.query.binsize, 'binsize', { min: 0.01, max: 10 }) ?? 0.5;

    const { rows } = await query(`
      SELECT floor(mag / $1) * $1 AS bin, count(*)::int AS count
      FROM quakes
      WHERE mag IS NOT NULL
      GROUP BY 1
      ORDER BY 1`, [binsize]);

    res.json(rows.map((r) => ({
      bin: Math.round(Number(r.bin) * 10000) / 10000,
      count: r.count,
    })));
  } catch (err) {
    next(err);
  }
});

router.get('/depth-scatter', async (req, res, next) => {
  try {
    const limit = parseOptionalNumber(req.query.limit, 'limit', { min: 1, max: 5000, integer: true }) ?? 2000;
    const minMag = parseOptionalNumber(req.query.minMag, 'minMag', { min: -10, max: 10 }) ?? 4.5;

    const { rows } = await query(`
      SELECT mag, depth_km
      FROM quakes
      WHERE mag >= $1
      ORDER BY time DESC
      LIMIT $2`, [minMag, limit]);

    res.json(rows.map((r) => ({
      mag: Number(r.mag),
      depthKm: r.depth_km === null ? null : Number(r.depth_km),
    })));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
