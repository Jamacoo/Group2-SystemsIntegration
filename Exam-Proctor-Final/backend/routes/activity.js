// routes/activity.js — a running log of the student's ACTIVE WINDOW during
// an exam (every switch, not just violations). Fed by the desktop monitor
// and the browser extension; read by activity.html.

const express = require('express');
const router = express.Router();
const pool = require('../db');
const { ownsSession } = require('../auth');

const cut = (v, n) => (v == null ? null : String(v).slice(0, n));

// POST /api/activity
// body: { sessionId, studentId, source, category, label, windowTitle, processName, host, occurredAt }
router.post('/', async (req, res) => {
  const { sessionId, studentId, source, category, label, windowTitle, processName, host, occurredAt } = req.body;
  if (!sessionId || !studentId || !source || !category) {
    return res.status(400).json({ error: 'sessionId, studentId, source and category are required' });
  }
  try {
    // The monitor and the extension can both report the same app —
    // don't log the same app twice in a row for one session.
    const [last] = await pool.query(
      'SELECT label FROM activity_log WHERE session_id = ? ORDER BY occurred_at DESC, id DESC LIMIT 1',
      [sessionId]
    );
    if (last.length && last[0].label === cut(label, 150)) {
      return res.status(200).json({ status: 'unchanged' });
    }
    await pool.query(
      `INSERT INTO activity_log
         (session_id, student_id, source, category, label, window_title, process_name, host, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sessionId, studentId, cut(source, 20), cut(category, 20), cut(label, 150),
        cut(windowTitle, 500), cut(processName, 100), cut(host, 255),
        occurredAt ? new Date(occurredAt) : new Date()
      ]
    );
    res.status(201).json({ status: 'logged' });
  } catch (err) {
    console.error('Error inserting activity:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/activity/live
// The most recent activity entry of every session that is still running —
// i.e. "what is each student looking at right now".
router.get('/live', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT a.*, s.exam_id
      FROM activity_log a
      JOIN (SELECT session_id, MAX(id) AS max_id FROM activity_log GROUP BY session_id) m
        ON a.id = m.max_id
      JOIN exam_sessions s ON s.id = a.session_id
      JOIN exams e ON e.id = s.exam_id AND e.professor_id = ?
      WHERE s.ended_at IS NULL
      ORDER BY a.occurred_at DESC
    `, [req.professor.id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/activity/session/:id?limit=200   newest first
router.get('/session/:id', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 200, 1000);
  try {
    if (!(await ownsSession(req.professor.id, req.params.id))) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const [rows] = await pool.query(
      'SELECT * FROM activity_log WHERE session_id = ? ORDER BY occurred_at DESC, id DESC LIMIT ?',
      [req.params.id, limit]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
