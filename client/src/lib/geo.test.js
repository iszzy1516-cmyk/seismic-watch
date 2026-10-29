import { describe, it, expect } from 'vitest';
import {
  formatBbox,
  magColor,
  formatMagnitude,
  formatTimeAgo,
  createCirclePolygon,
  haversineKm,
} from './geo.js';

function fakeBounds(minLng, minLat, maxLng, maxLat) {
  return {
    getSouthWest: () => ({ lng: minLng, lat: minLat }),
    getNorthEast: () => ({ lng: maxLng, lat: maxLat }),
  };
}

describe('formatBbox', () => {
  it('formats bounds as minLng,minLat,maxLng,maxLat', () => {
    expect(formatBbox(fakeBounds(-122.5, 37.7, -121.5, 38.4))).toBe(
      '-122.5,37.7,-121.5,38.4'
    );
  });

  it('returns null for a world-spanning (globe projection) view', () => {
    expect(formatBbox(fakeBounds(-270, -90, 90, 90))).toBeNull();
    expect(formatBbox(fakeBounds(-400, -45, 400, 45))).toBeNull();
  });

  it('wraps longitudes beyond ±180 into range', () => {
    // Panned two world copies east: equivalent to a normal European view.
    expect(formatBbox(fakeBounds(197.6, 35.4, 204.3, 44.2))).toBe(
      '-162.4,35.4,-155.7,44.2'
    );
  });

  it('keeps dateline-spanning bounds as antimeridian (minLng > maxLng)', () => {
    expect(formatBbox(fakeBounds(170, -25, 190, -15))).toBe('170,-25,-170,-15');
  });

  it('clamps latitudes beyond ±90 from globe projection', () => {
    expect(formatBbox(fakeBounds(-10, -95, 10, 95))).toBe('-10,-90,10,90');
  });
});

describe('magColor', () => {
  it('returns green below 3', () => {
    expect(magColor(2.9)).toBe('#3fb950');
    expect(magColor(0)).toBe('#3fb950');
    expect(magColor(-1.2)).toBe('#3fb950');
  });
  it('returns orange from 3 up to 5', () => {
    expect(magColor(3)).toBe('#d29922');
    expect(magColor(4.9)).toBe('#d29922');
  });
  it('returns red at 5 and above', () => {
    expect(magColor(5)).toBe('#f85149');
    expect(magColor(7.8)).toBe('#f85149');
  });
});

describe('formatMagnitude', () => {
  it('formats one decimal', () => {
    expect(formatMagnitude(5.24)).toBe('M5.2');
  });
  it('handles null/undefined', () => {
    expect(formatMagnitude(null)).toBe('M?');
    expect(formatMagnitude(undefined)).toBe('M?');
  });
});

describe('formatTimeAgo', () => {
  const now = Date.now();
  const iso = (msAgo) => new Date(now - msAgo).toISOString();
  it('returns 5m for five minutes ago', () => {
    expect(formatTimeAgo(iso(5 * 60 * 1000))).toBe('5m');
  });
  it('returns 2h for two hours ago', () => {
    expect(formatTimeAgo(iso(2 * 60 * 60 * 1000))).toBe('2h');
  });
  it('returns just now under a minute', () => {
    expect(formatTimeAgo(iso(30 * 1000))).toBe('just now');
  });
  it('returns days for older times', () => {
    expect(formatTimeAgo(iso(3 * 24 * 60 * 60 * 1000))).toBe('3d');
  });
});

describe('createCirclePolygon', () => {
  it('produces a closed ring of numPoints+1 coordinates', () => {
    const poly = createCirclePolygon(139.69, 35.68, 250, 64);
    expect(poly.type).toBe('Feature');
    expect(poly.geometry.type).toBe('Polygon');
    const ring = poly.geometry.coordinates[0];
    expect(ring.length).toBe(65);
    expect(ring[0]).toEqual(ring[64]);
  });

  it('keeps ring points within ~1% of the requested radius', () => {
    const center = [139.69, 35.68];
    const radiusKm = 250;
    const poly = createCirclePolygon(center[0], center[1], radiusKm, 64);
    const ring = poly.geometry.coordinates[0].slice(0, 64);
    for (const [lng, lat] of ring) {
      const d = haversineKm(center[0], center[1], lng, lat);
      expect(Math.abs(d - radiusKm) / radiusKm).toBeLessThan(0.01);
    }
  });

  it('matches requested radius near the equator and at high latitude', () => {
    for (const [lng, lat, r] of [[10, 0, 100], [-70, 70, 800], [170, -40, 50]]) {
      const ring = createCirclePolygon(lng, lat, r, 64).geometry.coordinates[0];
      const d = haversineKm(lng, lat, ring[10][0], ring[10][1]);
      expect(Math.abs(d - r) / r).toBeLessThan(0.01);
    }
  });
});
