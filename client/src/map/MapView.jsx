import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import { MAPBOX_TOKEN } from '../config.js';
import { api } from '../lib/api.js';
import { formatBbox, magColor, formatMagnitude, createCirclePolygon, formatTimeAgo } from '../lib/geo.js';

const EMPTY_FC = { type: 'FeatureCollection', features: [] };
const PULSE_TTL_MS = 30000;
const PRUNE_INTERVAL_MS = 2000;

function quakeRadius(mag) {
  return ['interpolate', ['linear'], ['get', 'mag'], 0, 3, 2, 4, 4, 7, 6, 11, 8, 16];
}

export default function MapView({
  minMag,
  viewMode,
  liveEvents,
  zones,
  zonePreview,
  addZoneMode,
  onZoneClick,
  onQuakeSelect,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const quakesRef = useRef(EMPTY_FC);
  const pulsesRef = useRef([]);
  const userPosRef = useRef(null);
  const popupLngLatRef = useRef(null);
  const debounceRef = useRef(null);
  const minMagRef = useRef(minMag);
  minMagRef.current = minMag;

  const [selected, setSelected] = useState(null); // {feature, x, y}
  const [routeInfo, setRouteInfo] = useState(null);
  const [quakeError, setQuakeError] = useState(null);
  const [routing, setRouting] = useState(false);

  const fetchQuakes = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const bounds = map.getBounds();
    if (!bounds) return;
    api
      .getJson('/api/quakes', { bbox: formatBbox(bounds), minMag: minMagRef.current })
      .then((fc) => {
        quakesRef.current = fc;
        const data = fc && fc.features ? fc : EMPTY_FC;
        const plain = map.getSource('quakes');
        const clustered = map.getSource('quakes-clustered');
        if (plain) plain.setData(data);
        if (clustered) clustered.setData(data);
        setQuakeError(null);
      })
      .catch((err) => setQuakeError(err.message));
  }, []);

  const scheduleFetch = useCallback(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchQuakes, 300);
  }, [fetchQuakes]);

  // init map once
  useEffect(() => {
    mapboxgl.accessToken = MAPBOX_TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-150, 20],
      zoom: 1.6,
      minZoom: 1,
    });
    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    const geolocate = new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      showUserLocation: true,
    });
    geolocate.on('geolocate', (e) => {
      userPosRef.current = { lng: e.coords.longitude, lat: e.coords.latitude };
    });
    map.addControl(geolocate, 'top-right');

    map.on('load', () => {
      map.addSource('quakes', { type: 'geojson', data: EMPTY_FC });
      map.addSource('quakes-clustered', {
        type: 'geojson',
        data: EMPTY_FC,
        cluster: true,
        clusterMaxZoom: 8,
        clusterRadius: 50,
      });
      map.addSource('zones', { type: 'geojson', data: EMPTY_FC });
      map.addSource('zone-preview', { type: 'geojson', data: EMPTY_FC });
      map.addSource('pulses', { type: 'geojson', data: EMPTY_FC });
      map.addSource('route', { type: 'geojson', data: EMPTY_FC });

      map.addLayer({
        id: 'zones-fill',
        type: 'fill',
        source: 'zones',
        paint: {
          'fill-color': '#58a6ff',
          'fill-opacity': 0.08,
        },
      });
      map.addLayer({
        id: 'zones-outline',
        type: 'line',
        source: 'zones',
        paint: {
          'line-color': '#58a6ff',
          'line-width': 1.5,
          'line-opacity': 0.6,
        },
      });
      map.addLayer({
        id: 'zone-preview-fill',
        type: 'fill',
        source: 'zone-preview',
        paint: { 'fill-color': '#3fb950', 'fill-opacity': 0.1 },
      });
      map.addLayer({
        id: 'zone-preview-outline',
        type: 'line',
        source: 'zone-preview',
        paint: { 'line-color': '#3fb950', 'line-width': 1.5, 'line-dasharray': [2, 2] },
      });

      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#bc8cff', 'line-width': 3, 'line-opacity': 0.85 },
      });

      map.addLayer({
        id: 'quake-heat',
        type: 'heatmap',
        source: 'quakes',
        maxzoom: 12,
        paint: {
          'heatmap-weight': ['interpolate', ['linear'], ['get', 'mag'], 0, 0, 3, 0.3, 6, 1],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 1, 3, 6, 18, 10, 40],
          'heatmap-opacity': 0.75,
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0, 'rgba(63,185,80,0)',
            0.25, 'rgba(63,185,80,0.4)',
            0.5, 'rgba(210,153,34,0.55)',
            0.75, 'rgba(248,81,73,0.7)',
            1, 'rgba(255,120,90,0.85)',
          ],
        },
      });
      map.addLayer({
        id: 'quake-circles',
        type: 'circle',
        source: 'quakes',
        paint: {
          'circle-radius': quakeRadius(),
          'circle-color': ['interpolate', ['linear'], ['get', 'mag'], 0, magColor(0), 3, magColor(3), 5, magColor(5), 8, '#ff785a'],
          'circle-opacity': 0.85,
          'circle-stroke-width': 1,
          'circle-stroke-color': 'rgba(255,255,255,0.25)',
        },
      });

      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'quakes-clustered',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': ['step', ['get', 'point_count'], '#2f81f7', 50, '#d29922', 100, '#f85149'],
          'circle-radius': ['step', ['get', 'point_count'], 16, 50, 24, 100, 32],
          'circle-opacity': 0.75,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': 'rgba(255,255,255,0.35)',
        },
      });
      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'quakes-clustered',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-size': 12,
        },
        paint: { 'text-color': '#ffffff' },
      });
      map.addLayer({
        id: 'unclustered-point',
        type: 'circle',
        source: 'quakes-clustered',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': quakeRadius(),
          'circle-color': ['interpolate', ['linear'], ['get', 'mag'], 0, magColor(0), 3, magColor(3), 5, magColor(5), 8, '#ff785a'],
          'circle-opacity': 0.85,
          'circle-stroke-width': 1,
          'circle-stroke-color': 'rgba(255,255,255,0.25)',
        },
      });

      map.addLayer({
        id: 'pulses',
        type: 'circle',
        source: 'pulses',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'progress'], 0, 14, 1, 4],
          'circle-color': '#ff9d5c',
          'circle-opacity': ['get', 'opacity'],
          'circle-stroke-width': 1,
          'circle-stroke-color': 'rgba(255,157,92,0.5)',
        },
      });

      fetchQuakes();
    });

    map.on('moveend', scheduleFetch);

    map.on('move', () => {
      if (!popupLngLatRef.current) return;
      const p = map.project(popupLngLatRef.current);
      setSelected((prev) => (prev ? { ...prev, x: p.x, y: p.y } : prev));
    });

    map.on('click', 'clusters', (e) => {
      const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
      if (!features.length) return;
      const clusterId = features[0].properties.cluster_id;
      map.getSource('quakes-clustered').getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err) return;
        map.easeTo({
          center: features[0].geometry.coordinates,
          zoom: Math.min(zoom, 14),
        });
      });
    });

    map.on('click', (e) => {
      if (addZoneModeRef.current) {
        onZoneClickRef.current({ lng: e.lngLat.lng, lat: e.lngLat.lat });
        return;
      }
      const layers = viewModeRef.current === 'cluster' ? ['unclustered-point', 'clusters'] : ['quake-circles'];
      const feats = map.queryRenderedFeatures(e.point, { layers });
      const feat = feats.find((f) => f.layer.id !== 'clusters');
      if (feat) {
        popupLngLatRef.current = e.lngLat;
        const p = map.project(e.lngLat);
        setSelected({ feature: feat, x: p.x, y: p.y });
        onQuakeSelectRef.current && onQuakeSelectRef.current(feat);
      } else {
        popupLngLatRef.current = null;
        setSelected(null);
        setRouteInfo(null);
      }
    });

    map.on('mouseenter', 'clusters', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'clusters', () => { map.getCanvas().style.cursor = ''; });
    map.on('mouseenter', 'unclustered-point', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'unclustered-point', () => { map.getCanvas().style.cursor = ''; });
    map.on('mouseenter', 'quake-circles', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'quake-circles', () => { map.getCanvas().style.cursor = ''; });

    const pruneTimer = setInterval(() => {
      const now = Date.now();
      pulsesRef.current = pulsesRef.current.filter((f) => now - f.properties.time < PULSE_TTL_MS);
      const source = map.getSource('pulses');
      if (source) {
        source.setData({
          type: 'FeatureCollection',
          features: pulsesRef.current.map((f) => ({
            ...f,
            properties: {
              ...f.properties,
              progress: Math.min(1, (now - f.properties.time) / PULSE_TTL_MS),
              opacity: Math.max(0, 0.9 * (1 - (now - f.properties.time) / PULSE_TTL_MS)),
            },
          })),
        });
      }
    }, PRUNE_INTERVAL_MS);

    return () => {
      clearTimeout(debounceRef.current);
      clearInterval(pruneTimer);
      popupLngLatRef.current = null;
      mapRef.current = null;
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;
  const addZoneModeRef = useRef(addZoneMode);
  addZoneModeRef.current = addZoneMode;
  const onZoneClickRef = useRef(onZoneClick);
  onZoneClickRef.current = onZoneClick;
  const onQuakeSelectRef = useRef(onQuakeSelect);
  onQuakeSelectRef.current = onQuakeSelect;

  // refetch when filter changes
  useEffect(() => {
    fetchQuakes();
  }, [minMag, fetchQuakes]);

  // view mode visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer('quake-heat')) return;
    const heat = viewMode === 'heatmap';
    map.setLayoutProperty('quake-heat', 'visibility', heat ? 'visible' : 'none');
    map.setLayoutProperty('quake-circles', 'visibility', heat ? 'visible' : 'none');
    map.setLayoutProperty('clusters', 'visibility', heat ? 'none' : 'visible');
    map.setLayoutProperty('cluster-count', 'visibility', heat ? 'none' : 'visible');
    map.setLayoutProperty('unclustered-point', 'visibility', heat ? 'none' : 'visible');
  }, [viewMode]);

  // zones + preview
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource('zones')) return;
    map.getSource('zones').setData({
      type: 'FeatureCollection',
      features: (zones || []).map((z) => {
        const f = createCirclePolygon(z.lng, z.lat, z.radiusKm, 64);
        f.properties = { id: z.id, name: z.name, radiusKm: z.radiusKm, quakeCount: z.quakeCount };
        return f;
      }),
    });
  }, [zones]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource('zone-preview')) return;
    map.getSource('zone-preview').setData(
      zonePreview && zonePreview.center
        ? createCirclePolygon(zonePreview.center.lng, zonePreview.center.lat, zonePreview.radiusKm, 64)
        : EMPTY_FC
    );
  }, [zonePreview]);

  // live pulses
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !liveEvents || !liveEvents.length) return;
    const now = Date.now();
    const latest = liveEvents[0];
    if (!latest || !latest.geometry) return;
    const time = latest.properties && latest.properties.time ? Date.parse(latest.properties.time) : now;
    pulsesRef.current = [
      {
        type: 'Feature',
        geometry: latest.geometry,
        properties: { time: Number.isNaN(time) ? now : time, progress: 0, opacity: 0.9 },
      },
      ...pulsesRef.current,
    ].slice(0, 50);
    const source = map.getSource('pulses');
    if (source) {
      source.setData({ type: 'FeatureCollection', features: pulsesRef.current });
    }
  }, [liveEvents]);

  const routeHere = async () => {
    if (!selected || routing) return;
    setRouting(true);
    try {
      const map = mapRef.current;
      const origin = userPosRef.current || (map ? { lng: map.getCenter().lng, lat: map.getCenter().lat } : null);
      if (!origin) return;
      const dest = selected.feature.geometry.coordinates;
      const res = await api.postJson('/api/routes', { lng: origin.lng, lat: origin.lat, limit: 5 });
      if (res.route && res.route.geometry && map && map.getSource('route')) {
        map.getSource('route').setData({
          type: 'Feature',
          properties: {},
          geometry: res.route.geometry,
        });
        map.fitBounds(
          [
            [Math.min(origin.lng, dest[0]), Math.min(origin.lat, dest[1])],
            [Math.max(origin.lng, dest[0]), Math.max(origin.lat, dest[1])],
          ],
          { padding: 80, maxZoom: 10 }
        );
      }
      setRouteInfo(res.route || null);
    } catch (err) {
      setRouteInfo({ error: err.message });
    } finally {
      setRouting(false);
    }
  };

  const props = selected ? selected.feature.properties || {} : {};

  return (
    <div className="map-wrap">
      <div ref={containerRef} className="map-container" />
      {quakeError && <div className="map-banner">Quake load failed: {quakeError}</div>}
      {addZoneMode && (
        <div className="map-hint">Click the map to place the zone center</div>
      )}
      {selected && (
        <div className="map-popup" style={{ left: selected.x, top: selected.y }}>
          <button className="popup-close" onClick={() => { popupLngLatRef.current = null; setSelected(null); setRouteInfo(null); }} aria-label="Close">
            &times;
          </button>
          <div className="popup-mag" style={{ color: magColor(props.mag) }}>
            {formatMagnitude(props.mag)}
          </div>
          <div className="popup-place">{props.place || 'Unknown location'}</div>
          <div className="popup-meta">
            <span>Depth {props.depthKm != null ? `${props.depthKm} km` : 'n/a'}</span>
            <span>{formatTimeAgo(props.time)} ago</span>
          </div>
          <button className="btn btn-route" onClick={routeHere} disabled={routing}>
            {routing ? 'Routing…' : 'Route here'}
          </button>
          {routeInfo && !routeInfo.error && (
            <div className="route-info">
              {routeInfo.provider} · {Math.round(routeInfo.distanceKm)} km · {Math.round(routeInfo.durationMin)} min
            </div>
          )}
          {routeInfo && routeInfo.error && <div className="route-error">{routeInfo.error}</div>}
          {!routeInfo && <div className="route-note">From your location, or map center if not shared.</div>}
        </div>
      )}
    </div>
  );
}
