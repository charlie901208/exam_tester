// SQLite → 檢查版 HTML → Edge headless 轉 PDF
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const db = require('../db');

const rows = db.prepare('SELECT * FROM questions ORDER BY bank_years DESC, seq').all();
const today = new Date().toLocaleDateString('zh-TW');

const html = `<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8"><style>
body { font-family: "Microsoft JhengHei", sans-serif; font-size: 11.5px; margin: 24px; color: #111; }
h1 { font-size: 18px; } .meta { color: #555; font-size: 10.5px; margin-bottom: 16px; }
.q { margin-bottom: 10px; page-break-inside: avoid; border-bottom: 1px solid #ddd; padding-bottom: 6px; }
.stem { font-weight: bold; }
.opt { margin-left: 16px; } .opt.ans { color: #0a7a2f; font-weight: bold; }
.src { color: #666; font-size: 9.5px; margin-left: 16px; }
.warn { color: #b0621a; font-size: 10px; margin-left: 16px; }
</style></head><body>
<h1>營造業甲種職業安全衛生業務主管 題庫檢查版</h1>
<div class="meta">共 ${rows.length} 題｜匯出日期 ${today}｜
來源：阿摩線上測驗公開彙編（110年參考題型 / 112年題庫彙編 / 113年題庫電子檔113年版）。
正式結訓電腦測驗題目依法保密不公開，本檔為公開流通參考題庫之彙整；「出現年度」指該題出現於哪些年度版本之題庫。
答案由「上傳附答/多數作答統計/AI詳解」交叉判定，標示 ⚠ 者建議自行查證。</div>
${rows.map(q => {
  const opts = JSON.parse(q.options);
  return `<div class="q">
    <div class="stem">${q.seq}. ${q.stem}</div>
    ${opts.map((o, j) => `<div class="opt ${j === q.answer ? 'ans' : ''}">(${'ABCD'[j]}) ${o}${j === q.answer ? ' ✓' : ''}</div>`).join('')}
    ${q.answer === null ? '<div class="warn">⚠ 無可靠答案來源</div>' : (q.needs_review ? '<div class="warn">⚠ 答案信心較低，建議查證</div>' : '')}
    <div class="src">出現年度：${q.bank_years.split(',').map(y => y + '年').join('、')}｜來源：${q.source_name}｜${q.source_url}｜擷取日期：${q.fetched_at}</div>
  </div>`;
}).join('')}
</body></html>`;

const outDir = path.join(__dirname, '..', 'output');
const htmlPath = path.join(outDir, '題庫檢查版.html');
const pdfPath = path.join(outDir, '題庫檢查版.pdf');
fs.writeFileSync(htmlPath, html);

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
execFileSync(edge, ['--headless', '--disable-gpu', `--print-to-pdf=${pdfPath}`, '--no-pdf-header-footer', htmlPath], { timeout: 120000 });
console.log(`PDF 匯出完成: ${pdfPath} (${rows.length} 題)`);
