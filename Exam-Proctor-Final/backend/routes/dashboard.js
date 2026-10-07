// routes/dashboard.js — aggregates violation data per session so the
// instructor dashboard doesn't have to compute risk scores client-side.

const express = require('express');
const router = express.Router();
const pool = require('../db');

// Weights reflect how suspicious each violation type is on its own.
// Adjust these to match how strict you want the system to be.
const RISK_WEIGHTS = {
  AI_SITE_VISITED: 8,        // from the browser extension / desktop monitor
  OTHER_APP_OPENED: 3,       // from the desktop monitor
  OTHER_SITE_VISITED: 1,     // from the extension / monitor (noisy, so low)
  EXITED_FULLSCREEN: 5,
  TAB_CLOSE_ATTEMPT: 4,
  TAB_HIDDEN: 3,
  FOCUS_LOST_POLL: 2,
  COPY_ATTEMPT: 2,
  WINDOW_BLUR: 1,
  RIGHT_CLICK_ATTEMPT: 1
};

function buildRiskCase() {
  // Builds a SQL CASE expression from the weights above so scoring
  // logic lives in one place (this file) instead of duplicated in SQL.
  const whens = Object.entries(RISK_WEIGHTS)
    .map(([type, weight]) => `WHEN v.type = '${type}' THEN ${weight}`)
    .join(' ');
  return `CASE ${whens} ELSE 1 END`;
}

// A violation this close to the LAST recorded violation in its
// session is very likely the native "your email will be recorded"
// dialog Google Forms shows on submit (which force-exits fullscreen
// and briefly steals focus) rather than genuine mid-exam cheating.
// We anchor to the session's last violation rather than ended_at,
// since ended_at only gets set once the student manually clicks
// "End Session" — a separate, often-delayed action — and stays empty
// entirely if they just close the tab instead. Adjust window as needed.
const SUBMISSION_DIALOG_WINDOW_SECONDS = 10;
const SUBMISSION_DIALOG_TYPES = ['EXITED_FULLSCREEN', 'FOCUS_LOST_POLL'];

// GET /api/dashboard/sessions
// Returns every session with its violation count and a computed risk score.
router.get('/sessions', async (req, res) => {
  try {
    const typeList = SUBMISSION_DIALOG_TYPES.map(t => `'${t}'`).join(', ');
    const [rows] = await pool.query(`
      SELECT
        s.id AS session_id,
        s.student_id,
        s.exam_id,
        e.exam_name,
        s.started_at,
        s.ended_at,
        COUNT(v.id) AS violation_count,
        COALESCE(SUM(${buildRiskCase()}), 0) AS risk_score,
        COALESCE(MAX(CASE
          WHEN v.type IN (${typeList})
           AND vmax.max_occurred_at IS NOT NULL
           AND ABS(TIMESTAMPDIFF(SECOND, v.occurred_at, vmax.max_occurred_at)) <= ${SUBMISSION_DIALOG_WINDOW_SECONDS}
          THEN 1 ELSE 0 END), 0) AS likely_submission_dialog
      FROM exam_sessions s
      LEFT JOIN violations v ON v.session_id = s.id
      LEFT JOIN exams e ON e.id = s.exam_id
      LEFT JOIN (
        SELECT session_id, MAX(occurred_at) AS max_occurred_at
        FROM violations
        GROUP BY session_id
      ) vmax ON vmax.session_id = s.id
      GROUP BY s.id
      ORDER BY risk_score DESC, s.started_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('Error building dashboard summary:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
