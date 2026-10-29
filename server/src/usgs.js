'use strict';

const RETRIES = 3;
const BASE_BACKOFF_MS = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchUsgs(url) {
  let lastErr;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`USGS HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (attempt < RETRIES) await sleep(BASE_BACKOFF_MS * 2 ** attempt);
    }
  }
  throw lastErr;
}

function parseUsgs(collection) {
  const rows = [];
  let skipped = 0;
  const features = (collection && collection.features) || [];
  for (const f of features) {
    const p = f.properties || {};
    const c = (f.geometry && f.geometry.coordinates) || [];
    const lon = c[0];
    const lat = c[1];
    const depthKm = c[2];

    if (typeof p.mag !== 'number' || !Number.isFinite(p.mag)) { skipped++; continue; }
    if (typeof lon !== 'number' || lon < -180 || lon > 180) { skipped++; continue; }
    if (typeof lat !== 'number' || lat < -90 || lat > 90) { skipped++; continue; }
    if (!p.time) { skipped++; continue; }

    rows.push({
      id: String(f.id),
      mag: p.mag,
      place: typeof p.place === 'string' && p.place.length > 0 ? p.place : 'unknown',
      time: new Date(p.time),
      depth_km: typeof depthKm === 'number' && Number.isFinite(depthKm) ? depthKm : null,
      tsunami: Boolean(p.tsunami),
      felt: Number.isInteger(p.felt) ? p.felt : null,
      lon,
      lat,
    });
  }
  return { rows, skipped };
}

module.exports = { fetchUsgs, parseUsgs };
