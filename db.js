const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'data', 'exam.db'));
db.exec(`
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS questions(
  id INTEGER PRIMARY KEY,
  seq INTEGER,
  stem TEXT NOT NULL,
  options TEXT NOT NULL,          -- JSON array
  answer INTEGER,                 -- 0-3 index, NULL=待確認
  ans_confidence REAL,
  needs_review INTEGER DEFAULT 0,
  source_name TEXT,
  source_url TEXT,
  bank_years TEXT,                -- 例 "110,113"
  fetched_at TEXT
);
CREATE TABLE IF NOT EXISTS notes(
  id INTEGER PRIMARY KEY,
  question_id INTEGER NOT NULL REFERENCES questions(id),
  created_at TEXT DEFAULT (datetime('now','localtime')),
  text TEXT,
  drawing TEXT                    -- canvas PNG dataURL, 可空
);
CREATE TABLE IF NOT EXISTS quiz_sessions(
  id INTEGER PRIMARY KEY,
  taken_at TEXT DEFAULT (datetime('now','localtime')),
  total INTEGER,
  correct INTEGER
);
CREATE TABLE IF NOT EXISTS quiz_answers(
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES quiz_sessions(id),
  question_id INTEGER NOT NULL REFERENCES questions(id),
  chosen INTEGER,
  is_correct INTEGER
);
CREATE INDEX IF NOT EXISTS idx_notes_q ON notes(question_id);
CREATE INDEX IF NOT EXISTS idx_qa_q ON quiz_answers(question_id);
`);

module.exports = db;
