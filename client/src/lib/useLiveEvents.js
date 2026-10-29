import { useEffect, useRef, useState, useCallback } from 'react';

const MAX_EVENTS = 50;

export function useLiveEvents() {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState([]);
  const [zoneAlerts, setZoneAlerts] = useState([]);
  const sourceRef = useRef(null);

  useEffect(() => {
    const source = new EventSource('/live');
    sourceRef.current = source;

    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);

    source.addEventListener('snapshot', (e) => {
      try {
        const data = JSON.parse(e.data);
        const quakes = Array.isArray(data.quakes) ? data.quakes : [];
        setEvents(quakes.slice(0, MAX_EVENTS));
      } catch {
        // ignore malformed payload
      }
    });

    source.addEventListener('quake', (e) => {
      try {
        const feature = JSON.parse(e.data);
        setEvents((prev) => [feature, ...prev].slice(0, MAX_EVENTS));
      } catch {
        // ignore malformed payload
      }
    });

    source.addEventListener('zone-alert', (e) => {
      try {
        const alert = JSON.parse(e.data);
        setZoneAlerts((prev) => [...prev, alert]);
      } catch {
        // ignore malformed payload
      }
    });

    return () => {
      source.close();
      sourceRef.current = null;
      setConnected(false);
    };
  }, []);

  const dismissAlert = useCallback((index) => {
    setZoneAlerts((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return { connected, events, zoneAlerts, dismissAlert };
}
