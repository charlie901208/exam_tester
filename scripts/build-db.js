// harvest.json → data/exam.db
// 答案判定：inlineAns(上傳文字內附答案) > 作答統計(門檻:總數>=10且比例>=0.6) > AI詳解
// 多來源不一致或無可靠來源 → needs_review=1
const fs = require('fs');
const path = require('path');
const db = require('../db');

const { items } = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'harvest.json'), 'utf8'));
const today = new Date().toISOString().slice(0, 10);

function decideAnswer(it) {
  const votes = [];
  if (it.inlineAns) votes.push({ ans: it.inlineAns, w: 'inline' });
  if (it.stats && it.stats.total >= 10 && it.stats.ratio >= 0.6) votes.push({ ans: it.stats.mode, w: 'stats' });
  if (it.aiAns) votes.push({ ans: it.aiAns, w: 'ai' });
  if (!votes.length) {
    // 分歧題後援：統計量夠大時採多數答案，但一律標記待確認
    if (it.stats && it.stats.total >= 30) return { answer: 'ABCD'.indexOf(it.stats.mode), conf: it.stats.ratio, review: 1 };
    return { answer: null, conf: 0, review: 1 };
  }
  const pick = votes[0].ans;
  const agree = votes.filter(v => v.ans === pick).length;
  const conflict = votes.some(v => v.ans !== pick);
  let conf = it.stats ? it.stats.ratio : 0.5;
  if (agree >= 2) conf = Math.max(conf, 0.9);
  return { answer: 'ABCD'.indexOf(pick), conf, review: conflict || votes.length === 1 && votes[0].w === 'ai' ? 1 : 0 };
}

// 重建會重新配發題目id，既有筆記/考試紀錄會全部錯位 → 有資料時擋下
const hasUserData = db.prepare('SELECT (SELECT COUNT(*) FROM notes)+(SELECT COUNT(*) FROM quiz_answers) c').get().c;
if (hasUserData && !process.argv.includes('--force')) {
  console.error('資料庫已有筆記或考試紀錄，重建題庫會使其錯位。確定要重建請加 --force（將一併清除筆記與考試紀錄）。');
  process.exit(1);
}
db.exec('DELETE FROM quiz_answers; DELETE FROM quiz_sessions; DELETE FROM notes; DELETE FROM questions;');
const ins = db.prepare(`INSERT INTO questions(seq, stem, options, answer, ans_confidence, needs_review, source_name, source_url, bank_years, fetched_at)
  VALUES(?,?,?,?,?,?,?,?,?,?)`);

let n = 0, noAns = 0, review = 0;
const sorted = items.filter(it => it.stem && it.options).sort((a, b) => (b.canonYear - a.canonYear) || (a.seq - b.seq));
for (const it of sorted) {
  const { answer, conf, review: r } = decideAnswer(it);
  if (answer === null) noAns++;
  if (r) review++;
  const years = [...new Set(it.years)].sort().join(',');
  ins.run(it.seq, it.stem, JSON.stringify(it.options), answer, conf, r,
    `阿摩線上測驗（${it.sourceTitle.replace(/#\d+.*$/, '').trim()}）`, it.sourceUrl, years, today);
  n++;
}
console.log(`imported=${n} noAnswer=${noAns} needsReview=${review}`);
