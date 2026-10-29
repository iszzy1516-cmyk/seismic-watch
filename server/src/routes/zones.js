'use strict';

const express = require('express');
const { query } = require('../db');
const { rowsToFeatureCollection } = require('../geojson');
const { httpError, parseNumber, parseOptionalNumber } = require('../params');

const router = express.Router();

const ZONE_SELECT = `
  SELECT z.id, z.name,
         ST_X(z.center::geometry) AS lng, ST_Y(z.center::geometry) AS lat,
         z.radius_km,
         (SELECT count(*) FROM quakes q
           WHERE ST_DWithin(q.geom, z.center, z.radius_km * 1000))::int AS quake_count
  FROM zones z`;

function toZone(row) {
  return {
    id: Number(row.id),
    name: row.name,
    lng: Number(row.lng),
    lat: Number(row.lat),
    radiusKm: Number(row.radius_km),
    quakeCount: row.quake_count,
  };
}

function validateZoneBody(body) {
  if (body === null || typeof body !== 'object') throw httpError(400, 'Body must be a JSON object');
  const { name } = body;
  if (typeof name !== 'string' || name.length < 1 || name.length > 100) {
    throw httpError(400, 'name must be a string of 1-100 characters');
  }
  const lng = parseNumber(body.lng, 'lng', { min: -180, max: 180 });
  const lat = parseNumber(body.lat, 'lat', { min: -90, max: 90 });
  const radiusKm = parseNumber(body.radiusKm, 'radiusKm', { min: 1, max: 20000 });
  return { name, lng, lat, radiusKm };
}

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(`${ZONE_SELECT} ORDER BY z.id`);
    res.json(rows.map(toZone));
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, lng, lat, radiusKm } = validateZoneBody(req.body);
    const { rows: created } = await query(`
      INSERT INTO zones (name, center, radius_km)
      VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4)
      RETURNING id`, [name, lng, lat, radiusKm]);
    const { rows } = await query(`${ZONE_SELECT} WHERE z.id = $1`, [created[0].id]);
    res.status(201).json(toZone(rows[0]));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseOptionalNumber(req.params.id, 'id', { min: 1, integer: true });
    const { rows } = await query('DELETE FROM zones WHERE id = $1 RETURNING id', [id]);
    if (rows.length === 0) throw httpError(404, `Zone ${id} not found`);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.get('/:id/quakes', async (req, res, next) => {
  try {
    const id = parseOptionalNumber(req.params.id, 'id', { min: 1, integer: true });
    const zone = await query('SELECT id FROM zones WHERE id = $1', [id]);
    if (zone.rows.length === 0) throw httpError(404, `Zone ${id} not found`);

    const { rows } = await query(`
      SELECT q.id, q.mag, q.place, q.time, q.depth_km, q.tsunami, q.felt,
             ST_X(q.geom::geometry) AS lon, ST_Y(q.geom::geometry) AS lat
      FROM quakes q
      JOIN zones z ON z.id = $1
      WHERE ST_DWithin(q.geom, z.center, z.radius_km * 1000)
      ORDER BY q.time DESC`, [id]);
    res.json(rowsToFeatureCollection(rows));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
