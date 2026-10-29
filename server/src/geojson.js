'use strict';

function toFeature(row) {
  const time = row.time instanceof Date ? row.time : new Date(row.time);
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [Number(row.lon), Number(row.lat)] },
    properties: {
      id: row.id,
      mag: row.mag === null || row.mag === undefined ? null : Number(row.mag),
      place: row.place,
      time: time.toISOString(),
      depthKm: row.depth_km === null || row.depth_km === undefined ? null : Number(row.depth_km),
      tsunami: Boolean(row.tsunami),
      felt: row.felt === null || row.felt === undefined ? null : Number(row.felt),
    },
  };
}

function rowsToFeatureCollection(rows) {
  return {
    type: 'FeatureCollection',
    features: (rows || []).map(toFeature),
  };
}

module.exports = { toFeature, rowsToFeatureCollection };
