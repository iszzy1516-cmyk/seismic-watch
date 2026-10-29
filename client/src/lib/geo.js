const EARTH_RADIUS_KM = 6371;

export function formatBbox(bounds) {
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  return [sw.lng, sw.lat, ne.lng, ne.lat]
    .map((n) => Number(n.toFixed(6)))
    .join(',');
}

export function magColor(mag) {
  if (mag < 3) return '#3fb950';
  if (mag < 5) return '#d29922';
  return '#f85149';
}

export function formatMagnitude(mag) {
  if (mag === null || mag === undefined || Number.isNaN(mag)) return 'M?';
  return `M${Number(mag).toFixed(1)}`;
}

export function formatTimeAgo(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}

export function haversineKm(lng1, lat1, lng2, lat2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLng = toRad(lng2 - lng1);
  const dLat = toRad(lat2 - lat1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

export function createCirclePolygon(lng, lat, radiusKm, numPoints = 64) {
  const coords = [];
  for (let i = 0; i < numPoints; i += 1) {
    const bearing = (i / numPoints) * 360;
    coords.push(destinationPoint(lng, lat, radiusKm, bearing));
  }
  coords.push([...coords[0]]);
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [coords],
    },
  };
}

function destinationPoint(lng, lat, distanceKm, bearingDeg) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const toDeg = (rad) => (rad * 180) / Math.PI;
  const delta = distanceKm / EARTH_RADIUS_KM;
  const bearing = toRad(bearingDeg);
  const lat1 = toRad(lat);
  const lng1 = toRad(lng);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(delta) +
      Math.cos(lat1) * Math.sin(delta) * Math.cos(bearing)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(delta) * Math.cos(lat1),
      Math.cos(delta) - Math.sin(lat1) * Math.sin(lat2)
    );
  return [Number(toDeg(lng2).toFixed(6)), Number(toDeg(lat2).toFixed(6))];
}
