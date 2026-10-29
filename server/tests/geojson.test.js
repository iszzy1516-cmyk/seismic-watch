'use strict';

const { toFeature, rowsToFeatureCollection } = require('../src/geojson');

describe('geojson helpers', () => {
  test('toFeature maps a quake row to the contract shape', () => {
    const row = {
      id: 'us7000abc',
      mag: 5.2,
      place: '10 km SE of Pahala, Hawaii',
      time: new Date('2026-10-28T14:23:01.000Z'),
      depth_km: 8.4,
      tsunami: false,
      felt: 42,
      lon: -155.5,
      lat: 19.2,
    };
    expect(toFeature(row)).toEqual({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-155.5, 19.2] },
      properties: {
        id: 'us7000abc',
        mag: 5.2,
        place: '10 km SE of Pahala, Hawaii',
        time: '2026-10-28T14:23:01.000Z',
        depthKm: 8.4,
        tsunami: false,
        felt: 42,
      },
    });
  });

  test('toFeature handles null depth/felt and string time', () => {
    const f = toFeature({
      id: 'x', mag: 3, place: 'unknown', time: '2026-10-28T14:23:01.000Z',
      depth_km: null, tsunami: true, felt: null, lon: 10, lat: -10,
    });
    expect(f.properties.depthKm).toBeNull();
    expect(f.properties.felt).toBeNull();
    expect(f.properties.tsunami).toBe(true);
  });

  test('rowsToFeatureCollection wraps rows and empty input', () => {
    expect(rowsToFeatureCollection([])).toEqual({ type: 'FeatureCollection', features: [] });
    const fc = rowsToFeatureCollection([
      { id: 'a', mag: 1, place: 'p', time: new Date(0), depth_km: 1, tsunami: false, felt: 1, lon: 0, lat: 0 },
      { id: 'b', mag: 2, place: 'q', time: new Date(0), depth_km: 2, tsunami: true, felt: null, lon: 1, lat: 1 },
    ]);
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features).toHaveLength(2);
    expect(fc.features[1].properties.id).toBe('b');
  });
});
