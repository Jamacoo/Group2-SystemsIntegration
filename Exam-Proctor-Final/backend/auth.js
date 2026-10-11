// auth.js — asks for the instructor password on admin pages and admin
// API routes. Student pages and student API routes stay open.

const crypto = require('crypto');

// Limits password guessing: after too many wrong passwords from one
// address, that address is blocked for a while.
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

// Returns true for anything only the instructor should see or change.
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
  // logging violations, extension download) is for students.
  return false;
}

function checkAdmin(req, res, next) {
  if (!needsAdmin(req)) return next();

  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    return res.status(503).send('ADMIN_PASSWORD is not set in the settings file.');
  }

  if (isBlocked(req.ip)) {
    return res.status(429).send('Too many wrong passwords. Try again in 15 minutes.');
  }

  const header = req.headers.authorization || '';
  if (header.startsWith('Basic ')) {
    // The browser sends "username:password" — the username is ignored.
    const decoded = Buffer.from(header.slice(6), 'base64').toString();
    const given = Buffer.from(decoded.slice(decoded.indexOf(':') + 1));
    const expected = Buffer.from(password);
    if (given.length === expected.length && crypto.timingSafeEqual(given, expected)) {
      failures.delete(req.ip);
      return next();
    }
    recordFailure(req.ip);
  }

  res.set('WWW-Authenticate', 'Basic realm="TestGuard instructor"');
  res.status(401).send('Instructor password required.');
}

module.exports = { checkAdmin, needsAdmin };
