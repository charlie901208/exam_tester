// 共用筆記面板：文字 + 手繪 canvas + 歷史筆記列表
// 用法: const panel = createNotePanel(containerEl, questionId)
function createNotePanel(container, qid) {
  container.innerHTML = `
    <h3 style="margin:4px 0 8px">筆記</h3>
    <textarea class="np-text" rows="4" style="width:100%" placeholder="輸入文字筆記…"></textarea>
    <div class="note-tools">
      <button type="button" class="np-pen on">畫筆</button>
      <button type="button" class="np-eraser secondary">橡皮擦</button>
      <button type="button" class="np-clear secondary">清除畫布</button>
      <span class="muted">（下方可手繪）</span>
    </div>
    <canvas class="note-canvas" height="260"></canvas>
    <div style="margin-top:8px"><button type="button" class="np-save">儲存筆記</button> <span class="np-msg muted"></span></div>
    <div class="np-history" style="margin-top:12px"></div>`;

  const canvas = container.querySelector('.note-canvas');
  const ctx = canvas.getContext('2d');
  const textEl = container.querySelector('.np-text');
  const msgEl = container.querySelector('.np-msg');
  const histEl = container.querySelector('.np-history');
  let drawing = false, dirty = false, eraser = false;

  function initCanvas() {
    canvas.width = canvas.clientWidth || 370;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    dirty = false;
  }
  requestAnimationFrame(initCanvas);

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return [p.clientX - r.left, p.clientY - r.top];
  }
  function down(e) { drawing = true; dirty = true; ctx.beginPath(); ctx.moveTo(...pos(e)); e.preventDefault(); }
  function move(e) {
    if (!drawing) return;
    ctx.strokeStyle = eraser ? '#fff' : '#223';
    ctx.lineWidth = eraser ? 18 : 2.2;
    ctx.lineTo(...pos(e)); ctx.stroke(); e.preventDefault();
  }
  function up() { drawing = false; }
  canvas.addEventListener('mousedown', down); canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
  canvas.addEventListener('touchstart', down); canvas.addEventListener('touchmove', move);
  canvas.addEventListener('touchend', up);

  const penBtn = container.querySelector('.np-pen'), erBtn = container.querySelector('.np-eraser');
  penBtn.onclick = () => { eraser = false; penBtn.classList.add('on'); erBtn.classList.remove('on'); };
  erBtn.onclick = () => { eraser = true; erBtn.classList.add('on'); penBtn.classList.remove('on'); };
  container.querySelector('.np-clear').onclick = initCanvas;

  async function loadHistory() {
    const notes = await (await fetch('/api/notes/' + qid)).json();
    histEl.innerHTML = notes.length
      ? `<h4 style="margin:4px 0">歷次筆記（${notes.length}）</h4>` + notes.map(n => `
        <div class="note-history-item" data-id="${n.id}">
          <div class="when"><span>${n.created_at}</span><span class="del">刪除</span></div>
          ${n.text ? `<div class="note-text"></div>` : ''}
          ${n.drawing ? `<img src="${n.drawing}">` : ''}
        </div>`).join('')
      : '<div class="muted">此題尚無筆記</div>';
    // text 用 textContent 塞，避免 XSS/跳脫問題
    notes.filter(n => n.text).forEach(n => {
      histEl.querySelector(`[data-id="${n.id}"] .note-text`).textContent = n.text;
    });
    histEl.querySelectorAll('.del').forEach(el => el.onclick = async () => {
      if (!confirm('確定刪除這則筆記？')) return;
      await fetch('/api/notes/' + el.closest('.note-history-item').dataset.id, { method: 'DELETE' });
      loadHistory();
      document.dispatchEvent(new CustomEvent('notes-changed', { detail: { qid } }));
    });
  }
  loadHistory();

  container.querySelector('.np-save').onclick = async () => {
    const text = textEl.value.trim();
    const drawingData = dirty ? canvas.toDataURL('image/png') : null;
    if (!text && !drawingData) { msgEl.textContent = '沒有內容可儲存'; return; }
    const res = await fetch('/api/notes/' + qid, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, drawing: drawingData }),
    });
    if (res.ok) {
      textEl.value = ''; initCanvas();
      msgEl.textContent = '已儲存 ✓'; setTimeout(() => msgEl.textContent = '', 2000);
      loadHistory();
      document.dispatchEvent(new CustomEvent('notes-changed', { detail: { qid } }));
    } else msgEl.textContent = '儲存失敗';
  };

  return { reload: loadHistory };
}
