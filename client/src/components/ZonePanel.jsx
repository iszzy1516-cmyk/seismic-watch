import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import { formatMagnitude } from '../lib/geo.js';

export default function ZonePanel({
  zones,
  onZonesChange,
  addZoneMode,
  onAddZoneModeChange,
  zoneCenter,
  onZoneCenterChange,
  radiusKm,
  onRadiusChange,
  zoneAlerts,
  onDismissAlert,
}) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(() => {
    api
      .getJson('/api/zones')
      .then(onZonesChange)
      .catch((err) => setError(err.message));
  }, [onZonesChange]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = async () => {
    if (!zoneCenter || saving) return;
    setSaving(true);
    setError(null);
    try {
      await api.postJson('/api/zones', {
        name: name.trim() || `Zone ${new Date().toISOString().slice(0, 16)}`,
        lng: zoneCenter.lng,
        lat: zoneCenter.lat,
        radiusKm,
      });
      setName('');
      onZoneCenterChange(null);
      onAddZoneModeChange(false);
      refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    try {
      await api.delete(`/api/zones/${id}`);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section className="zone-panel">
      <h2 className="panel-title">Zones</h2>

      {zoneAlerts.map((alert, i) => (
        <div key={`${alert.zoneId}-${i}`} className="alert-toast">
          <div className="alert-text">
            <strong>{alert.zoneName}</strong>: {formatMagnitude(alert.quake?.properties?.mag)}{' '}
            {alert.quake?.properties?.place || ''}
          </div>
          <button className="alert-dismiss" onClick={() => onDismissAlert(i)} aria-label="Dismiss">
            &times;
          </button>
        </div>
      ))}

      <button
        className={`btn toggle ${addZoneMode ? 'active' : ''}`}
        onClick={() => {
          onAddZoneModeChange(!addZoneMode);
          if (addZoneMode) onZoneCenterChange(null);
        }}
      >
        {addZoneMode ? 'Cancel' : 'Add zone'}
      </button>

      {addZoneMode && (
        <div className="zone-form">
          {!zoneCenter && <div className="zone-hint">Click the map to set the center.</div>}
          {zoneCenter && (
            <div className="zone-coord">
              Center {zoneCenter.lat.toFixed(3)}, {zoneCenter.lng.toFixed(3)}
            </div>
          )}
          <label className="field">
            <span className="filter-label">Radius {radiusKm} km</span>
            <input
              type="range"
              min="50"
              max="1000"
              step="10"
              value={radiusKm}
              onChange={(e) => onRadiusChange(Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span className="filter-label">Name</span>
            <input
              type="text"
              value={name}
              maxLength={100}
              placeholder="e.g. Tokyo"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button className="btn primary" onClick={save} disabled={saving || !zoneCenter}>
            {saving ? 'Saving…' : 'Save zone'}
          </button>
        </div>
      )}

      {error && <div className="chart-error zone-error">{error}</div>}

      <ul className="zone-list">
        {zones.length === 0 && <li className="zone-empty">No zones yet.</li>}
        {zones.map((z) => (
          <li key={z.id} className="zone-item">
            <div className="zone-info">
              <span className="zone-name">{z.name}</span>
              <span className="zone-meta">
                {z.radiusKm} km · {z.quakeCount} quake{z.quakeCount === 1 ? '' : 's'}
              </span>
            </div>
            <button className="btn danger" onClick={() => remove(z.id)}>
              Delete
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
