'use strict';

const { query } = require('../db');
const { broadcast } = require('../live');
const { toFeature } = require('../geojson');
const { fetchUsgs, parseUsgs } = require('../usgs');
const config = require('../config');

const UPSERT_SQL = `
  INSERT INTO quakes (id, mag, place, time, depth_km, tsunami, felt, geom)
  VALUES ($1, $2, $3, $4, $5, $6, $7, ST_SetSRID(ST_MakePoint($8, $9), 4326)::geography)
  ON CONFLICT (id) DO UPDATE SET
    mag = EXCLUDED.mag,
    place = EXCLUDED.place,
    time = EXCLUDED.time,
    depth_km = EXCLUDED.depth_km,
    tsunami = EXCLUDED.tsunami,
    felt = EXCLUDED.felt,
    geom = EXCLUDED.geom`;

const ZONE_HIT_SQL = `
  SELECT z.id, z.name
  FROM zones z
  WHERE ST_DWithin(ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, z.center, z.radius_km * 1000)`;

async function pollOnce() {
  const start = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const url = 'https://earthquake.usgs.gov/fdsnws/event/1/query'
    + `?format=geojson&starttime=${start}&minmagnitude=${config.usgsMinMag}&orderby=time`;

  const collection = await fetchUsgs(url);
  const { rows, skipped } = parseUsgs(collection);
  if (rows.length === 0) return { upserted: 0, fresh: 0, skipped };

  const ids = rows.map((r) => r.id);
  const existing = new Set((await query('SELECT id FROM quakes WHERE id = ANY($1)', [ids])).rows.map((r) => r.id));

  for (const r of rows) {
    await query(UPSERT_SQL, [r.id, r.mag, r.place, r.time, r.depth_km, r.tsunami, r.felt, r.lon, r.lat]);
  }

  const fresh = rows.filter((r) => !existing.has(r.id));
  for (const r of fresh) {
    const feature = toFeature(r);
    broadcast('quake', feature);
    const { rows: hits } = await query(ZONE_HIT_SQL, [r.lon, r.lat]);
    for (const h of hits) {
      broadcast('zone-alert', { zoneId: Number(h.id), zoneName: h.name, quake: feature });
    }
  }

  return { upserted: rows.length, fresh: fresh.length, skipped };
}

function start() {
  const ms = Math.max(1, config.usgsPollIntervalMin) * 60 * 1000;
  const tick = () => {
    pollOnce()
      .then((r) => console.log(`poll: upserted=${r.upserted} fresh=${r.fresh} skipped=${r.skipped}`))
      .catch((err) => console.error('USGS poll error:', err.message));
  };
  const timer = setInterval(tick, ms);
  if (timer.unref) timer.unref();
  tick();
  return timer;
}

module.exports = { start, _pollOnceForTests: pollOnce };
