'use strict';

const express = require('express');
const { query } = require('../db');
const { rowsToFeatureCollection } = require('../geojson');
const { parseBBox, parseOptionalNumber } = require('../params');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { bbox, minMag, start, end, limit } = req.query;

    const conditions = [];
    const params = [];

    if (bbox !== undefined) {
      const b = parseBBox(bbox);
      params.push(b.minLng, b.maxLng, b.minLat, b.maxLat);
      const lonCond = b.crossesAntimeridian
        ? `(ST_X(geom::geometry) >= $${params.length - 3} OR ST_X(geom::geometry) <= $${params.length - 2})`
        : `(ST_X(geom::geometry) >= $${params.length - 3} AND ST_X(geom::geometry) <= $${params.length - 2})`;
      conditions.push(lonCond);
      conditions.push(`ST_Y(geom::geometry) >= $${params.length - 1} AND ST_Y(geom::geometry) <= $${params.length}`);
    }

    const mag = parseOptionalNumber(minMag, 'minMag', { min: -10, max: 10 });
    if (mag !== undefined) {
      params.push(mag);
      conditions.push(`mag >= $${params.length}`);
    }

    const startMs = parseOptionalNumber(start, 'start', { min: 0 });
    if (startMs !== undefined) {
      params.push(startMs);
      conditions.push(`time >= to_timestamp($${params.length} / 1000.0)`);
    }

    const endMs = parseOptionalNumber(end, 'end', { min: 0 });
    if (endMs !== undefined) {
      params.push(endMs);
      conditions.push(`time <= to_timestamp($${params.length} / 1000.0)`);
    }

    const lim = parseOptionalNumber(limit, 'limit', { min: 1, max: 20000, integer: true }) ?? 5000;
    params.push(lim);

    const sql = `
      SELECT id, mag, place, time, depth_km, tsunami, felt,
             ST_X(geom::geometry) AS lon, ST_Y(geom::geometry) AS lat
      FROM quakes
      ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
      ORDER BY time DESC
      LIMIT $${params.length}`;

    const { rows } = await query(sql, params);
    res.json(rowsToFeatureCollection(rows));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
