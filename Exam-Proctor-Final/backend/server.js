// server.js — entry point for the backend.

const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const pool = require('./db');

const examsRouter = require('./routes/exams');
const sessionsRouter = require('./routes/sessions');
const violationsRouter = require('./routes/violations');
const dashboardRouter = require('./routes/dashboard');
const activityRouter = require('./routes/activity');

const app = express();
app.use(cors());
app.use(express.json());

// Serves everything in the public/ folder (exam.html, proctor.js, etc).
// public/ lives one level up from backend/, next to it in the project root.
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/exams', examsRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/violations', violationsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/activity', activityRouter);

// Health check — visit http://localhost:3000/api/health to confirm
// the server is running AND can talk to MySQL.
app.get('/api/health', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1 + 1 AS result');
    res.json({ status: 'ok', dbConnected: true, testQuery: rows[0].result });
  } catch (err) {
    res.status(500).json({ status: 'error', dbConnected: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
