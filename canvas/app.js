// canvas.cukmap.com — 벽 도화지 (서버 연결판)
// 그림·물감·퀴즈·현장 질문은 cukmap 서버(/api/canvas, cukmap/map 저장소의 worker/canvas.js)에 저장된다.
// 그림 한 번 입히기 = 새로 칠한 부분만 잘라 한 장(patch)으로 올림. 벽 모습 = 그 벽의 patch를 오래된 것부터 겹친 것.
(async () => {
const $ = id => document.getElementById(id);
const toast = (t, ms = 2800) => { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), ms); };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const PAL = ['#e8552e', '#f2c230', '#2e9b5f', '#3b7dd8', '#7a55c7', '#c2456b', '#8fd0ff', '#ff9ec7', '#8a5a2b', '#ffffff', '#9aa39d', '#26392f'];
const PPM = 20; // 도화지 1m = 20px (서버와 같아야 함)
const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? '방금' : m < 60 ? m + '분 전' : m < 1440 ? Math.round(m / 60) + '시간 전' : Math.round(m / 1440) + '일 전'; };

// ---------- 서버 ----------
const Q = new URLSearchParams(location.search);
const API = Q.get('api') || 'https://cukmap.com/api/canvas';
const rand = () => [...crypto.getRandomValues(new Uint8Array(18))].map(b => b.toString(16).padStart(2, '0')).join('');
// 이 기기를 구분하는 값(가입 없음). 저장이 막힌 브라우저면 이 창을 닫을 때까지만 유지
let DEV; try { DEV = localStorage.getItem('cukcanvas.id'); if (!DEV) { DEV = rand(); localStorage.setItem('cukcanvas.id', DEV); } } catch (_) { DEV = rand(); }
let me = null, meAt = 0, RULES = { INK_MAX: 30, INK_PER_H: 6 };
async function api(path, o = {}) {
  let r; try { r = await fetch(API + path, { method: o.method || 'GET', headers: { 'x-canvas-id': DEV, ...(o.body ? { 'content-type': 'application/json' } : {}) }, body: o.body ? JSON.stringify(o.body) : undefined }); }
  catch (e) { throw new Error('서버에 닿지 못했어요. 인터넷 연결을 확인해 주세요.'); }
  let j = {}; try { j = await r.json(); } catch (_) {}
  if (j.me) setMe(j.me);
  if (!r.ok) throw Object.assign(new Error(j.error || '서버 오류가 났어요.'), { status: r.status });
  return j;
}
function setMe(m) {
  me = m; meAt = Date.now();
  for (const n of m.notices || []) if (n.kind === 'answer') toast(`현장 질문 답이 다른 사람들 답과 맞아 확정됐어요! +${n.points}점`, 4000);
  updMe();
}
// 물감은 서버에서 시간마다 차오른다. 화면에서도 같은 셈으로 보여 줌
const inkNow = () => !me ? 0 : me.ink >= RULES.INK_MAX ? me.ink : Math.min(RULES.INK_MAX, me.ink + (Date.now() - meAt) / 3600000 * RULES.INK_PER_H);
function updMe() {
  if (!me || !me.name) return;
  $('me').innerHTML = '<b></b><span id="ink"></span>'; $('me').querySelector('b').textContent = me.name;
  const ink = inkNow(), full = ink >= RULES.INK_MAX;
  $('ink').textContent = `🎨 ${ink.toFixed(1)}㎡ · ⭐ ${me.points}점`;
  $('ink').title = full ? '물감이 가득 찼어요. 퀴즈를 풀면 더 쌓을 수 있어요.' : `한 시간에 ${RULES.INK_PER_H}㎡씩 ${RULES.INK_MAX}㎡까지 차요`;
}
setInterval(updMe, 20000);

// ---------- 지도와 벽 도화지 ----------
const BLD = ['니콜스관', '학생미래인재관', '다솔관', '밤비노관', '비르투스관'];
const map = await CUKmap.create('#map', { view: '3d', focus: '니콜스관', select: false });
const SHEETS = await map.sheets({ buildings: BLD });
const byId = id => SHEETS.find(s => s.id === id);
const nameOf = s => { const same = SHEETS.filter(x => x.building === s.building), k = same.indexOf(s) + 1; return `${s.building} 벽 ${k}`; };
const sizeOf = s => { const W = Math.min(4096, Math.round(s.length * PPM)); return { W, H: Math.round(s.height * W / s.length), k: W / s.length }; };
const newCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const loadImg = url => new Promise((ok, no) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => ok(im); im.onerror = () => no(new Error('그림을 불러오지 못했어요.')); im.src = url; });

const art = new Map();      // 벽 id → { c: 겹친 그림, list: [patch], front, url }
let PATCHES = [];           // 지금 보이는 모든 patch
const known = new Set(), hiddenSet = new Set();
let lastId = 0, FEED = [], MINE = new Set();
async function paintSheet(id, add) {
  const s = byId(id); if (!s) return;
  let A = art.get(id);
  if (!A || !add) { const { W, H } = sizeOf(s); A = { c: newCanvas(W, H), list: [], front: true }; art.set(id, A); add = PATCHES.filter(p => p.sheet === id); }
  const ims = await Promise.all(add.map(p => loadImg(`${API}/patch/${p.id}.png`).catch(() => null)));
  const g = A.c.getContext('2d'); add.forEach((p, i) => { if (ims[i]) g.drawImage(ims[i], p.x, p.y); A.list.push(p); A.front = !!p.front; });
  A.url = A.c.toDataURL(); await map.sheetPaint(id, A.url, { front: A.front });
  if (cur && cur.s.id === id) drawBase();
}
async function refresh() {
  const j = await api('/state?since=' + lastId);
  RULES = j.rules; FEED = j.feed; MINE = new Set(j.mine);
  if (!j.me) updMe();
  const redo = new Set();
  for (const id of j.hidden) if (!hiddenSet.has(id)) { hiddenSet.add(id); const p = PATCHES.find(p => p.id === id); if (p) redo.add(p.sheet); }
  PATCHES = PATCHES.filter(p => !hiddenSet.has(p.id));
  const add = new Map();
  for (const p of j.patches) { lastId = Math.max(lastId, p.id); if (known.has(p.id) || hiddenSet.has(p.id) || !byId(p.sheet)) continue; known.add(p.id); PATCHES.push(p); if (!add.has(p.sheet)) add.set(p.sheet, []); add.get(p.sheet).push(p); }
  for (const id of redo) await paintSheet(id, null);
  for (const [id, list] of add) if (!redo.has(id)) await paintSheet(id, art.has(id) ? list : null);
  return j;
}

// 벽을 누르면 그 도화지로
map.on('click', e => { if (!e.sheet) { if (e.building) toast('벽을 눌러 주세요. 이번 시안은 니콜스관 일대 5개 건물의 외벽이에요.'); return; } openEditor(byId(e.sheet), e.su, e.sv); });
let blank = false;
$('blankBtn').onclick = async () => { blank = !blank; await map.showSheets(true, { blank }); $('blankBtn').classList.toggle('on', blank); };
let opT = null; $('op').oninput = () => { clearTimeout(opT); opT = setTimeout(() => map.sheetOpacity($('op').value / 100), 30); };

// ---------- 편집기 ----------
// 아래 판(bs) = 지금 벽 모습(다른 사람 그림 포함, 못 고침), 위 판(cv) = 이번에 내가 칠하는 것
const bs = $('bs'), bx = bs.getContext('2d'), cv = $('cv'), gd = $('gd'), ctx = cv.getContext('2d', { willReadFrequently: true }), gx = gd.getContext('2d'), paper = $('paper'), wrap = $('paperwrap');
let cur = null, tool = 'brush', color = PAL[0], size = 14, undo = [], redo = [], view = { s: 1, x: 0, y: 0 }, penSeen = false, showGuide = true;
$('cols').innerHTML = PAL.map(c => `<button data-c="${c}" style="background:${c}" class="${c === color ? 'on' : ''}"></button>`).join('');
$('cols').onclick = e => { const b = e.target.closest('button'); if (!b) return; color = b.dataset.c; $('pick').value = color; if (tool === 'erase') tool = 'brush'; markTools(); };
$('pick').oninput = () => { color = $('pick').value; markTools(); };
$('size').oninput = () => size = +$('size').value;
document.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => { tool = b.dataset.tool; markTools(); if (tool === 'erase') toast('지우개는 이번에 내가 칠한 것만 지워요. 남의 그림은 위에 덧그려 주세요.'); });
const markTools = () => { document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === tool)); $('cols').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.c === color)); };
$('guideBtn').onclick = () => { showGuide = !showGuide; $('guideBtn').classList.toggle('on', showGuide); gd.style.display = showGuide ? '' : 'none'; };
const opaque = () => { const d = ctx.getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 3; i < d.length; i += 16) if (d[i] > 127) n++; return n * 4; }; // 4점마다 하나 세서 빠르게
const area = px => px / (cur.k * cur.k);
function costTxt() { const used = area(opaque()), ink = inkNow(); $('cost').innerHTML = `이번 그림 <b>${used.toFixed(1)}㎡</b> · 남은 물감 <b${used > ink ? ' style="color:#c0392b"' : ''}>${ink.toFixed(1)}㎡</b>`; return used; }
function drawBase() { const A = art.get(cur.s.id); bx.clearRect(0, 0, bs.width, bs.height); if (A) bx.drawImage(A.c, 0, 0, bs.width, bs.height); }

async function openEditor(s, su, sv) {
  if (!me || !me.name) { toast('먼저 시작하기를 눌러 주세요.'); return; }
  const { W, H: Hh, k } = sizeOf(s);
  cur = { s, k }; for (const c of [bs, cv, gd]) { c.width = W; c.height = Hh; } paper.style.width = W + 'px'; paper.style.height = Hh + 'px';
  ctx.clearRect(0, 0, W, Hh); undo = []; redo = []; drawBase();
  const A = art.get(s.id); $('front').checked = A ? A.front !== false : true;
  gx.clearRect(0, 0, W, Hh); gx.setLineDash([10, 8]); gx.lineWidth = 2; gx.strokeStyle = '#2b5b4877'; gx.fillStyle = '#2b5b48aa'; gx.font = '600 16px system-ui';
  for (const f of s.floors) { const y = Hh - f.v * k; gx.beginPath(); gx.moveTo(0, y); gx.lineTo(W, y); gx.stroke(); gx.fillText(f.floor, 6, y - 6); }
  gx.strokeStyle = '#9b3a1677'; for (const u of s.folds) { const x = u * k; gx.beginPath(); gx.moveTo(x, 0); gx.lineTo(x, Hh); gx.stroke(); }
  $('edtitle').textContent = nameOf(s); $('edsub').textContent = ` · ${s.length.toFixed(1)}m × ${s.height.toFixed(1)}m · 칠하지 않은 곳은 원래 벽이 보여요`;
  $('ed').classList.add('show'); $('map').style.display = 'none'; // 그리는 동안 3D 지도는 멈춰서 태블릿이 그림판에 힘을 다 쓰게
  const r = wrap.getBoundingClientRect(), fit = Math.min(r.width / W, r.height / Hh) * .95;
  view.s = su != null ? Math.max(fit, Math.min(2, r.height / Hh * .9)) : fit;
  const cx = su != null ? su * k : W / 2, cy = sv != null ? Hh - sv * k : Hh / 2;
  view.x = r.width / 2 - cx * view.s; view.y = r.height / 2 - cy * view.s; applyView(); costTxt();
}
const applyView = () => { paper.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.s})`; };
const snap = () => { undo.push(ctx.getImageData(0, 0, cv.width, cv.height)); if (undo.length > 20) undo.shift(); redo = []; };
$('undo').onclick = () => { if (!undo.length) return; redo.push(ctx.getImageData(0, 0, cv.width, cv.height)); ctx.putImageData(undo.pop(), 0, 0); costTxt(); };
$('redo').onclick = () => { if (!redo.length) return; undo.push(ctx.getImageData(0, 0, cv.width, cv.height)); ctx.putImageData(redo.pop(), 0, 0); costTxt(); };
const closeEd = () => { $('ed').classList.remove('show'); $('map').style.display = ''; cur = null; };
$('edclose').onclick = () => { if (undo.length && !confirm('칠한 것을 벽에 입히지 않고 닫을까요?')) return; closeEd(); };
$('apply').onclick = async () => {
  const W = cv.width, H = cv.height, d = ctx.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1, n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const a = d[(y * W + x) * 4 + 3]; if (!a) continue; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (a > 127) n++; }
  if (x1 < 0) { toast('아직 칠한 곳이 없어요.'); return; }
  const w = x1 - x0 + 1, h = y1 - y0 + 1, used = Math.min(area(n), w * h / (PPM * PPM));
  if (used > inkNow() + 1e-6) { toast(`물감이 ${(used - inkNow()).toFixed(1)}㎡ 모자라요. 조금 기다리거나 「물감 모으기」에서 퀴즈를 풀어 주세요.`, 4000); return; }
  const crop = newCanvas(w, h); crop.getContext('2d').drawImage(cv, -x0, -y0);
  const btn = $('apply'); btn.disabled = true; btn.textContent = '올리는 중…';
  try {
    const j = await api('/patches', { method: 'POST', body: { sheet: cur.s.id, x: x0, y: y0, w, h, area: used, front: $('front').checked, png: crop.toDataURL('image/png'), label: nameOf(cur.s) } });
    const p = j.patch; known.add(p.id); PATCHES.push(p); MINE.add(p.id);
    const s = cur.s; let A = art.get(s.id); if (!A) { const { W: w2, H: h2 } = sizeOf(s); A = { c: newCanvas(w2, h2), list: [], front: true }; art.set(s.id, A); }
    A.c.getContext('2d').drawImage(crop, x0, y0); A.list.push(p); A.front = !!p.front; A.url = A.c.toDataURL();
    await map.sheetPaint(s.id, A.url, { front: A.front });
    FEED.unshift({ at: Date.now(), text: `${me.name} 님이 ${nameOf(s)}에 그림을 입혔어요` });
    closeEd(); drawPane(); toast('벽에 입혔어요! 이제 모두에게 보여요.');
  } catch (e) { toast(e.message, 4000); }
  finally { btn.disabled = false; btn.textContent = '벽에 입히기'; }
};
const toPaper = (cx, cy) => { const r = wrap.getBoundingClientRect(); return [(cx - r.left - view.x) / view.s, (cy - r.top - view.y) / view.s]; };
const P = new Map(); let drawing = null, pinch = null;
wrap.addEventListener('contextmenu', e => e.preventDefault());
wrap.addEventListener('pointerdown', e => {
  wrap.setPointerCapture(e.pointerId); if (e.pointerType === 'pen') penSeen = true;
  const draws = e.pointerType === 'pen' || (e.pointerType === 'mouse' && e.button === 0) || (e.pointerType === 'touch' && !penSeen && P.size === 0);
  P.set(e.pointerId, { x: e.clientX, y: e.clientY, draws, t: e.pointerType });
  if (P.size > 1) { if (drawing) { ctx.putImageData(undo.pop(), 0, 0); drawing = null; } pinch = null; return; }
  if (!draws) return;
  const [x, y] = toPaper(e.clientX, e.clientY);
  if (tool === 'fill') { snap(); flood(Math.floor(x), Math.floor(y)); costTxt(); return; }
  snap(); drawing = { x, y }; dot(x, y, e);
});
wrap.addEventListener('pointermove', e => {
  const p = P.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  if (P.size === 2) { const [a, b] = [...P.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2; if (pinch) zoomAt(mx, my, d / pinch.d, mx - pinch.mx, my - pinch.my); pinch = { d, mx, my }; return; }
  if (drawing) { const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e]; for (const q of evs) { const [x, y] = toPaper(q.clientX, q.clientY); line(drawing.x, drawing.y, x, y, q); drawing = { x, y }; } return; }
  if (!p.draws || e.buttons === 2) { view.x += dx; view.y += dy; applyView(); }
});
const end = e => { P.delete(e.pointerId); if (P.size < 2) pinch = null; if (drawing) { drawing = null; costTxt(); } };
wrap.addEventListener('pointerup', end); wrap.addEventListener('pointercancel', end);
wrap.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * .0015), 0, 0); }, { passive: false });
function zoomAt(cx, cy, f, dx, dy) { const r = wrap.getBoundingClientRect(), x = cx - r.left, y = cy - r.top, ns = Math.max(.05, Math.min(8, view.s * f)); view.x = x - (x - view.x) * ns / view.s + dx; view.y = y - (y - view.y) * ns / view.s + dy; view.s = ns; applyView(); }
const width = e => size * (e.pointerType === 'pen' ? .25 + .95 * (e.pressure || .5) : 1);
function style(e) { ctx.globalCompositeOperation = tool === 'erase' ? 'destination-out' : 'source-over'; ctx.strokeStyle = ctx.fillStyle = color; ctx.lineCap = ctx.lineJoin = 'round'; ctx.lineWidth = width(e); }
function dot(x, y, e) { style(e); ctx.beginPath(); ctx.arc(x, y, width(e) / 2, 0, Math.PI * 2); ctx.fill(); }
function line(x0, y0, x1, y1, e) { style(e); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
// 채우기: 보이는 모습(아래 판 + 위 판)에서 비슷한 색으로 이어진 곳을 찾아, 위 판(내 것)에 칠한다
function flood(x, y) {
  const W = cv.width, H = cv.height; if (x < 0 || y < 0 || x >= W || y >= H) return;
  const comp = newCanvas(W, H), cg = comp.getContext('2d'); cg.drawImage(bs, 0, 0); cg.drawImage(cv, 0, 0);
  const d = cg.getImageData(0, 0, W, H).data, img = ctx.getImageData(0, 0, W, H), o = img.data;
  const i0 = (y * W + x) * 4, t = [d[i0], d[i0 + 1], d[i0 + 2], d[i0 + 3]];
  const c = [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16), 255];
  if (t.every((v, i) => Math.abs(v - c[i]) < 2)) return;
  const near = i => { const a = d[i + 3]; if (t[3] < 128) return a < 128; return a >= 128 && Math.abs(d[i] - t[0]) + Math.abs(d[i + 1] - t[1]) + Math.abs(d[i + 2] - t[2]) < 60; };
  const st = [[x, y]], seen = new Uint8Array(W * H); let n = 0;
  while (st.length && n < 4e6) { const [sx, sy] = st.pop(); let lx = sx; while (lx > 0 && !seen[sy * W + lx - 1] && near((sy * W + lx - 1) * 4)) lx--;
    let up = false, dn = false; for (let xx = lx; xx < W; xx++) { const p = sy * W + xx; if (seen[p] || !near(p * 4)) break; seen[p] = 1; o.set(c, p * 4); n++;
      if (sy > 0) { const q = p - W; if (!seen[q] && near(q * 4)) { if (!up) { st.push([xx, sy - 1]); up = true; } } else up = false; }
      if (sy < H - 1) { const q = p + W; if (!seen[q] && near(q * 4)) { if (!dn) { st.push([xx, sy + 1]); dn = true; } } else dn = false; } } }
  ctx.putImageData(img, 0, 0);
}
addEventListener('keydown', e => { if (!$('ed').classList.contains('show')) return; if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); (e.shiftKey ? $('redo') : $('undo')).click(); } if (e.key === 'Escape') $('edclose').click(); });

// ---------- 오른쪽 패널 ----------
let tab = 'walls', openFlag = null, RANK = null, QUIZ = [], MYANS = new Map();
let QUESTS = []; try { QUESTS = (await (await fetch('../quest/data/quests.json')).json()).quests.filter(q => !['찾기', '비교'].includes(q.type)).slice(0, 8); } catch (e) {}
async function loadEarn() { try { const [a, b] = await Promise.all([api('/quizzes'), api('/answers')]); QUIZ = a.quizzes; MYANS = new Map(b.answers.map(r => [r.qkey, r])); } catch (e) { toast(e.message); } }
function wallsPane() {
  const rk = RANK && RANK.painters.length ? `<div class="rank"><b>많이 그린 사람</b><br>${RANK.painters.slice(0, 5).map((r, i) => `${i + 1}. ${esc(r.name)} · ${r.n}㎡`).join('<br>')}</div>` : '';
  return `<div class="how">3D 지도에서 <b>벽을 누르거나</b> 아래 목록에서 골라요. 남의 그림 위에 덧그릴 수 있어요. 「흰 도화지로 보기」를 켜면 그림 없는 벽이 하얗게 보여요.</div>` +
    BLD.map(b => `<div style="font-size:12px;color:#6b7a70;margin:10px 2px 2px">${b}</div>` + SHEETS.filter(s => s.building === b && s.length >= 6).map(s => { const A = art.get(s.id), list = A ? A.list : [];
      const names = [...new Set(list.slice().reverse().map(p => p.name))];
      return `<button class="sheet" data-id="${s.id}"><span class="th" style="${A && list.length ? `background-image:url(${A.url})` : ''}"></span><span style="flex:1">${esc(nameOf(s))}<br><small>${s.length.toFixed(0)}m × ${s.height.toFixed(0)}m${names.length ? ' · ' + esc(names.slice(0, 3).join(', ')) + (names.length > 3 ? ` 외 ${names.length - 3}명` : '') : ''}</small></span>${list.length ? `<span class="flag" data-fl="${s.id}" title="이 벽의 그림 신고">🚩</span>` : ''}</button>` +
        (openFlag === s.id ? `<div class="plist">${list.slice().reverse().map(p => `${esc(p.name)} · ${ago(p.at)} ${MINE.has(p.id) ? '(내 그림)' : `<button class="flag" data-pid="${p.id}">부적절해요</button>`}`).join('<br>')}<br><small>신고가 ${3}번 모이면 그 한 장만 숨겨지고, 밑에 있던 그림이 다시 보여요.</small></div>` : ''); }).join('')).join('') +
    `<div class="feed">${FEED.slice(0, 6).map(f => `· ${esc(f.text)} <small>${ago(f.at)}</small>`).join('<br>')}</div>` + rk;
}
function earnPane() {
  const r = RULES;
  const quiz = QUIZ.map(q => `<div class="q${q.done ? ' done' : ''}"><b>${esc(q.q)}</b>${q.done
    ? `<div>${q.ok ? `<span class="ok">✓ 정답! 물감 ${r.QUIZ_INK}㎡ · 1점</span>` : `<span class="bad">정답은 「${esc(q.answer)}」</span>`}</div><div class="why">${esc(q.why)}</div>`
    : `<div class="opts" style="margin-top:6px">${q.options.map(o => `<button data-qz="${q.id}" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>`}</div>`).join('');
  const quest = QUESTS.map(q => { const a = MYANS.get(q.id);
    const st = !a ? '' : a.confirmed == null ? `<span class="pend">⏳ 내 답 「${esc(a.value)}」 · 다른 사람 답과 맞으면 ${r.ANSWER_PT}점이 들어와요</span>` : a.confirmed === a.value ? `<span class="ok">✓ 확정된 답과 같아요! ${r.ANSWER_PT}점</span>` : `<span class="bad">확정된 답: ${esc(a.confirmed)}</span>`;
    const canAns = !a || a.confirmed == null;
    return `<div class="q${a && a.confirmed != null ? ' done' : ''}"><b>${esc(q.title)}</b><p>${esc(q.q)}</p>${st ? `<div>${st}</div>` : ''}${canAns ? `<div class="opts" style="margin-top:6px">${q.options.slice(0, 8).map(o => `<button data-qk="${q.id}" data-v="${esc(o)}" ${a && a.value === o ? 'style="border-color:#244f3d;font-weight:800"' : ''}>${esc(o)}</button>`).join('')}</div>` : ''}</div>`; }).join('');
  return `<div class="how"><b>🧩 학교 퀴즈</b>는 정답이 있어서 맞히면 <b>바로</b> 물감 ${r.QUIZ_INK}㎡와 1점. 한 번만 풀 수 있어요.<br><b>📍 현장 질문</b>은 아직 정답을 몰라요. 그 자리에 가서 보고 답해 주세요. <b>${3}명 이상 같은 답</b>이 모이면 확정되고, 같은 답을 낸 사람 모두 <b>${r.ANSWER_PT}점</b>을 받아요. 확정된 답은 3D 지도를 고치는 데 쓰여요.<br>점수는 소품 놓기·날씨 바꾸기에 써요(다음 단계).</div>` +
    `<div class="sec">🧩 학교 퀴즈 (바로 보상)</div>${quiz || '<div class="how">불러오는 중…</div>'}<div class="sec">📍 현장 질문 (나중 보상)</div>${quest}`;
}
function drawPane() {
  $('pane').innerHTML = tab === 'walls' ? wallsPane() : earnPane();
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
}
$('pane').addEventListener('click', async e => {
  const t = e.target.closest('[data-fl],[data-pid],[data-qz],[data-qk],.sheet'); if (!t) return;
  if (t.dataset.fl) { e.stopPropagation(); openFlag = openFlag === t.dataset.fl ? null : t.dataset.fl; drawPane(); return; }
  if (t.dataset.pid) {
    try { const j = await api('/flag', { method: 'POST', body: { kind: 'patch', id: +t.dataset.pid } }); toast(j.hidden ? '신고가 모여 그 그림을 숨겼어요.' : j.counted ? `신고했어요. (${j.flag}/3)` : '이미 신고한 그림이에요.'); if (j.hidden) await refresh(); drawPane(); } catch (er) { toast(er.message); }
    return;
  }
  if (t.dataset.qz) {
    try { const j = await api('/quiz', { method: 'POST', body: { id: t.dataset.qz, choice: t.dataset.v } }); toast(j.ok ? `정답! 물감 +${j.reward.ink}㎡, +${j.reward.points}점` : `아쉬워요. 정답: ${j.answer}`, 3500); await loadEarn(); drawPane(); } catch (er) { toast(er.message); }
    return;
  }
  if (t.dataset.qk) {
    try { const j = await api('/answer', { method: 'POST', body: { qkey: t.dataset.qk, value: t.dataset.v } }); toast(j.status === 'confirmed' ? '확정됐어요! 같은 답을 낸 사람 모두 점수를 받아요.' : j.status === 'different' ? '이미 확정된 답과 달라요. 다시 한번 봐 주세요.' : `답을 받았어요. 다른 사람 답과 맞으면 점수가 들어와요.`, 3500); await loadEarn(); drawPane(); } catch (er) { toast(er.message); }
    return;
  }
  if (t.classList.contains('sheet')) openEditor(byId(t.dataset.id));
});
document.querySelectorAll('.tabs button').forEach(b => b.onclick = async () => { tab = b.dataset.t; drawPane(); if (tab === 'earn') { await loadEarn(); drawPane(); } });

// ---------- 시작 ----------
$('startGo').onclick = async () => {
  const name = $('nick').value.trim(); if (!name) { toast('닉네임을 정해 주세요.'); return; }
  try { await api('/me', { method: 'POST', body: { name } }); $('start').remove(); drawPane(); toast(`물감 ${RULES.INK_MAX}㎡로 시작해요. 벽을 눌러 보세요!`); } catch (e) { toast(e.message); }
};
try { await refresh(); } catch (e) { toast(e.message, 5000); }
if (me && me.name) $('start').remove();
drawPane();
const loadRank = async () => { try { RANK = await api('/ranking'); } catch (_) {} };
await loadRank(); drawPane();
// 다른 사람이 그린 것이 보이게 15초마다 확인(창을 안 볼 땐 쉼)
setInterval(async () => { if (document.hidden) return; try { const n = PATCHES.length; await refresh(); if (Math.random() < .25) await loadRank(); if (PATCHES.length !== n || tab === 'walls') drawPane(); } catch (_) {} }, 15000);
})().catch(e => { console.error(e); const p = document.getElementById('pane'); if (p) p.textContent = '불러오지 못했어요: ' + e.message; });
