// routes/exams.js — lets instructors manage exams (list/add/edit/delete)
// via the admin panel, and lets the wrapper page look up which Google
// Form to embed for a given exam ID.

const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/exams — list every exam (used by the admin panel)
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, exam_name, form_url, created_at FROM exams ORDER BY created_at DESC, id DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/exams/:id — a single exam's details (used by exam.html)
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, exam_name, form_url FROM exams WHERE id = ?',
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Exam not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/exams — create a new exam
// body: { examName, formUrl }
router.post('/', async (req, res) => {
  const { examName, formUrl } = req.body;
  if (!examName || !formUrl) {
    return res.status(400).json({ error: 'examName and formUrl are required' });
  }
  try {
    const [result] = await pool.query(
      'INSERT INTO exams (exam_name, form_url) VALUES (?, ?)',
      [examName, formUrl]
    );
    res.status(201).json({ id: result.insertId, exam_name: examName, form_url: formUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/exams/:id — update an existing exam's name/URL
// body: { examName, formUrl }
router.put('/:id', async (req, res) => {
  const { examName, formUrl } = req.body;
  if (!examName || !formUrl) {
    return res.status(400).json({ error: 'examName and formUrl are required' });
  }
  try {
    await pool.query(
      'UPDATE exams SET exam_name = ?, form_url = ? WHERE id = ?',
      [examName, formUrl, req.params.id]
    );
    res.json({ status: 'updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/exams/:id
// Also deletes everything recorded under this exam (sessions,
// violations, activity log), since the database won't allow an exam
// to be removed while those rows still point to it.
router.delete('/:id', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const examId = req.params.id;
    const [sessions] = await conn.query('SELECT id FROM exam_sessions WHERE exam_id = ?', [examId]);
    const ids = sessions.map(s => s.id);
    if (ids.length > 0) {
      await conn.query('DELETE FROM activity_log WHERE session_id IN (?)', [ids]);
      await conn.query('DELETE FROM violations WHERE session_id IN (?)', [ids]);
      await conn.query('DELETE FROM exam_sessions WHERE id IN (?)', [ids]);
    }
    await conn.query('DELETE FROM exams WHERE id = ?', [examId]);
    await conn.commit();
    res.json({ status: 'deleted' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
