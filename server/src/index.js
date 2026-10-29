'use strict';

const app = require('./app');
const config = require('./config');
const poller = require('./services/poller');
const { pool } = require('./db');

const server = app.listen(config.port, () => {
  console.log(`GeoViz API listening on port ${config.port}`);
});

poller.start();

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    server.close(() => {
      pool.end().finally(() => process.exit(0));
    });
  });
}
