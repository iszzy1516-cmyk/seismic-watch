'use strict';

const express = require('express');
const { query } = require('../db');
const { parseBBox, parseOptionalNumber } = require('../params');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const precision = Math.min(5, Math.max(0.1,
      parseOptionalNumber(req.query.precision, 'precision', { min: 0.0001, max: 1000 }) ?? 0.5));

    const conditions = [];
    const params = [precision];

    if (req.query.bbox !== undefined) {
      const b = parseBBox(req.query.bbox);
      params.push(b.minLng, b.maxLng, b.minLat, b.maxLat);
      const off = params.length - 4;
      const lonCond = b.crossesAntimeridian
        ? `(ST_X(geom::geometry) >= $${off + 1} OR ST_X(geom::geometry) <= $${off + 2})`
        : `(ST_X(geom::geometry) >= $${off + 1} AND ST_X(geom::geometry) <= $${off + 2})`;
      conditions.push(lonCond);
      conditions.push(`ST_Y(geom::geometry) >= $${off + 3} AND ST_Y(geom::geometry) <= $${off + 4}`);
    }

    const { rows } = await query(`
      SELECT count(*)::int AS n, ST_X(g) AS lon, ST_Y(g) AS lat
      FROM (
        SELECT ST_SnapToGrid(geom::geometry, $1) AS g
        FROM quakes
        ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
      ) t
      GROUP BY g`, params);

    res.json({
      type: 'FeatureCollection',
      features: rows.map((r) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [Number(r.lon), Number(r.lat)] },
        properties: { count: r.n },
      })),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
