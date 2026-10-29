'use strict';

const express = require('express');
const { query } = require('./db');
const { rowsToFeatureCollection } = require('./geojson');

const router = express.Router();
const clients = new Set();
const HEARTBEAT_MS = 25000;

function writeEvent(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function sendSnapshot(res, quakes) {
  writeEvent(res, 'snapshot', { quakes: rowsToFeatureCollection(quakes).features });
}

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch (err) {
      clients.delete(res);
    }
  }
}

router.get('/', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(': connected\n\n');
  clients.add(res);

  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch (err) {
      clearInterval(heartbeat);
      clients.delete(res);
    }
  }, HEARTBEAT_MS);

  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });

  try {
    const { rows } = await query(`
      SELECT id, mag, place, time, depth_km, tsunami, felt,
             ST_X(geom::geometry) AS lon, ST_Y(geom::geometry) AS lat
      FROM quakes
      ORDER BY time DESC
      LIMIT 20`);
    sendSnapshot(res, rows);
  } catch (err) {
    try {
      res.write(`: snapshot error: ${err.message}\n\n`);
    } catch (_) { /* client gone */ }
  }
});

module.exports = { router, broadcast, sendSnapshot, clients };
