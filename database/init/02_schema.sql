CREATE TABLE IF NOT EXISTS quakes (
  id        TEXT PRIMARY KEY,
  -- Nullable: USGS occasionally lists events before a magnitude is computed.
  -- All magnitude filters exclude NULLs naturally; analytics use avg()/max().
  mag       DOUBLE PRECISION,
  place     TEXT NOT NULL DEFAULT 'unknown',
  time      TIMESTAMPTZ NOT NULL,
  depth_km  DOUBLE PRECISION,
  tsunami   BOOLEAN NOT NULL DEFAULT FALSE,
  felt      INTEGER,
  geom      GEOGRAPHY(POINT, 4326) NOT NULL
);

-- Spatial index: makes "what's inside this rectangle / near this point" cheap.
CREATE INDEX IF NOT EXISTS quakes_geom_gix ON quakes USING GIST (geom);
-- Time-ordered feeds and time-range filters.
CREATE INDEX IF NOT EXISTS quakes_time_idx ON quakes (time DESC);
-- Magnitude filters.
CREATE INDEX IF NOT EXISTS quakes_mag_idx ON quakes (mag);

CREATE TABLE IF NOT EXISTS zones (
  id        BIGSERIAL PRIMARY KEY,
  name      TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  center    GEOGRAPHY(POINT, 4326) NOT NULL,
  radius_km DOUBLE PRECISION NOT NULL CHECK (radius_km > 0 AND radius_km <= 20000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS zones_center_gix ON zones USING GIST (center);
