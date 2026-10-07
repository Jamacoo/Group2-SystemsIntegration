// routes/violations.js — the core of the proctoring system.
// The wrapper page's JS calls POST here every time it detects
// suspicious behavior (tab switch, blur, fullscreen exit, etc).

const express = require('express');
const router = express.Router();
const pool = require('../db');

// POST /api/violations
// body: { sessionId, studentId, type, occurredAt, details }
router.post('/', async (req, res) => {
  const { sessionId, studentId, type, occurredAt, details } = req.body;
  if (!sessionId || !studentId || !type) {
    return res.status(400).json({ error: 'sessionId, studentId, and type are required' });
  }
  // mysql2 only auto-formats JS Date objects for DATETIME columns —
  // a raw ISO string like "2026-09-07T09:15:00.000Z" is invalid MySQL
  // DATETIME syntax and causes every insert to fail. Convert it here.
  const occurredAtDate = occurredAt ? new Date(occurredAt) : new Date();
  try {
    await pool.query(
      'INSERT INTO violations (session_id, student_id, type, occurred_at, details) VALUES (?, ?, ?, ?, ?)',
      [sessionId, studentId, type, occurredAtDate, JSON.stringify(details || {})]
    );
    res.status(201).json({ status: 'logged' });
  } catch (err) {
    console.error('Error inserting violation:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/violations/session/:sessionId
// All violations for one specific exam attempt, in order.
router.get('/session/:sessionId', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM violations WHERE session_id = ? ORDER BY occurred_at',
      [req.params.sessionId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
