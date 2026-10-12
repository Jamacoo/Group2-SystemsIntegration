// routes/account.js — professor sign-up, login and logout.

const express = require('express');
const router = express.Router();
const pool = require('../db');
const {
  hashPassword, verifyPassword, setLoginCookie, clearLoginCookie, professorFromRequest,
  isBlocked, recordFailure, clearFailures
} = require('../auth');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/account/register   body: { name, email, password }
// Open to anyone: each professor creates their own account and only ever
// sees the exams and records under it.
router.post('/register', async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (!name || !EMAIL.test(email)) {
    return res.status(400).json({ error: 'Enter your name and a valid email address.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  try {
    const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM professors');
    const [dup] = await pool.query('SELECT id FROM professors WHERE email = ?', [email]);
    if (dup.length) return res.status(409).json({ error: 'An account with that email already exists.' });

    const [result] = await pool.query(
      'INSERT INTO professors (name, email, password_hash) VALUES (?, ?, ?)',
      [name, email, await hashPassword(password)]
    );
    // Exams created before accounts existed belong to the first professor.
    if (n === 0) {
      await pool.query('UPDATE exams SET professor_id = ? WHERE professor_id IS NULL', [result.insertId]);
    }
    setLoginCookie(req, res, result.insertId);
    res.status(201).json({ id: result.insertId, name, email });
  } catch (err) {
    console.error('Register failed:', err.message);
    res.status(500).json({ error: 'Could not create the account.' });
  }
});

// POST /api/account/login   body: { email, password }
router.post('/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (isBlocked(req.ip)) {
    return res.status(429).json({ error: 'Too many wrong attempts. Try again in 15 minutes.' });
  }
  try {
    const [rows] = await pool.query('SELECT id, name, email, password_hash FROM professors WHERE email = ?', [email]);
    const p = rows[0];
    // Always run the hash check so a wrong email takes as long as a wrong password.
    const ok = await verifyPassword(password, p ? p.password_hash : 'scrypt$AA==$AA==');
    if (!p || !ok) {
      recordFailure(req.ip);
      return res.status(401).json({ error: 'Wrong email or password.' });
    }
    clearFailures(req.ip);
    setLoginCookie(req, res, p.id);
    res.json({ id: p.id, name: p.name, email: p.email });
  } catch (err) {
    console.error('Login failed:', err.message);
    res.status(500).json({ error: 'Could not log in.' });
  }
});

// POST /api/account/logout
router.post('/logout', (req, res) => {
  clearLoginCookie(res);
  res.json({ status: 'logged out' });
});

// GET /api/account/me  -> who is logged in (401 if nobody)
router.get('/me', async (req, res) => {
  try {
    const p = await professorFromRequest(req);
    if (!p) return res.status(401).json({ error: 'Not logged in.' });
    res.json(p);
  } catch (err) {
    res.status(503).json({ error: 'Database not reachable.' });
  }
});

module.exports = router;
