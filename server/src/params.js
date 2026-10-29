'use strict';

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function parseNumber(value, name, { min = -Infinity, max = Infinity, integer = false } = {}) {
  if (value === undefined || value === null || value === '') {
    throw httpError(400, `Missing required parameter: ${name}`);
  }
  const n = Number(value);
  if (!Number.isFinite(n)) throw httpError(400, `Invalid ${name}: must be a number`);
  if (integer && !Number.isInteger(n)) throw httpError(400, `Invalid ${name}: must be an integer`);
  if (n < min || n > max) throw httpError(400, `Invalid ${name}: must be between ${min} and ${max}`);
  return n;
}

function parseOptionalNumber(value, name, opts = {}) {
  if (value === undefined || value === null || value === '') return undefined;
  return parseNumber(value, name, opts);
}

function parseBBox(raw) {
  if (typeof raw !== 'string') throw httpError(400, 'bbox must be a string: minLng,minLat,maxLng,maxLat');
  const parts = raw.split(',').map((s) => s.trim());
  if (parts.length !== 4 || parts.some((p) => p === '')) {
    throw httpError(400, 'bbox must have exactly four comma-separated numbers: minLng,minLat,maxLng,maxLat');
  }
  const [minLng, minLat, maxLng, maxLat] = parts.map(Number);
  for (const [label, v, lo, hi] of [
    ['minLng', minLng, -180, 180],
    ['maxLng', maxLng, -180, 180],
    ['minLat', minLat, -90, 90],
    ['maxLat', maxLat, -90, 90],
  ]) {
    if (!Number.isFinite(v)) throw httpError(400, `Invalid bbox: ${label} is not a number`);
    if (v < lo || v > hi) throw httpError(400, `Invalid bbox: ${label} out of range [${lo}, ${hi}]`);
  }
  if (minLat > maxLat) throw httpError(400, 'Invalid bbox: minLat must be <= maxLat');
  return { minLng, minLat, maxLng, maxLat, crossesAntimeridian: minLng > maxLng };
}

module.exports = { httpError, parseNumber, parseOptionalNumber, parseBBox };
