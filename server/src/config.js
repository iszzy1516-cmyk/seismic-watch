'use strict';

module.exports = {
  databaseUrl: process.env.DATABASE_URL,
  port: Number(process.env.PORT || 4000),
  usgsPollIntervalMin: Number(process.env.USGS_POLL_INTERVAL_MIN || 5),
  usgsMinMag: Number(process.env.USGS_MIN_MAG || 2.5),
};
