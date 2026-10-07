-- Exam Proctor Wrapper — Database Schema
-- Run this in MySQL Workbench / phpMyAdmin (XAMPP) to set up the database.

CREATE DATABASE IF NOT EXISTS exam_proctor;
USE exam_proctor;

-- One row per student who is registered to take exams through the system.
-- studentId is whatever identifier you want to use (student number, email, etc).
CREATE TABLE IF NOT EXISTS students (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id VARCHAR(50) NOT NULL UNIQUE,
  full_name VARCHAR(150) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- One row per exam that can be assigned (maps a Google Form URL to a name).
CREATE TABLE IF NOT EXISTS exams (
  id INT AUTO_INCREMENT PRIMARY KEY,
  exam_name VARCHAR(150) NOT NULL,
  form_url VARCHAR(500) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- One row per session — created when a student clicks "Start Exam".
CREATE TABLE IF NOT EXISTS exam_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id VARCHAR(50) NOT NULL,
  exam_id INT NOT NULL,
  started_at DATETIME NOT NULL,
  ended_at DATETIME NULL,
  FOREIGN KEY (exam_id) REFERENCES exams(id)
);

-- One row per detected violation, tied to a session.
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

-- Seed one example exam so you have something to test with right away.
-- Replace form_url with your real Google Form's embed link later.
INSERT INTO exams (exam_name, form_url)
VALUES ('Sample Exam', 'https://docs.google.com/forms/d/e/REPLACE_WITH_YOUR_FORM_ID/viewform?embedded=true');
