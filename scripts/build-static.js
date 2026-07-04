// 產生 GitHub Pages 靜態版到 docs/：題庫JSON + 複製 public 頁面並注入 local-api.js
const fs = require('fs');
const path = require('path');
const db = require('../db');

const root = path.join(__dirname, '..');
const docs = path.join(root, 'docs');
fs.mkdirSync(docs, { recursive: true });

const rows = db.prepare(`SELECT id, seq, stem, options, answer, needs_review, source_name, source_url, bank_years
  FROM questions ORDER BY substr(bank_years,-3) DESC, seq`).all()
  .map(r => ({ ...r, options: JSON.parse(r.options) }));
fs.writeFileSync(path.join(docs, 'questions.json'), JSON.stringify(rows));

for (const f of fs.readdirSync(path.join(root, 'public'))) {
  let content = fs.readFileSync(path.join(root, 'public', f), 'utf8');
  if (f.endsWith('.html')) content = content.replace('</title>', '</title>\n<script src="local-api.js"></script>');
  fs.writeFileSync(path.join(docs, f), content);
}
console.log(`docs/ 產生完成：${rows.length} 題`);
