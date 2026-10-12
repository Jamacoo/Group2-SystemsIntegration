// routes/exams.js — lets instructors manage exams (list/add/edit/delete)
// via the admin panel, and lets the wrapper page look up which Google
// Form to embed for a given exam ID.

const express = require('express');
const router = express.Router();
const pool = require('../db');
const { ownsExam } = require('../auth');
const { normalizeFormUrl, toEmbedUrl, FormUrlError } = require('../formurl');

// GET /api/exams — the logged-in professor's exams (used by the admin panel and dashboard)
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, exam_name, form_url, created_at FROM exams WHERE professor_id = ? ORDER BY created_at DESC, id DESC',
      [req.professor.id]
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
    const exam = rows[0];
    exam.form_url = toEmbedUrl(exam.form_url) || exam.form_url;   // older saved links still work
    res.json(exam);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/exams — create a new exam
// body: { examName, formUrl }
router.post('/', async (req, res) => {
  const { examName } = req.body;
  let { formUrl } = req.body;
  if (!examName || !formUrl) {
    return res.status(400).json({ error: 'examName and formUrl are required' });
  }
  try {
    formUrl = await normalizeFormUrl(formUrl);
    const [result] = await pool.query(
      'INSERT INTO exams (exam_name, form_url, professor_id) VALUES (?, ?, ?)',
      [examName, formUrl, req.professor.id]
    );
    res.status(201).json({ id: result.insertId, exam_name: examName, form_url: formUrl });
  } catch (err) {
    if (err instanceof FormUrlError) return res.status(400).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/exams/:id — update an existing exam's name/URL
// body: { examName, formUrl }
router.put('/:id', async (req, res) => {
  const { examName } = req.body;
  let { formUrl } = req.body;
  if (!examName || !formUrl) {
    return res.status(400).json({ error: 'examName and formUrl are required' });
  }
  try {
    formUrl = await normalizeFormUrl(formUrl);
    if (!(await ownsExam(req.professor.id, req.params.id))) {
      return res.status(404).json({ error: 'Exam not found' });
    }
    await pool.query(
      'UPDATE exams SET exam_name = ?, form_url = ? WHERE id = ? AND professor_id = ?',
      [examName, formUrl, req.params.id, req.professor.id]
    );
    res.json({ status: 'updated' });
  } catch (err) {
    if (err instanceof FormUrlError) return res.status(400).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/exams/:id
// Also deletes everything recorded under this exam (sessions,
// violations, activity log), since the database won't allow an exam
// to be removed while those rows still point to it.
router.delete('/:id', async (req, res) => {
  try {
    if (!(await ownsExam(req.professor.id, req.params.id))) {
      return res.status(404).json({ error: 'Exam not found' });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
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
