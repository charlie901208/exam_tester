// 從阿摩線上測驗公開頁面採收「營造業甲種職業安全衛生業務主管」題庫
// 用法: node scripts/harvest.js [--phase1|--phase2]  (預設全跑，支援中斷續跑)
// 輸出: data/questions_raw.json (phase1) → data/harvest.json (phase2 含答案)
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data');
const EXAM_LIST = path.join(DATA, 'exam_list.json');
const RAW_OUT = path.join(DATA, 'questions_raw.json');
const OUT = path.join(DATA, 'harvest.json');
const LOG = path.join(DATA, 'harvest.log');

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = msg => { const line = `[${new Date().toISOString()}] ${msg}\n`; fs.appendFileSync(LOG, line); };

async function get(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) });
      if (res.ok) return await res.text();
      log(`HTTP ${res.status} ${url}`);
    } catch (e) { log(`ERR ${e.message} ${url}`); }
    await sleep(2000 * (i + 1));
  }
  return null;
}

// 從 HTML 抽出所有 JSON-LD 區塊
function jsonLdBlocks(html) {
  const out = [];
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    try { out.push(JSON.parse(m[1])); } catch { /* 忽略壞塊 */ }
  }
  return out;
}

// 解析單題文字: "601. 題幹(A)xx(B)xx(C)xx(D)xx。" 或含行內答案 "601.(B) 題幹..."
function parseQuestion(text) {
  text = text.replace(/\s+/g, ' ').trim();
  const head = text.match(/^(\d+)\s*[.、\s]\s*(?:\(([A-D])\)\s*)?([\s\S]*)$/);
  if (!head) return null;
  const seq = parseInt(head[1], 10);
  const inlineAns = head[2] || null;
  let body = head[3];
  // 依序切 (A)(B)(C)(D)
  const m = body.match(/^([\s\S]*?)\(A\)([\s\S]*?)\(B\)([\s\S]*?)\(C\)([\s\S]*?)\(D\)([\s\S]*?)。?\s*$/);
  if (!m) return { seq, inlineAns, stem: body, options: null };
  const clean = s => s.replace(/^[,，。\s]+|[,，。\s]+$/g, '');
  return {
    seq, inlineAns,
    stem: clean(m[1]),
    options: [clean(m[2]), clean(m[3]), clean(m[4]), clean(m[5])],
  };
}

// 單題頁 h1 內有未截斷的完整題文（試卷頁 JSON-LD 會截斷長題目）
function parseItemFullText(html) {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  if (!m) return null;
  const text = m[1].replace(/<br\s*\/?>/g, '').replace(/<[^>]+>/g, '').trim();
  return parseQuestion(text);
}

// 從單題頁抽答案線索：作答統計 + AI詳解
function parseItemPage(html) {
  const out = { stats: null, aiAns: null };
  const sm = html.match(/A\((\d+)\),\s*B\((\d+)\),\s*C\((\d+)\),\s*D\((\d+)\)/);
  if (sm) {
    const counts = sm.slice(1, 5).map(Number);
    const total = counts.reduce((a, b) => a + b, 0);
    if (total > 0) {
      const maxIdx = counts.indexOf(Math.max(...counts));
      out.stats = { counts, total, mode: 'ABCD'[maxIdx], ratio: counts[maxIdx] / total };
    }
  }
  // AI詳解常見句型: 「選項(B)是錯誤的，因此是正確答案」「正確答案是(B)」「答案為(B)」「正確答案：(B)」
  const patterns = [
    /正確答案[是為應：:\s]*[\(（]?([A-D])[\)）]?/,
    /選項\s*[\(（]?([A-D])[\)）]?[^。]{0,40}(?:因此是正確答案|為正確答案|是正確答案|正確)/,
    /因此[，,]?\s*(?:正確)?答案(?:是|為|應為|應選)?\s*[\(（]?([A-D])[\)）]?/,
    /答案應?[為是選：:\s]+[\(（]?([A-D])[\)）]?/,
    /故選\s*[\(（]?([A-D])[\)）]?/,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) { out.aiAns = m[1]; break; }
  }
  return out;
}

function normalize(s) {
  return s.replace(/[\s,，。.、；;:：()（）「」『』"']/g, '').toLowerCase();
}

async function phase1() {
  const exams = JSON.parse(fs.readFileSync(EXAM_LIST, 'utf8'));
  const raw = fs.existsSync(RAW_OUT) ? JSON.parse(fs.readFileSync(RAW_OUT, 'utf8')) : {};
  for (const exam of exams) {
    if (raw[exam.href]) continue; // 續跑
    const url = 'https://yamol.tw' + exam.href;
    const html = await get(url);
    if (!html) { log(`PHASE1 FAIL ${exam.title}`); continue; }
    const blocks = jsonLdBlocks(html);
    let comments = [];
    for (const b of blocks) {
      const arr = Array.isArray(b) ? b : [b];
      for (const o of arr) if (o && o.comment) comments = comments.concat(o.comment);
    }
    const qs = [];
    for (const c of comments) {
      if (!c.text) continue;
      const q = parseQuestion(c.text);
      const idm = (c.url || '').match(/-(\d+)\.htm/);
      qs.push({ ...q, rawText: c.text, itemId: idm ? idm[1] : null, itemUrl: c.url || null });
    }
    raw[exam.href] = { title: exam.title, year: exam.year, family: exam.family, url, questions: qs };
    fs.writeFileSync(RAW_OUT, JSON.stringify(raw));
    log(`PHASE1 OK ${exam.title} -> ${qs.length} 題`);
    await sleep(600);
  }
  return raw;
}

async function phase2(raw) {
  // 跨年度去重：同題幹合併年份，canonical 取最新年份的 itemId
  const byKey = new Map();
  for (const examHref of Object.keys(raw)) {
    const exam = raw[examHref];
    for (const q0 of exam.questions) {
      if (!q0 || !q0.rawText) continue;
      // 以最新解析邏輯重新解析 rawText
      const p = parseQuestion(q0.rawText);
      const q = p ? { ...q0, ...p } : q0;
      if (!q.stem) continue;
      // 截斷/無選項的題目：鍵先用題幹前80字，稍後從單題頁補全
      const key = q.options ? normalize(q.stem + q.options.join('')) : normalize(q.stem).slice(0, 80);
      const entry = byKey.get(key);
      if (entry) {
        if (!entry.years.includes(exam.year)) entry.years.push(exam.year);
        if (exam.year > entry.canonYear) {
          Object.assign(entry, { seq: q.seq, itemId: q.itemId, itemUrl: q.itemUrl, canonYear: exam.year, sourceTitle: exam.title, sourceUrl: exam.url, family: exam.family });
        }
        if (q.inlineAns && !entry.inlineAns) entry.inlineAns = q.inlineAns;
      } else {
        byKey.set(key, {
          seq: q.seq, stem: q.stem, options: q.options, inlineAns: q.inlineAns,
          itemId: q.itemId, itemUrl: q.itemUrl, years: [exam.year], canonYear: exam.year,
          sourceTitle: exam.title, sourceUrl: exam.url, family: exam.family,
        });
      }
    }
  }
  const items = [...byKey.values()];
  log(`PHASE2 去重後共 ${items.length} 題`);

  // 續跑：載入既有答案
  const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { items: [] };
  const prevAns = new Map(prev.items.filter(i => i.ansFetched).map(i => [i.itemId, i]));

  let n = 0;
  for (const it of items) {
    const p = prevAns.get(it.itemId);
    if (p) { Object.assign(it, { stats: p.stats, aiAns: p.aiAns, ansFetched: true }); continue; }
    if (!it.itemId) continue;
    const html = await get(`https://yamol.tw/item-${it.itemId}.htm`);
    if (html) {
      Object.assign(it, parseItemPage(html), { ansFetched: true });
      // 補全被截斷的題目
      if (!it.options) {
        const full = parseItemFullText(html);
        if (full && full.options) Object.assign(it, { stem: full.stem, options: full.options, inlineAns: it.inlineAns || full.inlineAns });
      }
    }
    n++;
    if (n % 20 === 0) {
      fs.writeFileSync(OUT, JSON.stringify({ items }));
      log(`PHASE2 進度 ${n} 次抓取 / ${items.length} 題`);
    }
    await sleep(400);
  }
  fs.writeFileSync(OUT, JSON.stringify({ items }, null, 1));
  log(`PHASE2 完成，共 ${items.length} 題`);
}

(async () => {
  const raw = await phase1();
  if (!process.argv.includes('--phase1')) await phase2(raw);
  log('HARVEST DONE');
})();
