// auth.js — professor accounts. Each professor logs in with an email and
// password and only ever sees their own exams and the records under them.
// Students never log in: the exam page and its API calls stay open.

const crypto = require('crypto');
const pool = require('./db');

const COOKIE = 'tg_session';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;   // stay logged in for a week

// ---------- Limits password guessing ----------
const MAX_FAILURES = 10;
const BLOCK_MS = 15 * 60 * 1000;
const failures = new Map(); // address -> { count, first }

function isBlocked(ip) {
  const entry = failures.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.first > BLOCK_MS) {
    failures.delete(ip);
    return false;
  }
  return entry.count >= MAX_FAILURES;
}

function recordFailure(ip) {
  const entry = failures.get(ip);
  if (!entry || Date.now() - entry.first > BLOCK_MS) {
    failures.set(ip, { count: 1, first: Date.now() });
  } else {
    entry.count++;
  }
}

function clearFailures(ip) { failures.delete(ip); }

// ---------- Passwords (scrypt, built into Node — nothing to install) ----------
function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(password, salt, 64, (err, key) => {
      if (err) return reject(err);
      resolve(`scrypt$${salt.toString('base64')}$${key.toString('base64')}`);
    });
  });
}

function verifyPassword(password, stored) {
  return new Promise((resolve) => {
    const parts = String(stored || '').split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') return resolve(false);
    const salt = Buffer.from(parts[1], 'base64');
    const expected = Buffer.from(parts[2], 'base64');
    crypto.scrypt(password, salt, expected.length, (err, key) => {
      resolve(!err && key.length === expected.length && crypto.timingSafeEqual(key, expected));
    });
  });
}

// ---------- Login cookie (signed, so it can't be forged) ----------
// SESSION_SECRET is best. Without it we fall back to a private setting that
// never changes between restarts (the database password), and finally to a
// random key (everyone is logged out whenever the server restarts).
const randomFallback = crypto.randomBytes(32);
function secretKey() {
  const s = process.env.SESSION_SECRET || process.env.DB_URL || process.env.DB_PASSWORD;
  return s ? crypto.createHash('sha256').update('testguard-session:' + s).digest() : randomFallback;
}

function sign(text) {
  return crypto.createHmac('sha256', secretKey()).update(text).digest('base64url');
}

function makeToken(professorId) {
  const payload = Buffer.from(JSON.stringify({ p: professorId, e: Date.now() + SESSION_MS })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function readToken(token) {
  const [payload, sig] = String(token || '').split('.');
  if (!payload || !sig) return null;
  const good = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (good.length !== given.length || !crypto.timingSafeEqual(good, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.e > Date.now() ? data.p : null;
  } catch (err) {
    return null;
  }
}

function getCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function setLoginCookie(req, res, professorId) {
  const secure = req.secure ? '; Secure' : '';
  res.append('Set-Cookie',
    `${COOKIE}=${encodeURIComponent(makeToken(professorId))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MS / 1000}${secure}`);
}

function clearLoginCookie(res) {
  res.append('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

// Looks up the logged-in professor for this request (or null).
async function professorFromRequest(req) {
  const id = readToken(getCookie(req, COOKIE));
  if (!id) return null;
  const [rows] = await pool.query('SELECT id, name, email FROM professors WHERE id = ?', [id]);
  return rows[0] || null;
}

// ---------- Which pages / API routes need a professor ----------
function needsAdmin(req) {
  const p = req.path;
  const method = req.method;

  // Instructor pages
  if (p === '/admin.html' || p === '/dashboard.html' || p === '/activity.html' || p === '/guide.html') return true;

  // Instructor API routes
  if (p === '/api/server-info') return true;
  if (p.startsWith('/api/dashboard')) return true;
  if (p === '/api/exams' || p === '/api/exams/') return true;            // list, create
  if (p.startsWith('/api/exams/') && method !== 'GET') return true;      // edit, delete
  if (p.startsWith('/api/violations/session')) return true;
  if (p.startsWith('/api/activity/live') || p.startsWith('/api/activity/session')) return true;
  if (/^\/api\/sessions\/\d+\/status$/.test(p)) return true;

  // Everything else (exam page, GET one exam, starting sessions,
  // logging violations, extension download, login) is open.
  return false;
}

async function checkAdmin(req, res, next) {
  if (!needsAdmin(req)) return next();
  try {
    const professor = await professorFromRequest(req);
    if (professor) {
      req.professor = professor;
      return next();
    }
  } catch (err) {
    return res.status(503).send('Cannot reach the database right now. Try again in a moment.');
  }
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Please log in.' });
  }
  res.redirect('/login.html?next=' + encodeURIComponent(req.originalUrl));
}

// ---------- Ownership checks (one professor must never see another's data) ----------
async function ownsExam(professorId, examId) {
  const [rows] = await pool.query('SELECT 1 FROM exams WHERE id = ? AND professor_id = ?', [examId, professorId]);
  return rows.length > 0;
}

async function ownsSession(professorId, sessionId) {
  const [rows] = await pool.query(
    `SELECT 1 FROM exam_sessions s JOIN exams e ON e.id = s.exam_id
     WHERE s.id = ? AND e.professor_id = ?`, [sessionId, professorId]);
  return rows.length > 0;
}

module.exports = {
  checkAdmin, needsAdmin, ownsExam, ownsSession,
  hashPassword, verifyPassword, setLoginCookie, clearLoginCookie, professorFromRequest,
  isBlocked, recordFailure, clearFailures
};
