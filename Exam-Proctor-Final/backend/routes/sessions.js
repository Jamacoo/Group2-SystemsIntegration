// routes/sessions.js — tracks each individual exam attempt.
// A "session" starts when the student clicks Start Exam and ends
// when they submit or close the tab. Every violation gets tied to
// a session_id so you can see exactly which attempt it belongs to.

const express = require('express');
const router = express.Router();
const pool = require('../db');

// POST /api/sessions
// body: { studentId, examId }
router.post('/', async (req, res) => {
  const { studentId, examId } = req.body;
  if (!studentId || !examId) {
    return res.status(400).json({ error: 'studentId and examId are required' });
  }
  try {
    const [result] = await pool.query(
      'INSERT INTO exam_sessions (student_id, exam_id, started_at) VALUES (?, ?, ?)',
      [studentId, examId, new Date()]
    );
    res.status(201).json({ sessionId: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/sessions/:id/end
router.patch('/:id/end', async (req, res) => {
  try {
    await pool.query(
      'UPDATE exam_sessions SET ended_at = ? WHERE id = ?',
      [new Date(), req.params.id]
    );
    res.json({ status: 'ended' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sessions/active/:studentId  -> newest session that hasn't ended.
// The desktop monitor uses this to find which session to report to.
router.get('/active/:studentId', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id FROM exam_sessions WHERE student_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1',
      [req.params.studentId]
    );
    if (!rows.length) return res.status(404).json({ error: 'no active session' });
    res.json({ sessionId: rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Heartbeats (kept in memory; no schema change needed) ---
// Both the browser extension and the desktop monitor ping this so the
// backend knows each is running, and so they can see each other.
const heartbeats = new Map(); // sessionId -> { extension, monitor, monitorInfo }
const ALIVE_MS = 45000;

function statusFor(sessionId) {
  const h = heartbeats.get(String(sessionId)) || {};
  const now = Date.now();
  return {
    extensionAlive: !!h.extension && now - h.extension < ALIVE_MS,
    monitorAlive: !!h.monitor && now - h.monitor < ALIVE_MS,
    monitorInfo: h.monitorInfo || null
  };
}

// POST /api/sessions/:id/heartbeat   body: { source: 'extension' | 'monitor', info? }
router.post('/:id/heartbeat', (req, res) => {
  const { source, info } = req.body;
  if (!['extension', 'monitor'].includes(source)) {
    return res.status(400).json({ error: "source must be 'extension' or 'monitor'" });
  }
  const key = String(req.params.id);
  const h = heartbeats.get(key) || {};
  h[source] = Date.now();
  if (source === 'monitor' && info) h.monitorInfo = info;
  heartbeats.set(key, h);
  res.json({ ok: true, ...statusFor(key) });
});

// GET /api/sessions/:id/status  -> is each proctoring component running? (for the dashboard)
router.get('/:id/status', (req, res) => {
  res.json(statusFor(req.params.id));
});

module.exports = router;
