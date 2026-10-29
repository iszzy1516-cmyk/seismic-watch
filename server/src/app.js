'use strict';

const express = require('express');
const { query } = require('./db');
const live = require('./live');
const quakesRouter = require('./routes/quakes');
const analyticsRouter = require('./routes/analytics');
const zonesRouter = require('./routes/zones');
const heatmapRouter = require('./routes/heatmap');
const routesRouter = require('./routes/routes');

const app = express();

app.use(express.json());

app.get('/api/health', async (req, res) => {
  try {
    const { rows } = await query('SELECT count(*)::int AS n FROM quakes');
    res.json({ status: 'ok', db: 'up', quakeCount: rows[0].n });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'down' });
  }
});

app.use('/api/quakes', quakesRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/zones', zonesRouter);
app.use('/api/heatmap', heatmapRouter);
app.use('/api/routes', routesRouter);
app.use('/live', live.router);

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
  res.status(status).json({ error: status === 500 ? 'Internal server error' : err.message });
});

module.exports = app;
