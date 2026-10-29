'use strict';

const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

const pool = new Pool({ connectionString });

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
};
