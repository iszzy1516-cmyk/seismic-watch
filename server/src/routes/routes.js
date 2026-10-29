'use strict';

const express = require('express');
const { query } = require('../db');
const { parseNumber, parseOptionalNumber } = require('../params');

const router = express.Router();
const OSRM_TIMEOUT_MS = 5000;
const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

function round1(n) {
  return Math.round(n * 10) / 10;
}

async function fetchOsrmRoute(fromLng, fromLat, toLng, toLat) {
  const url = `${OSRM_BASE}/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OSRM_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`OSRM responded ${res.status}`);
    const body = await res.json();
    const r = body && body.routes && body.routes[0];
    if (!r) throw new Error('OSRM returned no routes');
    return {
      provider: 'osrm',
      distanceKm: round1(r.distance / 1000),
      durationMin: Math.round(r.duration / 60),
      geometry: r.geometry,
    };
  } finally {
    clearTimeout(timer);
  }
}

router.post('/', async (req, res, next) => {
  try {
    const body = req.body || {};
    const lng = parseNumber(body.lng, 'lng', { min: -180, max: 180 });
    const lat = parseNumber(body.lat, 'lat', { min: -90, max: 90 });
    const limit = parseOptionalNumber(body.limit, 'limit', { min: 1, max: 50, integer: true }) ?? 5;

    // Significance-ranked nearest: ST_Distance(geom, point) / (mag * mag) ASC.
    // Large nearby quakes rank above tiny ones at the same distance.
    const { rows } = await query(`
      SELECT id, mag, place, ST_X(geom::geometry) AS lng, ST_Y(geom::geometry) AS lat,
             round((ST_Distance(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) / 1000.0)::numeric, 1) AS distance_km
      FROM quakes
      WHERE mag >= 4.5
      ORDER BY ST_Distance(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) / (mag * mag) ASC
      LIMIT $3`, [lng, lat, limit]);

    const candidates = rows.map((r) => ({
      id: r.id,
      mag: Number(r.mag),
      place: r.place,
      distanceKm: Number(r.distance_km),
      lng: Number(r.lng),
      lat: Number(r.lat),
    }));

    if (candidates.length === 0) {
      return res.json({ candidates: [], route: null });
    }

    const top = candidates[0];
    let route;
    try {
      route = await fetchOsrmRoute(lng, lat, top.lng, top.lat);
    } catch (err) {
      route = {
        provider: 'fallback',
        distanceKm: top.distanceKm,
        durationMin: null,
        geometry: {
          type: 'LineString',
          coordinates: [[lng, lat], [top.lng, top.lat]],
        },
      };
    }

    res.json({ candidates, route });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
