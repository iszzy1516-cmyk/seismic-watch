export default function FilterBar({ minMag, onMinMagChange, viewMode, onViewModeChange }) {
  return (
    <div className="filter-bar">
      <label className="filter-slider">
        <span className="filter-label">Min magnitude</span>
        <input
          type="range"
          min="0"
          max="7"
          step="0.1"
          value={minMag}
          onChange={(e) => onMinMagChange(Number(e.target.value))}
        />
        <span className="filter-value">{minMag.toFixed(1)}</span>
      </label>
      <div className="filter-toggle">
        <button
          className={`btn toggle ${viewMode === 'heatmap' ? 'active' : ''}`}
          onClick={() => onViewModeChange('heatmap')}
        >
          Heatmap
        </button>
        <button
          className={`btn toggle ${viewMode === 'cluster' ? 'active' : ''}`}
          onClick={() => onViewModeChange('cluster')}
        >
          Clusters
        </button>
      </div>
    </div>
  );
}
