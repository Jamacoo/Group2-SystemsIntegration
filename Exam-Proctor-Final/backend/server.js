// server.js — entry point for the backend.

const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
require('dotenv').config();
const pool = require('./db');
const { checkAdmin } = require('./auth');
const { setupDatabase } = require('./setup-db');

const examsRouter = require('./routes/exams');
const sessionsRouter = require('./routes/sessions');
const violationsRouter = require('./routes/violations');
const dashboardRouter = require('./routes/dashboard');
const activityRouter = require('./routes/activity');

const app = express();

// When hosted online, the server sits behind the host's proxy. This makes
// req.ip the real visitor address (used to limit wrong-password guesses).
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());

// Instructor password for admin pages and admin API routes.
app.use(checkAdmin);

// Serves everything in the public/ folder (exam.html, proctor.js, etc).
// public/ lives one level up from backend/, next to it in the project root.
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/exams', examsRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/violations', violationsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/activity', activityRouter);

// Lists this computer's network addresses so the Admin Panel can build
// links that students on the same network can open.
app.get('/api/server-info', (req, res) => {
  const port = process.env.PORT || 3000;
  const urls = [];
  const interfaces = os.networkInterfaces();
  Object.keys(interfaces).forEach(name => {
    interfaces[name].forEach(info => {
      if (info.family === 'IPv4' && !info.internal) {
        urls.push(`http://${info.address}:${port}`);
      }
    });
  });
  res.json({ urls });
});

// Health check — visit http://localhost:3000/api/health to confirm
// the server is running AND can read the database.
app.get('/api/health', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1 + 1 AS result');
    res.json({ status: 'ok', dbConnected: true, testQuery: rows[0].result });
  } catch (err) {
    res.status(500).json({ status: 'error', dbConnected: false, error: err.message });
  }
});

// Creates the tables if needed. If the database cannot be reached yet
// (for example a free cloud database that is switched off), keep trying
// instead of crashing, so the site recovers on its own once it is back.
async function prepareDatabase() {
  const retryMs = (Number(process.env.DB_RETRY_SECONDS) || 30) * 1000;
  while (true) {
    try {
      await setupDatabase();
      console.log('Database ready.');
      return;
    } catch (err) {
      console.error('Database not ready: ' + err.message + ' — trying again soon.');
      await new Promise(resolve => setTimeout(resolve, retryMs));
    }
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// The desktop app sets up the database itself before starting this file.
// When this file runs on its own (online hosting), it does it here.
if (!process.versions.electron) {
  if (!process.env.DB_URL && !process.env.DB_HOST) {
    console.error('DB_URL is not set. Add your Aiven Service URI as the DB_URL setting.');
  }
  prepareDatabase();
}
