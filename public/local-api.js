// GitHub Pages 靜態版 API 層：攔截 /api/* 的 fetch
// 題庫讀 questions.json；筆記/手繪/考試紀錄存瀏覽器 IndexedDB
// 本檔只在 docs/（靜態版）的頁面被引用，Express 版不載入
(() => {
  const realFetch = window.fetch.bind(window);
  let dbP = null, questionsP = null;

  function openDB() {
    if (!dbP) dbP = new Promise((res, rej) => {
      const r = indexedDB.open('examdb', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore('notes', { keyPath: 'id', autoIncrement: true });
        d.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true });
        d.createObjectStore('answers', { keyPath: 'id', autoIncrement: true });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbP;
  }
  const reqP = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const getAll = async s => reqP((await openDB()).transaction(s).objectStore(s).getAll());
  const add = async (s, obj) => reqP((await openDB()).transaction(s, 'readwrite').objectStore(s).add(obj));
  const del = async (s, id) => reqP((await openDB()).transaction(s, 'readwrite').objectStore(s).delete(id));
  const clear = async s => reqP((await openDB()).transaction(s, 'readwrite').objectStore(s).clear());

  const loadQuestions = () => questionsP || (questionsP = realFetch('questions.json').then(r => r.json()));
  const now = () => new Date().toLocaleString('sv-SE');
  const wrongSet = answers => new Set(answers.filter(a => !a.correct).map(a => a.qid));

  async function handle(url, opts) {
    const method = (opts && opts.method) || 'GET';
    const body = opts && opts.body ? JSON.parse(opts.body) : {};
    const path = url.replace(/^.*\/api\//, '');
    let m;

    if (path === 'questions') {
      const [qs, notes, answers] = await Promise.all([loadQuestions(), getAll('notes'), getAll('answers')]);
      const noted = new Set(notes.map(n => n.qid)), wrong = wrongSet(answers);
      return qs.map(q => ({ ...q, noted: noted.has(q.id) ? 1 : 0, wrong: wrong.has(q.id) ? 1 : 0 }));
    }
    if (path === 'stats') {
      const [qs, notes, answers, sessions] = await Promise.all([loadQuestions(), getAll('notes'), getAll('answers'), getAll('sessions')]);
      return { questions: qs.length, notes: notes.length, wrong: wrongSet(answers).size,
               sessions: sessions.sort((a, b) => b.id - a.id).slice(0, 20) };
    }
    if ((m = path.match(/^notes\/(\d+)$/))) {
      const id = +m[1];
      if (method === 'GET') return (await getAll('notes')).filter(n => n.qid === id).sort((a, b) => b.id - a.id);
      if (method === 'POST') {
        const note = { qid: id, created_at: now(), text: body.text || null, drawing: body.drawing || null };
        note.id = await add('notes', note);
        return note;
      }
      if (method === 'DELETE') { await del('notes', id); return { ok: true }; }
    }
    if (path === 'quiz/start') {
      let pool = (await loadQuestions()).filter(q => q.answer !== null);
      if (body.scope === 'wrong') {
        const wrong = wrongSet(await getAll('answers'));
        pool = pool.filter(q => wrong.has(q.id));
      }
      const count = Math.max(1, Math.min(500, +body.count || 10));
      pool = pool.slice();
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      return pool.slice(0, count).map(q => ({ id: q.id, seq: q.seq, stem: q.stem, options: q.options, bank_years: q.bank_years }));
    }
    if ((m = path.match(/^quiz\/session\/(\d+)$/))) {
      const sid = +m[1];
      const s = (await getAll('sessions')).find(x => x.id === sid);
      if (!s) return { error: '無此紀錄' };
      const answers = (await getAll('answers')).filter(a => a.session_id === sid);
      const byId = new Map((await loadQuestions()).map(q => [q.id, q]));
      return { sessionId: s.id, takenAt: s.taken_at, total: s.total, correct: s.correct,
               results: answers.map(a => ({ ...byId.get(a.qid), chosen: a.chosen, correct: a.correct })) };
    }
    if (path === 'quiz/submit') {
      const byId = new Map((await loadQuestions()).map(q => [q.id, q]));
      const results = (body.answers || []).map(a => {
        const q = byId.get(a.id);
        return { ...q, chosen: a.chosen, correct: a.chosen !== null && a.chosen === q.answer ? 1 : 0 };
      });
      const nCorrect = results.filter(r => r.correct).length;
      const sid = await add('sessions', { taken_at: now(), total: results.length, correct: nCorrect });
      for (const r of results) await add('answers', { session_id: sid, qid: r.id, chosen: r.chosen, correct: r.correct });
      return { sessionId: sid, total: results.length, correct: nCorrect, results };
    }
    return { error: 'not found: ' + path };
  }

  window.fetch = (url, opts) => {
    if (typeof url === 'string' && url.includes('/api/')) {
      return handle(url, opts).then(data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } }));
    }
    return realFetch(url, opts);
  };

  // 首頁加上備份匯出/匯入（IndexedDB 資料會隨清除瀏覽資料而消失）
  document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('sess-body')) return;
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <h3 style="margin-top:0">資料備份</h3>
      <div class="warn" style="margin-bottom:8px">網頁版的筆記與考試紀錄存在「這台裝置的這個瀏覽器」，清除瀏覽資料會遺失，請定期匯出備份。</div>
      <button id="bk-out">匯出備份</button>
      <button class="secondary" id="bk-in-btn">匯入備份</button>
      <input type="file" id="bk-in" accept=".json" style="display:none">
      <span class="muted" id="bk-msg"></span>`;
    document.querySelector('.container').appendChild(card);

    document.getElementById('bk-out').onclick = async () => {
      const data = { notes: await getAll('notes'), sessions: await getAll('sessions'), answers: await getAll('answers') };
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
      a.download = `題庫筆記備份_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
    };
    document.getElementById('bk-in-btn').onclick = () => document.getElementById('bk-in').click();
    document.getElementById('bk-in').onchange = async e => {
      const f = e.target.files[0];
      if (!f) return;
      if (!confirm('匯入會覆蓋此瀏覽器現有的筆記與考試紀錄，確定？')) return;
      const data = JSON.parse(await f.text());
      for (const s of ['notes', 'sessions', 'answers']) {
        await clear(s);
        for (const row of data[s] || []) await add(s, row);
      }
      document.getElementById('bk-msg').textContent = '匯入完成，重新整理中…';
      location.reload();
    };
  });
})();
