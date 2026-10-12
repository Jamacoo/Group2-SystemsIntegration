// reset-data.js — wipes all exams, sessions, violations and activity records,
// then creates one fresh "Sample Exam". Run:  npm run reset   (in backend/)
// Professor accounts are kept.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const mysql = require('mysql2/promise');
const { getDbConfig } = require('./dbconfig');

(async () => {
  const c = getDbConfig();
  const conn = await mysql.createConnection({
    host: c.host, port: c.port, user: c.user, password: c.password,
    database: c.database, ssl: c.ssl, timezone: 'Z'
  });
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const t of ['activity_log', 'violations', 'exam_sessions', 'exams']) {
      await conn.query(`TRUNCATE TABLE ${t}`);      // also resets ids back to 1
    }
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    // The new sample exam goes to the first professor account (or to whoever signs up first).
    await conn.query('INSERT INTO exams (exam_name, form_url, professor_id) VALUES (?, ?, (SELECT MIN(id) FROM professors))', [
      'Sample Exam',
      'https://docs.google.com/forms/d/e/1FAIpQLSdOksUPuuxkmuBqNmPFnnjzLFpHiXzckApZ13KPiTfTwjINIw/viewform?embedded=true'
    ]);
    console.log('Done. Old records removed and a new Sample Exam (id 1) was created.');
  } finally {
    await conn.end();
  }
})().catch(e => { console.error('Reset failed:', e.message); process.exit(1); });
