// setup-db.js — creates the tables on first run (safe to run every time).

const mysql = require('mysql2/promise');
const { getDbConfig } = require('./dbconfig');

const TABLES = `
  CREATE TABLE IF NOT EXISTS students (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id VARCHAR(50) NOT NULL UNIQUE,
    full_name VARCHAR(150) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS exams (
    id INT AUTO_INCREMENT PRIMARY KEY,
    exam_name VARCHAR(150) NOT NULL,
    form_url VARCHAR(500) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS exam_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id VARCHAR(50) NOT NULL,
    exam_id INT NOT NULL,
    started_at DATETIME NOT NULL,
    ended_at DATETIME NULL,
    FOREIGN KEY (exam_id) REFERENCES exams(id)
  );

  CREATE TABLE IF NOT EXISTS violations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id INT NOT NULL,
    student_id VARCHAR(50) NOT NULL,
    type VARCHAR(50) NOT NULL,
    occurred_at DATETIME NOT NULL,
    details JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES exam_sessions(id)
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id INT NOT NULL,
    student_id VARCHAR(50) NOT NULL,
    source VARCHAR(20) NOT NULL,
    category VARCHAR(20) NOT NULL,
    label VARCHAR(150),
    window_title VARCHAR(500),
    process_name VARCHAR(100),
    host VARCHAR(255),
    occurred_at DATETIME NOT NULL,
    INDEX idx_session_time (session_id, occurred_at),
    FOREIGN KEY (session_id) REFERENCES exam_sessions(id)
  );
`;

async function setupDatabase() {
  const config = getDbConfig();
  const base = {
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    ssl: config.ssl,
    timezone: 'Z',
    connectTimeout: 15000,
    multipleStatements: true
  };

  // A local MySQL may not have the database yet, so create it.
  // (A cloud service such as Aiven already comes with one.)
  if (!process.env.DB_URL) {
    const first = await mysql.createConnection(base);
    try {
      await first.query('CREATE DATABASE IF NOT EXISTS `' + config.database + '`');
    } finally {
      await first.end();
    }
  }

  const conn = await mysql.createConnection({ ...base, database: config.database });
  try {
    const [rows] = await conn.query(
      "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'exams'"
    );
    const firstRun = rows[0].n === 0;

    await conn.query(TABLES);

    // Add one sample exam on a brand-new database so there is something to test.
    if (firstRun) {
      await conn.query('INSERT INTO exams (exam_name, form_url) VALUES (?, ?)', [
        'Sample Exam',
        'https://docs.google.com/forms/d/e/REPLACE_WITH_YOUR_FORM_ID/viewform?embedded=true'
      ]);
    }
  } finally {
    await conn.end();
  }
}

module.exports = { setupDatabase };
