const express = require('express');
const db = require('./db');

const app = express();
app.use(express.json({ limit: '10mb' })); // 手繪PNG dataURL 可能較大
app.use(express.static(require('path').join(__dirname, 'public')));

// 全部題目（本機系統，一次送出即可）
app.get('/api/questions', (req, res) => {
  const rows = db.prepare(`
    SELECT q.id, q.seq, q.stem, q.options, q.answer, q.needs_review, q.source_name, q.source_url, q.bank_years,
      EXISTS(SELECT 1 FROM notes n WHERE n.question_id=q.id) AS noted,
      EXISTS(SELECT 1 FROM quiz_answers a WHERE a.question_id=q.id AND a.is_correct=0) AS wrong
    FROM questions q ORDER BY substr(q.bank_years,-3) DESC, q.seq`).all();
  res.json(rows.map(r => ({ ...r, options: JSON.parse(r.options) })));
});

app.get('/api/stats', (req, res) => {
  res.json({
    questions: db.prepare('SELECT COUNT(*) c FROM questions').get().c,
    notes: db.prepare('SELECT COUNT(*) c FROM notes').get().c,
    wrong: db.prepare('SELECT COUNT(DISTINCT question_id) c FROM quiz_answers WHERE is_correct=0').get().c,
    sessions: db.prepare('SELECT id, taken_at, total, correct FROM quiz_sessions ORDER BY id DESC LIMIT 20').all(),
  });
});

app.get('/api/notes/:qid', (req, res) => {
  res.json(db.prepare('SELECT id, created_at, text, drawing FROM notes WHERE question_id=? ORDER BY id DESC').all(req.params.qid));
});

app.post('/api/notes/:qid', (req, res) => {
  const { text, drawing } = req.body;
  if (!text && !drawing) return res.status(400).json({ error: '筆記內容不可為空' });
  const r = db.prepare('INSERT INTO notes(question_id, text, drawing) VALUES(?,?,?)').run(req.params.qid, text || null, drawing || null);
  res.json(db.prepare('SELECT id, created_at, text, drawing FROM notes WHERE id=?').get(r.lastInsertRowid));
});

app.delete('/api/notes/:id', (req, res) => {
  db.prepare('DELETE FROM notes WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// 抽考：隨機抽 N 題（不回傳答案）
app.post('/api/quiz/start', (req, res) => {
  const count = Math.max(1, Math.min(500, parseInt(req.body.count) || 10));
  const scope = req.body.scope === 'wrong'
    ? 'WHERE q.answer IS NOT NULL AND q.id IN (SELECT question_id FROM quiz_answers WHERE is_correct=0)'
    : 'WHERE q.answer IS NOT NULL';
  const rows = db.prepare(`SELECT q.id, q.seq, q.stem, q.options, q.bank_years FROM questions q ${scope} ORDER BY RANDOM() LIMIT ?`).all(count);
  res.json(rows.map(r => ({ ...r, options: JSON.parse(r.options) })));
});

// 歷次抽考回放：還原某次考試的完整結果畫面
app.get('/api/quiz/session/:id', (req, res) => {
  const s = db.prepare('SELECT id, taken_at, total, correct FROM quiz_sessions WHERE id=?').get(req.params.id);
  if (!s) return res.status(404).json({ error: '無此紀錄' });
  const rows = db.prepare(`SELECT a.chosen, a.is_correct correct, q.id, q.seq, q.stem, q.options, q.answer, q.source_name, q.source_url, q.bank_years
    FROM quiz_answers a JOIN questions q ON q.id=a.question_id WHERE a.session_id=? ORDER BY a.id`).all(req.params.id);
  res.json({ sessionId: s.id, takenAt: s.taken_at, total: s.total, correct: s.correct,
    results: rows.map(r => ({ ...r, options: JSON.parse(r.options) })) });
});

app.post('/api/quiz/submit', (req, res) => {
  const answers = req.body.answers || []; // [{id, chosen}] chosen 可為 null(未作答)
  if (!answers.length) return res.status(400).json({ error: '無作答資料' });
  const getQ = db.prepare('SELECT id, seq, stem, options, answer, source_name, source_url, bank_years FROM questions WHERE id=?');
  const results = answers.map(a => {
    const q = getQ.get(a.id);
    const correct = a.chosen !== null && a.chosen === q.answer ? 1 : 0;
    return { ...q, options: JSON.parse(q.options), chosen: a.chosen, correct };
  });
  const nCorrect = results.filter(r => r.correct).length;
  const s = db.prepare('INSERT INTO quiz_sessions(total, correct) VALUES(?,?)').run(answers.length, nCorrect);
  const insA = db.prepare('INSERT INTO quiz_answers(session_id, question_id, chosen, is_correct) VALUES(?,?,?,?)');
  for (const r of results) insA.run(s.lastInsertRowid, r.id, r.chosen, r.correct);
  res.json({ sessionId: Number(s.lastInsertRowid), total: answers.length, correct: nCorrect, results });
});

const PORT = 3456;
app.listen(PORT, () => console.log(`題庫系統啟動: http://localhost:${PORT}`));
