import { useState } from 'react';
import { MAPBOX_TOKEN } from './config.js';
import { useLiveEvents } from './lib/useLiveEvents.js';
import MapView from './map/MapView.jsx';
import Dashboard from './components/Dashboard.jsx';
import LiveTicker from './components/LiveTicker.jsx';
import FilterBar from './components/FilterBar.jsx';
import ZonePanel from './components/ZonePanel.jsx';

function TokenGate() {
  return (
    <div className="token-gate">
      <div className="token-card">
        <h1>Seismic Watch</h1>
        <p>A Mapbox access token is required to render the map.</p>
        <ol>
          <li>
            Copy <code>client/.env.example</code> to <code>client/.env</code> (or create it).
          </li>
          <li>
            Get a free public token from{' '}
            <a href="https://account.mapbox.com/access-tokens/" target="_blank" rel="noreferrer">
              account.mapbox.com/access-tokens
            </a>{' '}
            and set <code>VITE_MAPBOX_TOKEN=pk.your-token</code> in <code>.env</code>.
          </li>
          <li>Restart the dev server (<code>npm run dev</code>) or rebuild the Docker image.</li>
        </ol>
      </div>
    </div>
  );
}

export default function App() {
  const [minMag, setMinMag] = useState(0);
  const [viewMode, setViewMode] = useState('heatmap');
  const [zones, setZones] = useState([]);
  const [addZoneMode, setAddZoneMode] = useState(false);
  const [zoneCenter, setZoneCenter] = useState(null);
  const [zoneRadius, setZoneRadius] = useState(250);
  const { connected, events, zoneAlerts, dismissAlert } = useLiveEvents();

  if (!MAPBOX_TOKEN) return <TokenGate />;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Seismic Watch</h1>
        <div className="conn-status">
          <span className={`conn-dot ${connected ? 'on' : 'off'}`} />
          <span>{connected ? 'Live' : 'Offline'}</span>
        </div>
      </header>

      <FilterBar
        minMag={minMag}
        onMinMagChange={setMinMag}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      <main className="app-main">
        <div className="map-pane">
          <MapView
            minMag={minMag}
            viewMode={viewMode}
            liveEvents={events}
            zones={zones}
            zonePreview={
              addZoneMode && zoneCenter
                ? { center: zoneCenter, radiusKm: zoneRadius }
                : null
            }
            addZoneMode={addZoneMode}
            onZoneClick={(c) => setZoneCenter(c)}
            onQuakeSelect={() => {}}
          />
        </div>
        <aside className="sidebar">
          <ZonePanel
            zones={zones}
            onZonesChange={setZones}
            addZoneMode={addZoneMode}
            onAddZoneModeChange={setAddZoneMode}
            zoneCenter={zoneCenter}
            onZoneCenterChange={setZoneCenter}
            radiusKm={zoneRadius}
            onRadiusChange={setZoneRadius}
            zoneAlerts={zoneAlerts}
            onDismissAlert={dismissAlert}
          />
          <Dashboard />
        </aside>
      </main>

      <LiveTicker events={events} />
    </div>
  );
}
