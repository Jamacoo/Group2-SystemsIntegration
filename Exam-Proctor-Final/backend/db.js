// db.js — creates a reusable MySQL connection pool.
// A pool (rather than a single connection) lets multiple requests
// (multiple students submitting violations at once) run concurrently.

const mysql = require('mysql2/promise');
require('dotenv').config();
const { getDbConfig } = require('./dbconfig');

const pool = mysql.createPool({
  ...getDbConfig(),
  // Dates are always stored and read as UTC, so the times are right no
  // matter which computer's clock or time zone the app runs on.
  timezone: 'Z',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  enableKeepAlive: true,
  connectTimeout: 15000
});

module.exports = pool;
