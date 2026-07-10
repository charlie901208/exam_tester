// 一次性還原誤刪筆記（來源：scratchpad/recovered_clean.json，由空閒頁掃描產生）
const fs = require('fs');
const db = require('../db');

const src = process.argv[2];
const clean = JSON.parse(fs.readFileSync(src, 'utf8'));
const partial = { ts: '2026-07-08 12:02:11', qid: 62, text: '立法院：負責審議、通過法律\n行政院\n…（此則筆記後段因誤刪無法完整還原）' };

const toRestore = clean
  .filter(n => !n.ts.startsWith('2026-07-05'))   // 7/5 全是開發測試筆記
  .filter(n => n.text !== '無畫布版筆記測試')     // 7/10 的測試筆記
  .concat([partial])
  .sort((a, b) => a.ts.localeCompare(b.ts));

const existing = new Set(db.prepare("SELECT created_at || '|' || text k FROM notes").all().map(r => r.k));
const maxQid = db.prepare('SELECT MAX(id) m FROM questions').get().m;
const ins = db.prepare('INSERT INTO notes(question_id, created_at, text, drawing) VALUES(?,?,?,NULL)');

let n = 0;
for (const note of toRestore) {
  if (existing.has(note.ts + '|' + note.text)) continue;
  const qid = (note.qid >= 1 && note.qid <= maxQid) ? note.qid : 1;
  if (qid !== note.qid) console.log('qid異常(掛到#1):', note.ts, note.qid);
  ins.run(qid, note.ts, note.text);
  n++;
}
db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
console.log('已還原', n, '筆');
console.log('目前筆記總數:', db.prepare('SELECT COUNT(*) c FROM notes').get().c);
console.log('依日期:', JSON.stringify(db.prepare("SELECT substr(created_at,1,10) d, COUNT(*) c FROM notes GROUP BY d").all()));
