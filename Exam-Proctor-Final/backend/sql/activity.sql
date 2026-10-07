-- Run once (MySQL Workbench / phpMyAdmin) to add the active-window log.
USE exam_proctor;

CREATE TABLE IF NOT EXISTS activity_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  student_id VARCHAR(50) NOT NULL,
  source VARCHAR(20) NOT NULL,          -- 'monitor' | 'extension'
  category VARCHAR(20) NOT NULL,        -- EXAM | AI_SITE | BROWSER | APP
  label VARCHAR(150),                   -- friendly name: "ChatGPT", "discord.exe", ...
  window_title VARCHAR(500),
  process_name VARCHAR(100),
  host VARCHAR(255),                    -- site hostname (extension only)
  occurred_at DATETIME NOT NULL,
  INDEX idx_session_time (session_id, occurred_at),
  FOREIGN KEY (session_id) REFERENCES exam_sessions(id)
);
