// canvas.cukmap.com — 하얀 학교를 다 같이 칠하는 실시간 벽 그림판
// - 벽마다 그림판이 하나. 모두가 같은 판에 칠하고, 펜을 떼면 바로 서버에 올라가 몇 초 안에 다른 사람 화면에도 나타난다.
// - 서버: cukmap/map 저장소 worker/canvas.js (/api/canvas). 펜을 뗄 때마다 칠한 부분만 잘라 한 장(patch)으로 올리고,
//   벽 모습 = 그 벽의 장들을 오래된 것부터 겹친 것(지우기 장은 그 모양만큼 원래 벽이 보이게).
(async () => {
const $ = id => document.getElementById(id);
const toast = (t, ms = 2800) => { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), ms); };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const PAL = ['#e8552e', '#f2c230', '#2e9b5f', '#3b7dd8', '#7a55c7', '#c2456b', '#8fd0ff', '#ff9ec7', '#8a5a2b', '#ffffff', '#9aa39d', '#26392f', '#b8452c', '#d9cbb0', '#7c8a92', '#4a5b3f'];
const PPM = 20;              // 도화지 1m = 20px (서버와 같아야 함)
const PAPER = '#f3f1ec';     // 지우개 미리보기 색(원래 벽)
const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? '방금' : m < 60 ? m + '분 전' : m < 1440 ? Math.round(m / 60) + '시간 전' : Math.round(m / 1440) + '일 전'; };
const m2 = v => v >= 100 ? Math.round(v).toLocaleString() : v.toFixed(1);

// ---------- 서버 ----------
const Q = new URLSearchParams(location.search);
const API = Q.get('api') || 'https://cukmap.com/api/canvas';
// 기록 보기: ?at=2026-12-24T23:59 처럼 주면 그 순간의 모습을 그리기 없이 보여 준다
const AT = Q.get('at') ? (isFinite(+Q.get('at')) ? +Q.get('at') : Date.parse(Q.get('at'))) : 0;
const rand = () => [...crypto.getRandomValues(new Uint8Array(18))].map(b => b.toString(16).padStart(2, '0')).join('');
let DEV; try { DEV = localStorage.getItem('cukcanvas.id'); if (!DEV) { DEV = rand(); localStorage.setItem('cukcanvas.id', DEV); } } catch (_) { DEV = rand(); }
let me = null, meAt = 0, RULES = { INK_MAX: 30, INK_PER_H: 6, QUIZ_INK: 5, ANSWER_PT: 3 };
async function api(path, o = {}) {
  let r; try { r = await fetch(API + path, { method: o.method || 'GET', headers: { 'x-canvas-id': DEV, ...(o.body ? { 'content-type': 'application/json' } : {}) }, body: o.body ? JSON.stringify(o.body) : undefined }); }
  catch (e) { throw new Error('서버에 닿지 못했어요. 인터넷 연결을 확인해 주세요.'); }
  let j = {}; try { j = await r.json(); } catch (_) {}
  if (j.me) setMe(j.me);
  if (!r.ok) throw Object.assign(new Error(j.error || '서버 오류가 났어요.'), { status: r.status });
  return j;
}
function setMe(m) { me = m; meAt = Date.now(); for (const n of m.notices || []) if (n.kind === 'answer') toast(`현장 질문 답이 다른 사람들 답과 맞아 확정됐어요! +${n.points}점`, 4000); updMe(); }
const inkNow = () => !me ? 0 : me.ink >= RULES.INK_MAX ? me.ink : Math.min(RULES.INK_MAX, me.ink + (Date.now() - meAt) / 3600000 * RULES.INK_PER_H);
function updMe() { if (!me) return; $('ink').textContent = `🎨 물감 ${inkNow().toFixed(1)}㎡ · ⭐ ${me.points}`; $('ink').title = `물감은 한 시간에 ${RULES.INK_MAX ? RULES.INK_PER_H : 6}㎡씩 ${RULES.INK_MAX}㎡까지 차요. 퀴즈를 풀면 더 쌓을 수 있어요.`; if (cur) costTxt(); }
setInterval(updMe, 15000);

// ---------- 지도: 하얀 학교 + 모든 건물의 벽 도화지 ----------
const map = await CUKmap.create('#map', { view: '3d', focus: '니콜스관', select: false });
let plainOn = true; await map.plain(1);
$('tlBtn').onclick = timelapse;
$('plainBtn').onclick = async () => { plainOn = !plainOn; await map.plain(plainOn ? 1 : 0); $('plainBtn').textContent = plainOn ? '🎨 원래 색' : '🏫 하얀 학교'; };
const BUILD = [], SHEETS = [];
for (const b of await map.buildings()) { try { const ss = (await map.sheets({ buildings: [b.name] })).filter(s => s.length >= 2 && s.height >= 2); if (ss.length) { BUILD.push(b.name); SHEETS.push(...ss); } } catch (_) {} }
const byId = id => SHEETS.find(s => s.id === id);
const nameOf = s => { const same = SHEETS.filter(x => x.building === s.building), k = same.indexOf(s) + 1; return `${s.building} 벽 ${k}`; };
const sizeOf = s => { const W = Math.min(4096, Math.round(s.length * PPM)); return { W, H: Math.round(s.height * W / s.length), k: W / s.length }; };
const TOTAL = SHEETS.reduce((t, s) => t + s.length * s.height, 0);
const newCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const loadImg = url => new Promise((ok, no) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => ok(im); im.onerror = () => no(new Error('그림을 불러오지 못했어요.')); im.src = url; });

// ---------- 같이 쓰는 벽 ----------
const art = new Map();                 // 벽 id → { c: 겹친 그림, maxId, area }
const PATCHES = new Map();             // 벽 id → [patch] (id 순)
const IMG = new Map();                 // patch id → 그림(Image 또는 canvas)
const hiddenSet = new Set(), MYSENT = []; // MYSENT: 되돌리기용, 이번에 내가 올린 장(최근 것이 끝)
let lastId = 0, PRES = new Map(), MINE = new Set();
const imgOf = async p => { if (!IMG.has(p.id)) { try { IMG.set(p.id, await loadImg(`${API}/patch/${p.id}.png`)); } catch (_) { IMG.set(p.id, null); } } return IMG.get(p.id); };
function drawPatch(g, p) { const im = IMG.get(p.id); if (!im) return; g.globalCompositeOperation = p.mode === 'erase' ? 'destination-out' : 'source-over'; g.drawImage(im, p.x, p.y); g.globalCompositeOperation = 'source-over'; }
function measure(A) { // 칠해진 넓이(㎡): 4점마다 하나씩 본다
  const d = A.c.getContext('2d').getImageData(0, 0, A.c.width, A.c.height).data; let n = 0; for (let i = 3; i < d.length; i += 16) if (d[i] > 127) n++; A.area = n * 4 / (A.k * A.k);
  const t = newCanvas(120, Math.max(8, Math.round(120 * A.c.height / A.c.width))); t.getContext('2d').drawImage(A.c, 0, 0, t.width, t.height); A.thumb = t.toDataURL();
}
async function paintSheet(id, add) {
  const s = byId(id); if (!s) return;
  let A = art.get(id); const list = PATCHES.get(id) || [];
  const full = !A || !add || add.some(p => p.id < A.maxId);
  const todo = full ? list : add;
  await Promise.all(todo.map(imgOf));
  if (full) { const { W, H, k } = sizeOf(s); A = { c: newCanvas(W, H), maxId: 0, area: 0, k }; art.set(id, A); }
  const g = A.c.getContext('2d'); for (const p of todo) { drawPatch(g, p); A.maxId = Math.max(A.maxId, p.id); }
  measure(A); await map.sheetPaint(id, A.c.toDataURL(), { front: true });
  if (cur && cur.s.id === id) drawBase();
}
function addPatch(p) { if (!PATCHES.has(p.sheet)) PATCHES.set(p.sheet, []); const l = PATCHES.get(p.sheet); l.push(p); l.sort((a, b) => a.id - b.id); }
let busyRefresh = false;
async function refresh() {
  if (busyRefresh) return; busyRefresh = true;
  try {
    const j = await api('/state?since=' + lastId + '&vsince=' + lastVid + (AT ? '&until=' + AT : ''));
    await voxSync(j);
    RULES = j.rules; MINE = new Set(j.mine); PRES = new Map(j.presence.map(r => [r.sheet, r.n]));
    const redo = new Set(), add = new Map();
    for (const id of j.hidden) if (!hiddenSet.has(id)) { hiddenSet.add(id); for (const [sh, l] of PATCHES) { const i = l.findIndex(p => p.id === id); if (i >= 0) { l.splice(i, 1); redo.add(sh); } } }
    for (const p of j.patches) { lastId = Math.max(lastId, p.id); if (hiddenSet.has(p.id) || !byId(p.sheet) || (PATCHES.get(p.sheet) || []).some(q => q.id === p.id)) continue; addPatch(p); if (!add.has(p.sheet)) add.set(p.sheet, []); add.get(p.sheet).push(p); }
    for (const id of redo) await paintSheet(id, null);
    for (const [id, l] of add) if (!redo.has(id)) await paintSheet(id, l);
    if (redo.size || add.size) updCover();
    updLive(); return j;
  } finally { busyRefresh = false; }
}
function updCover() {
  let a = 0; for (const A of art.values()) a += A.area || 0;
  $('cover').innerHTML = `칠해진 벽 <b>${m2(a)}㎡</b> · 학교 벽의 <b>${(a / TOTAL * 100).toFixed(a / TOTAL < .01 ? 2 : 1)}%</b>`;
}
// 그 자리를 마지막으로 칠한(지운) 사람
const probe = newCanvas(1, 1), pg = probe.getContext('2d', { willReadFrequently: true });
function whoAt(id, px, py) {
  const l = PATCHES.get(id) || [];
  for (let i = l.length - 1; i >= 0; i--) { const p = l[i], im = IMG.get(p.id); if (!im || px < p.x || py < p.y || px >= p.x + p.w || py >= p.y + p.h) continue;
    pg.clearRect(0, 0, 1, 1); pg.drawImage(im, -(px - p.x), -(py - p.y)); if (pg.getImageData(0, 0, 1, 1).data[3] > 40) return p; }
  return null;
}
const whoTxt = p => !p ? '아직 아무도 칠하지 않은 곳이에요.' : `${MINE.has(p.id) ? '내가' : esc(p.name) + ' 님이'} ${p.mode === 'erase' ? '지웠어요' : '칠했어요'} · ${ago(p.at)}`;

if (Q.has('debug')) globalThis.__cv = { whoAt, PATCHES, IMG, art, map, get cur() { return cur; } };
// 3D에서 벽을 누르면: 누가 칠했는지 + 그리기 버튼
map.on('click', e => {
  if (bmode !== 'orbit') return;
  const pop = $('pop');
  if (!e.sheet) { pop.classList.remove('on'); if (e.building) toast('벽을 눌러 주세요.'); return; }
  const s = byId(e.sheet); if (!s) return; const { H, k } = sizeOf(s), p = whoAt(s.id, Math.floor(e.su * k), Math.floor(H - e.sv * k)), n = PRES.get(s.id) || 0;
  pop.innerHTML = `<h3>${esc(nameOf(s))}</h3><div class="m">${s.length.toFixed(0)}m × ${s.height.toFixed(0)}m${n ? ` · <span class="drawing">✏️ 지금 ${n}명이 그리는 중</span>` : ''}<br>누른 곳: ${whoTxt(p)}</div><div class="b"><button class="go2">✏️ 이 벽에 그리기</button><button class="x">닫기</button></div>`;
  pop.classList.add('on'); pop.querySelector('.go2').onclick = () => { pop.classList.remove('on'); openEditor(s, e.su, e.sv); }; pop.querySelector('.x').onclick = () => pop.classList.remove('on');
});

// ---------- 블록으로 꾸미기 ----------
// 25cm 블록을 지도 위에 쌓고·지우고·칠한다. 한 번 누를 때 바뀐 칸들을 서버에 한 줄로 올리고, 다른 사람 것은 몇 초마다 받아 겹친다.
let bmode = 'fly';
const VPAL_UNUSED = ['#c0392b', '#e8552e', '#f2c230', '#2e9b5f', '#1f6b3a', '#3b7dd8', '#7a55c7', '#ff9ec7', '#8a5a2b', '#f4f6f8', '#9aa39d', '#26392f', '#d9cbb0', '#8fd0ff', '#b8452c', '#4a5b3f', '#ffd76a'];
// 기본 작품(놓은 뒤에도 블록이라 마음대로 고칠 수 있어요). [가로, 높이, 세로, 색], 0,0,0 = 누른 곳 바로 위
const STAMPS = {
  '🎄 트리': () => { const o = [], R = (a, b) => (Math.sin(a * 12.99 + b * 78.23) * 43758.5) % 1; for (let y = 0; y < 3; y++) for (const [x, z] of [[0, 0], [1, 0], [0, 1], [1, 1]]) o.push([x, y, z, '#6b4226']);
    for (let y = 3; y < 15; y++) { const r = (15 - y) * .42 + .4; for (let x = -5; x <= 6; x++) for (let z = -5; z <= 6; z++) { const d = Math.hypot(x - .5, z - .5); if (d > r) continue; const edge = d > r - 1, h = Math.abs(R(x * 7 + y, z * 3 + y)); o.push([x, y, z, edge && h < .1 ? ['#c0392b', '#ffd76a', '#3b7dd8', '#f4f6f8'][Math.floor(h * 40) % 4] : (h < .5 ? '#1f6b3a' : '#2e7d4f')]); } }
    for (const [x, y] of [[0, 15], [1, 15], [0, 16], [1, 16], [-1, 16], [2, 16], [0, 17], [1, 17]]) o.push([x, y, 0, '#ffd76a']); return o; },
  '⛄ 눈사람': () => { const o = [], ball = (cy, r) => { for (let x = -4; x <= 4; x++) for (let y = -4; y <= 4; y++) for (let z = -4; z <= 4; z++) if (x * x + y * y + z * z <= r * r) o.push([x, cy + y, z, '#f4f6f8']); }; ball(3, 3.2); ball(8, 2.4); ball(12, 1.8);
    o.push([-1, 13, -2, '#26392f'], [1, 13, -2, '#26392f'], [0, 12, -2, '#e8552e'], [0, 12, -3, '#e8552e'], [0, 9, -3, '#26392f'], [0, 7, -3, '#26392f'], [0, 5, -4, '#26392f']);
    for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) o.push([x, 10, z, '#c0392b']); for (let y = 14; y < 17; y++) for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) o.push([x, y, z, '#26392f']); for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) o.push([x, 14, z, '#26392f']);
    const m = new Map(); for (const q of o) m.set(q.slice(0, 3).join(), q); return [...m.values()]; },
  '🎁 선물': () => { const o = [], mid = v => v === 1 || v === 2, edge = v => v === 0 || v === 3; for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) for (let z = 0; z < 4; z++) o.push([x, y, z, (mid(x) && (edge(z) || y === 3)) || (mid(z) && (edge(x) || y === 3)) ? '#ffd76a' : '#c0392b']); o.push([1, 4, 1, '#ffd76a'], [2, 4, 2, '#ffd76a'], [1, 4, 2, '#ffd76a'], [2, 4, 1, '#ffd76a']); return o; },
  '⭐ 별': () => { const o = [], P = [[0, 6], [-1, 5], [0, 5], [1, 5], [-1, 4], [0, 4], [1, 4], [-4, 3], [-3, 3], [-2, 3], [-1, 3], [0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [-2, 2], [-1, 2], [0, 2], [1, 2], [2, 2], [-2, 1], [-1, 1], [0, 1], [1, 1], [2, 1], [-3, 0], [-2, 0], [2, 0], [3, 0]]; for (const [x, y] of P) o.push([x, y + 1, 0, '#ffd76a']); return o; },
  '💚 리스': () => { const o = []; for (let x = -4; x <= 4; x++) for (let y = -4; y <= 4; y++) { const d = Math.hypot(x, y); if (d >= 2.4 && d <= 4.2) o.push([x, y + 5, 0, (x + y) % 3 === 0 ? '#c0392b' : '#1f6b3a']); } o.push([-1, 1, -1, '#c0392b'], [0, 1, -1, '#c0392b'], [1, 1, -1, '#c0392b']); return o; }
};
// 손에 든 것(핫바) 9칸: 색 7개 + 기본 작품 2개. E로 바꿀 수 있고, 휠 클릭으로 블록 색을 집을 수도 있어요
let started = false, flying = false;
const SLOTS = ['#c0392b', '#f2c230', '#2e9b5f', '#3b7dd8', '#f4f6f8', '#8a5a2b', '#26392f'].map(c => ({ color: c })).concat([{ name: '🎄 트리' }, { name: '⛄ 눈사람' }]);
let slot = 0;
const kitSlots = () => SLOTS.map(s => s.color ? { color: s.color } : { stamp: STAMPS[s.name](), name: s.name });
function drawHotbar() { $('hotbar').innerHTML = SLOTS.map((s, i) => `<button data-i="${i}" class="${i === slot ? 'on' : ''}" title="${s.color || s.name}"><i>${i + 1}</i>${s.color ? `<span class="sw" style="background:${s.color}"></span>` : esc(s.name.split(' ')[0])}</button>`).join(''); }
$('hotbar').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; slot = +b.dataset.i; drawHotbar(); map.voxelFly({ slot }); });
const PALC = ['#c0392b', '#e8552e', '#f28c38', '#f2c230', '#ffd76a', '#2e9b5f', '#1f6b3a', '#4a5b3f', '#3b7dd8', '#8fd0ff', '#1d3a6b', '#7a55c7', '#ff9ec7', '#c2456b', '#f4f6f8', '#d9cbb0', '#9aa39d', '#5b6770', '#26392f', '#8a5a2b', '#6b4226', '#b8452c', '#e9e2cf', '#000000'].map(c => c === '#000000' ? '#141414' : c);
$('palcols').innerHTML = PALC.map(c => `<button data-c="${c}" style="background:${c}"></button>`).join('');
$('palst').innerHTML = Object.keys(STAMPS).map(k => `<button data-st="${k}">${k}</button>`).join('');
function setSlot(v) { SLOTS[slot] = v; drawHotbar(); map.voxelFly({ slots: kitSlots(), slot }); closeModals(); }
$('palcols').onclick = e => { const b = e.target.closest('button'); if (b) setSlot({ color: b.dataset.c }); };
$('palpick').onchange = () => setSlot({ color: $('palpick').value });
$('palst').onclick = e => { const b = e.target.closest('button'); if (b) setSlot({ name: b.dataset.st }); };
const anyModal = () => [...document.querySelectorAll('.modal')].some(m => m.classList.contains('on'));
function openModal(id) { document.querySelectorAll('.modal').forEach(m => m.classList.toggle('on', m.id === id)); document.body.classList.toggle('menu', !!id); if (id === 'palette') $('palslot').textContent = slot + 1; }
function closeModals() { openModal(null); }
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => openModal(bmode === 'fly' ? 'menu' : null));
$('resume').onclick = () => { closeModals(); toast('화면을 누르면 다시 들어가요.'); };
$('menu').addEventListener('click', async e => { const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a;
  if (a === 'palette') openModal('palette');
  if (a === 'earn') { openModal('earn'); await loadEarn(); drawPane(); }
  if (a === 'orbit') { closeModals(); toOrbit(); }
  if (a === 'tl') { closeModals(); toOrbit(); timelapse(); } });
async function enterFly() { bmode = 'fly'; document.body.classList.remove('orbit'); document.body.classList.add('ready'); $('pop').classList.remove('on'); closeModals();
  await map.voxelFly({ on: true, building: '니콜스관', slots: kitSlots(), slot }); drawHotbar(); }
async function toOrbit() { bmode = 'orbit'; await map.voxelFly({ on: false }); document.body.classList.add('orbit'); document.body.classList.remove('locked');
  await map.focus({ building: '니콜스관', zoom: 160 }).catch(() => {}); toast('벽을 누르면 그 벽에 그림을 그릴 수 있어요.'); }
$('enterBtn').onclick = enterFly;
map.on('fly', e => {
  if ('locked' in e) { document.body.classList.toggle('locked', e.locked); if (!e.locked && bmode === 'fly' && !anyModal() && !cur) openModal('menu'); if (e.locked) closeModals(); }
  if ('slot' in e) { slot = e.slot; drawHotbar(); }
  if (e.slots) { e.slots.forEach((s, i) => { if (s.color) SLOTS[i] = { color: s.color }; }); drawHotbar(); }
  if ('flying' in e) { flying = e.flying; $('status').textContent = flying ? '🕊 나는 중 · 스페이스 위로, Shift 아래로' : ''; }
  if (e.menu === 'palette') openModal('palette');
});
// 서버와 맞추기
const VROWS = [], VKNOWN = new Set(), VHID = new Set(), MYVOX = [];
let lastVid = 0;
async function rebuildVox() { const m = new Map(); for (const r of VROWS) if (!VHID.has(r.id)) for (const q of r.cells) { const k = q[0] + ',' + q[1] + ',' + q[2]; if (q[3]) m.set(k, q); else m.delete(k); } await map.voxelReset([...m.values()]); }
async function voxSync(j) {
  let redo = false;
  for (const id of j.voxHidden || []) if (!VHID.has(id)) { VHID.add(id); if (VKNOWN.has(id)) redo = true; }
  const fresh = [];
  for (const r of j.vox || []) { lastVid = Math.max(lastVid, r.id); if (VKNOWN.has(r.id) || VHID.has(r.id)) continue; VKNOWN.add(r.id); VROWS.push(r); fresh.push(r); }
  if (fresh.some(r => VROWS.some(q => q.id > r.id && !fresh.includes(q)))) redo = true; // 늦게 도착한 옛 줄이면 순서대로 다시
  VROWS.sort((a, b) => a.id - b.id);
  if (redo) await rebuildVox(); else for (const r of fresh) await map.voxelApply(r.cells);
}
map.on('voxel', async e => {
  try { const j = await api('/voxels', { method: 'POST', body: { cells: e.cells } }); const r = { id: j.vox.id, name: j.vox.name, at: j.vox.at, cells: e.cells }; VKNOWN.add(r.id); VROWS.push(r); MYVOX.push(r); lastVid = Math.max(lastVid, 0); }
  catch (er) { await map.voxelApply(e.before); toast(er.message, 3500); }
});

// ---------- 타임랩스: 하얀 학교가 칠해져 온 과정을 3D로 다시 보기 ----------
let replaying = false;
const when = t => { const d = new Date(t); return `${d.getMonth() + 1}월 ${d.getDate()}일 ${d.getHours() < 12 ? '오전' : '오후'} ${(d.getHours() % 12) || 12}:${String(d.getMinutes()).padStart(2, '0')}`; };
async function timelapse() {
  if (replaying || cur) return;
  const all = [...PATCHES.values()].flat().sort((a, b) => a.id - b.id);
  if (!all.length) { toast('아직 칠해진 곳이 없어요.'); return; }
  replaying = true; $('tlBtn').textContent = '⏱ 다시 보는 중…'; $('pop').classList.remove('on');
  await Promise.all(all.map(imgOf));
  const C = new Map(); // 벽 id → 다시 그리는 판
  for (const id of new Set(all.map(p => p.sheet))) { const { W, H } = sizeOf(byId(id)); C.set(id, newCanvas(W, H)); await map.sheetPaint(id, C.get(id).toDataURL(), { front: true }); }
  const steps = Math.min(90, all.length), per = Math.ceil(all.length / steps);
  for (let i = 0; i < all.length; i += per) {
    const chunk = all.slice(i, i + per), ch = new Set();
    for (const p of chunk) { drawPatch(C.get(p.sheet).getContext('2d'), p); ch.add(p.sheet); }
    for (const id of ch) await map.sheetPaint(id, C.get(id).toDataURL(), { front: true });
    $('cover').innerHTML = `⏱ <b>${when(chunk[chunk.length - 1].at)}</b> · ${Math.min(all.length, i + per)} / ${all.length}번째 획`;
    await new Promise(r => setTimeout(r, Math.max(30, 12000 / steps)));
  }
  for (const id of C.keys()) { const A = art.get(id); if (A) await map.sheetPaint(id, A.c.toDataURL(), { front: true }); }
  replaying = false; $('tlBtn').textContent = '⏱ 타임랩스'; updCover();
}

// ---------- 편집기 ----------
// 판 세 장: bs = 지금 벽(모두의 그림), fl = 올리는 중인 것, cv = 아직 안 올린 내 획(펜을 떼고 잠깐 뒤 올라감)
const bs = $('bs'), bx = bs.getContext('2d'), fl = $('fl'), fx = fl.getContext('2d'), cv = $('cv'), gd = $('gd'), ctx = cv.getContext('2d', { willReadFrequently: true }), gx = gd.getContext('2d'), paper = $('paper'), wrap = $('paperwrap');
let cur = null, tool = 'brush', color = PAL[0], size = 14, undo = [], redo = [], view = { s: 1, x: 0, y: 0 }, penSeen = false, showGuide = true;
let pendMode = null, sendT = null, sending = false, presT = null;
$('cols').innerHTML = PAL.map(c => `<button data-c="${c}" style="background:${c}" class="${c === color ? 'on' : ''}"></button>`).join('');
$('cols').onclick = e => { const b = e.target.closest('button'); if (!b) return; color = b.dataset.c; $('pick').value = color; if (tool !== 'brush' && tool !== 'fill') tool = 'brush'; markTools(); };
$('pick').oninput = () => { color = $('pick').value; markTools(); };
$('size').oninput = () => size = +$('size').value;
document.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => { tool = b.dataset.tool; markTools(); if (tool === 'erase') toast('지우개는 칠한 것을 지워 원래 벽이 보이게 해요. 지운 넓이만큼 물감이 들어요.'); if (tool === 'who') toast('누가 칠했는지 궁금한 곳을 눌러 보세요.'); });
const markTools = () => { document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === tool)); $('cols').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.c === color)); };
$('guideBtn').onclick = () => { showGuide = !showGuide; $('guideBtn').classList.toggle('on', showGuide); gd.style.display = showGuide ? '' : 'none'; };
const scan = c => { const g = c.getContext('2d'), W = c.width, H = c.height, d = g.getImageData(0, 0, W, H).data; let x0 = W, y0 = H, x1 = -1, y1 = -1, n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const a = d[(y * W + x) * 4 + 3]; if (!a) continue; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (a > 127) n++; }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, n }; };
const pendArea = () => { const d = ctx.getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 3; i < d.length; i += 16) if (d[i] > 127) n++; return n * 4 / (cur.k * cur.k); };
function costTxt() { const used = pendArea(), ink = inkNow() - used; $('cost').innerHTML = `남은 물감 <b${ink < 0 ? ' style="color:#c0392b"' : ''}>${Math.max(0, ink).toFixed(1)}㎡</b>${used > .05 ? ` <small>(올리는 중 ${used.toFixed(1)}㎡)</small>` : ''}`; }
function drawBase() { const A = art.get(cur.s.id); bx.clearRect(0, 0, bs.width, bs.height); if (A) bx.drawImage(A.c, 0, 0, bs.width, bs.height); }
function updLive() {
  if (!cur) return; const n = Math.max(0, (PRES.get(cur.s.id) || 0) - 1);
  $('live').innerHTML = sending ? '⏫ 올리는 중…' : n ? `<span class="drawing">✏️ 다른 ${n}명이 이 벽에 그리는 중</span>` : '● 실시간 · 펜을 떼면 모두에게 보여요';
}

async function openEditor(s, su, sv) {
  if (AT) { toast('기록 보기에서는 그릴 수 없어요. 지금 학교로 가서 그려 주세요.'); return; }
  if (replaying) return;
  if (!me || !me.name) { if ($('start')) { toast('먼저 시작하기를 눌러 주세요.'); return; } }
  const { W, H: Hh, k } = sizeOf(s);
  cur = { s, k }; for (const c of [bs, fl, cv, gd]) { c.width = W; c.height = Hh; } paper.style.width = W + 'px'; paper.style.height = Hh + 'px';
  ctx.clearRect(0, 0, W, Hh); undo = []; redo = []; pendMode = null; drawBase();
  gx.clearRect(0, 0, W, Hh); gx.setLineDash([10, 8]); gx.lineWidth = 2; gx.strokeStyle = '#2b5b4877'; gx.fillStyle = '#2b5b48aa'; gx.font = '600 16px system-ui';
  for (const f of s.floors) { const y = Hh - f.v * k; gx.beginPath(); gx.moveTo(0, y); gx.lineTo(W, y); gx.stroke(); gx.fillText(f.floor, 6, y - 6); }
  gx.strokeStyle = '#9b3a1677'; for (const u of s.folds) { const x = u * k; gx.beginPath(); gx.moveTo(x, 0); gx.lineTo(x, Hh); gx.stroke(); }
  $('edtitle').textContent = nameOf(s); $('edsub').textContent = ` · ${s.length.toFixed(1)}m × ${s.height.toFixed(1)}m`;
  $('ed').classList.add('show'); $('map').style.display = 'none';
  const r = wrap.getBoundingClientRect(), fit = Math.min(r.width / W, r.height / Hh) * .95;
  view.s = su != null ? Math.max(fit, Math.min(2, r.height / Hh * .9)) : fit;
  const cx = su != null ? su * k : W / 2, cy = sv != null ? Hh - sv * k : Hh / 2;
  view.x = r.width / 2 - cx * view.s; view.y = r.height / 2 - cy * view.s; applyView(); costTxt(); updLive();
  const ping = () => api('/presence', { method: 'POST', body: { sheet: s.id } }).catch(() => {}); ping(); clearInterval(presT); presT = setInterval(ping, 10000);
}
const applyView = () => { paper.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.s})`; };
const snap = () => { undo.push(ctx.getImageData(0, 0, cv.width, cv.height)); if (undo.length > 20) undo.shift(); redo = []; };

// 올리기: 펜을 떼고 0.6초 동안 더 안 그리면, 아직 안 올린 획을 한 장으로 올린다
const schedule = () => { clearTimeout(sendT); sendT = setTimeout(flush, 600); };
async function flush() {
  clearTimeout(sendT); if (!cur || sending) { if (sending) schedule(); return; }
  const b = scan(cv); if (!b) { pendMode = null; return; }
  const s = cur.s, k = cur.k, mode = pendMode || 'paint';
  const area = Math.min(b.n / (k * k), b.w * b.h / (PPM * PPM));
  if (area > inkNow() + 1e-6) { toast(`물감이 ${(area - inkNow()).toFixed(1)}㎡ 모자라 아직 못 올렸어요. 되돌리기로 줄이거나 「물감 모으기」에서 퀴즈를 풀어 주세요.`, 4500); return; }
  const crop = newCanvas(b.w, b.h), cg = crop.getContext('2d'); cg.drawImage(cv, -b.x, -b.y);
  if (mode === 'erase') { cg.globalCompositeOperation = 'source-in'; cg.fillStyle = '#000'; cg.fillRect(0, 0, b.w, b.h); } // 지우기 장은 모양만 있으면 됨
  fx.clearRect(0, 0, fl.width, fl.height); fx.drawImage(cv, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); undo = []; redo = []; pendMode = null;
  sending = true; updLive();
  try {
    const j = await api('/patches', { method: 'POST', body: { sheet: s.id, x: b.x, y: b.y, w: b.w, h: b.h, area, front: true, mode, png: crop.toDataURL('image/png') } });
    const p = j.patch; IMG.set(p.id, crop); MINE.add(p.id); MYSENT.push(p); addPatch(p);
    const A = art.get(s.id); if (A && p.id > A.maxId) { drawPatch(A.c.getContext('2d'), p); A.maxId = p.id; measure(A); await map.sheetPaint(s.id, A.c.toDataURL(), { front: true }); } else await paintSheet(s.id, null);
    updCover(); if (cur && cur.s.id === s.id) drawBase();
  } catch (e) {
    toast(e.message, 4000);
    if (cur && cur.s.id === s.id) { ctx.globalCompositeOperation = 'destination-over'; ctx.drawImage(fl, 0, 0); ctx.globalCompositeOperation = 'source-over'; pendMode = mode; }
  } finally { fx.clearRect(0, 0, fl.width, fl.height); sending = false; updLive(); if (cur) costTxt(); }
}
// 되돌리기: 안 올린 획이 있으면 그것부터, 없으면 내가 올린 마지막 장을 서버에서 지움(물감은 돌려받음)
$('undo').onclick = async () => {
  if (undo.length) { clearTimeout(sendT); redo.push(ctx.getImageData(0, 0, cv.width, cv.height)); ctx.putImageData(undo.pop(), 0, 0); costTxt(); if (scan(cv)) schedule(); else pendMode = null; return; }
  const p = MYSENT.filter(q => !hiddenSet.has(q.id)).pop(); if (!p) { toast('되돌릴 것이 없어요.'); return; }
  try { await api(`/patches/${p.id}`, { method: 'DELETE' }); hiddenSet.add(p.id); const l = PATCHES.get(p.sheet) || [], i = l.findIndex(q => q.id === p.id); if (i >= 0) l.splice(i, 1); await paintSheet(p.sheet, null); updCover(); toast('방금 칠한 것을 되돌렸어요. 물감도 돌려받았어요.'); } catch (e) { toast(e.message); }
};
$('redo').onclick = () => { if (!redo.length) return; undo.push(ctx.getImageData(0, 0, cv.width, cv.height)); ctx.putImageData(redo.pop(), 0, 0); costTxt(); schedule(); };
$('edclose').onclick = async () => {
  await flush(); for (let i = 0; i < 40 && sending; i++) await new Promise(r => setTimeout(r, 100));
  if (scan(cv)) { toast('물감이 모자라 올리지 못한 획은 지워졌어요.', 4000); }
  clearInterval(presT); api('/presence', { method: 'POST', body: { sheet: null } }).catch(() => {});
  $('ed').classList.remove('show'); $('map').style.display = ''; cur = null; drawPane();
};

const toPaper = (cx, cy) => { const r = wrap.getBoundingClientRect(); return [(cx - r.left - view.x) / view.s, (cy - r.top - view.y) / view.s]; };
const P = new Map(); let drawing = null, pinch = null;
wrap.addEventListener('contextmenu', e => e.preventDefault());
function begin(mode) { // 칠하기와 지우기는 따로 올린다
  if (pendMode && pendMode !== mode && scan(cv)) flush();
  if (inkNow() - (cur ? pendArea() : 0) <= 0.05) { toast('물감이 다 떨어졌어요. 조금 기다리거나 「물감 모으기」에서 퀴즈를 풀어 주세요.', 3500); return false; }
  pendMode = mode; clearTimeout(sendT); return true;
}
wrap.addEventListener('pointerdown', e => {
  wrap.setPointerCapture(e.pointerId); if (e.pointerType === 'pen') penSeen = true;
  const draws = e.pointerType === 'pen' || (e.pointerType === 'mouse' && e.button === 0) || (e.pointerType === 'touch' && !penSeen && P.size === 0);
  P.set(e.pointerId, { x: e.clientX, y: e.clientY, draws, t: e.pointerType });
  if (P.size > 1) { if (drawing) { ctx.putImageData(undo.pop(), 0, 0); drawing = null; } pinch = null; return; }
  if (!draws) return;
  const [x, y] = toPaper(e.clientX, e.clientY);
  if (tool === 'who') { toast(whoTxt(whoAt(cur.s.id, Math.floor(x), Math.floor(y))).replace(/&[a-z]+;/g, ''), 3500); return; }
  if (!begin(tool === 'erase' ? 'erase' : 'paint')) return;
  if (tool === 'fill') { snap(); flood(Math.floor(x), Math.floor(y)); costTxt(); schedule(); return; }
  snap(); drawing = { x, y }; dot(x, y, e);
});
wrap.addEventListener('pointermove', e => {
  const p = P.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  if (P.size === 2) { const [a, b] = [...P.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2; if (pinch) zoomAt(mx, my, d / pinch.d, mx - pinch.mx, my - pinch.my); pinch = { d, mx, my }; return; }
  if (drawing) { const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e]; for (const q of evs) { const [x, y] = toPaper(q.clientX, q.clientY); line(drawing.x, drawing.y, x, y, q); drawing = { x, y }; } return; }
  if (!p.draws || e.buttons === 2) { view.x += dx; view.y += dy; applyView(); }
});
const end = e => { P.delete(e.pointerId); if (P.size < 2) pinch = null; if (drawing) { drawing = null; costTxt(); schedule(); } };
wrap.addEventListener('pointerup', end); wrap.addEventListener('pointercancel', end);
wrap.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * .0015), 0, 0); }, { passive: false });
function zoomAt(cx, cy, f, dx, dy) { const r = wrap.getBoundingClientRect(), x = cx - r.left, y = cy - r.top, ns = Math.max(.05, Math.min(8, view.s * f)); view.x = x - (x - view.x) * ns / view.s + dx; view.y = y - (y - view.y) * ns / view.s + dy; view.s = ns; applyView(); }
const width = e => size * (e.pointerType === 'pen' ? .25 + .95 * (e.pressure || .5) : 1);
function style(e) { ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = ctx.fillStyle = tool === 'erase' ? PAPER : color; ctx.lineCap = ctx.lineJoin = 'round'; ctx.lineWidth = width(e); }
function dot(x, y, e) { style(e); ctx.beginPath(); ctx.arc(x, y, width(e) / 2, 0, Math.PI * 2); ctx.fill(); }
function line(x0, y0, x1, y1, e) { style(e); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
// 채우기: 보이는 모습(모두의 그림 + 내 획)에서 비슷한 색으로 이어진 곳을 찾아 내 판에 칠한다
function flood(x, y) {
  const W = cv.width, H = cv.height; if (x < 0 || y < 0 || x >= W || y >= H) return;
  const comp = newCanvas(W, H), cg = comp.getContext('2d'); cg.drawImage(bs, 0, 0); cg.drawImage(fl, 0, 0); cg.drawImage(cv, 0, 0);
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
let tab = 'earn', QUIZ = [], MYANS = new Map(), openB = new Set();
let QUESTS = []; try { QUESTS = (await (await fetch('../quest/data/quests.json')).json()).quests.filter(q => !['찾기', '비교'].includes(q.type)).slice(0, 8); } catch (e) {}
async function loadEarn() { try { const [a, b] = await Promise.all([api('/quizzes'), api('/answers')]); QUIZ = a.quizzes; MYANS = new Map(b.answers.map(r => [r.qkey, r])); } catch (e) { toast(e.message); } }
function wallsPane() {
  const total = [...PRES.values()].reduce((a, b) => a + b, 0);
  return `<div class="how">3D 지도에서 <b>벽을 누르거나</b> 아래에서 골라요. 한 벽을 모두가 같이 써요. ${total ? `<br><span class="drawing">✏️ 지금 ${total}명이 그리는 중</span>` : ''}</div>` +
    BUILD.map(bn => { const ss = SHEETS.filter(s => s.building === bn && s.length >= 6); if (!ss.length) return '';
      const area = ss.reduce((t, s) => t + ((art.get(s.id) || {}).area || 0), 0), pres = ss.reduce((t, s) => t + (PRES.get(s.id) || 0), 0);
      return `<details class="bld" data-b="${esc(bn)}"${openB.has(bn) ? ' open' : ''}><summary>${esc(bn)}${pres ? ` <span class="drawing">✏️${pres}</span>` : ''}<small>${area > .05 ? m2(area) + '㎡ 칠함' : '하얀 벽'}</small></summary>` +
        ss.map(s => { const A = art.get(s.id), n = PRES.get(s.id) || 0;
          return `<button class="sheet" data-id="${s.id}"><span class="th" style="${A && A.area > .05 ? `background-image:url(${A.thumb})` : ''}"></span><span style="flex:1">${esc(nameOf(s))}<br><small>${s.length.toFixed(0)}m × ${s.height.toFixed(0)}m${A && A.area > .05 ? ' · ' + m2(A.area) + '㎡ 칠함' : ''}${n ? ` · <span class="drawing">✏️ ${n}명</span>` : ''}</small></span></button>`; }).join('') + '</details>'; }).join('');
}
function earnPane() {
  const r = RULES;
  const quiz = QUIZ.map(q => `<div class="q${q.done ? ' done' : ''}"><b>${esc(q.q)}</b>${q.done
    ? `<div>${q.ok ? `<span class="ok">✓ 정답! 물감 ${r.QUIZ_INK}㎡ · 1점</span>` : `<span class="bad">정답: ${esc(q.answer)}</span>`}</div><div class="why">${esc(q.why)}</div>`
    : `<div class="opts" style="margin-top:6px">${q.options.map(o => `<button data-qz="${q.id}" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>`}</div>`).join('');
  const quest = QUESTS.map(q => { const a = MYANS.get(q.id);
    const st = !a ? '' : a.confirmed == null ? `<span class="pend">⏳ 내 답 「${esc(a.value)}」 · 다른 사람 답과 맞으면 ${r.ANSWER_PT}점이 들어와요</span>` : a.confirmed === a.value ? `<span class="ok">✓ 확정된 답과 같아요! ${r.ANSWER_PT}점</span>` : `<span class="bad">확정된 답: ${esc(a.confirmed)}</span>`;
    const canAns = !a || a.confirmed == null;
    return `<div class="q${a && a.confirmed != null ? ' done' : ''}"><b>${esc(q.title)}</b><p>${esc(q.q)}</p>${st ? `<div>${st}</div>` : ''}${canAns ? `<div class="opts" style="margin-top:6px">${q.options.slice(0, 8).map(o => `<button data-qk="${q.id}" data-v="${esc(o)}" ${a && a.value === o ? 'style="border-color:#244f3d;font-weight:800"' : ''}>${esc(o)}</button>`).join('')}</div>` : ''}</div>`; }).join('');
  return `<div class="how">물감은 <b>한 시간에 ${r.INK_PER_H}㎡씩 ${r.INK_MAX}㎡까지</b> 저절로 차요. 더 칠하고 싶으면:<br><b>🧩 학교 퀴즈</b>는 정답이 있어서 맞히면 <b>바로</b> 물감 ${r.QUIZ_INK}㎡와 1점. 한 번만 풀 수 있어요.<br><b>📍 현장 질문</b>은 아직 정답을 몰라요. 그 자리에 가서 보고 답해 주세요. <b>3명 이상 같은 답</b>이 모이면 확정되고, 같은 답을 낸 사람 모두 <b>${r.ANSWER_PT}점</b>. 확정된 답은 3D 지도를 고치는 데 쓰여요.<br>점수는 소품 놓기·날씨 바꾸기에 써요(곧 열려요).</div>` +
    `<div class="sec">🧩 학교 퀴즈 (바로 보상)</div>${quiz || '<div class="how">불러오는 중…</div>'}<div class="sec">📍 현장 질문 (나중 보상)</div>${quest}`;
}
function drawPane() {
  const sc = $('pane').scrollTop; $('pane').innerHTML = earnPane(); $('pane').scrollTop = sc;
  $('pane').querySelectorAll('details.bld').forEach(d => d.ontoggle = () => { d.open ? openB.add(d.dataset.b) : openB.delete(d.dataset.b); });
}
$('pane').addEventListener('click', async e => {
  const t = e.target.closest('[data-qz],[data-qk],.sheet'); if (!t) return;
  if (t.dataset.qz) { try { const j = await api('/quiz', { method: 'POST', body: { id: t.dataset.qz, choice: t.dataset.v } }); toast(j.ok ? `정답! 물감 +${j.reward.ink}㎡, +${j.reward.points}점` : `아쉬워요. 정답: ${j.answer}`, 3500); await loadEarn(); drawPane(); } catch (er) { toast(er.message); } return; }
  if (t.dataset.qk) { try { const j = await api('/answer', { method: 'POST', body: { qkey: t.dataset.qk, value: t.dataset.v } }); toast(j.status === 'confirmed' ? '확정됐어요! 같은 답을 낸 사람 모두 점수를 받아요.' : j.status === 'different' ? '이미 확정된 답과 달라요. 다시 한번 봐 주세요.' : '답을 받았어요. 다른 사람 답과 맞으면 점수가 들어와요.', 3500); await loadEarn(); drawPane(); } catch (er) { toast(er.message); } return; }
  if (t.classList.contains('sheet')) openEditor(byId(t.dataset.id));
});

// ---------- 시작 ----------
$('startGo').onclick = async () => {
  const name = $('nick').value.trim() || ('익명' + Math.floor(100 + Math.random() * 900));
  try { await api('/me', { method: 'POST', body: { name } }); $('start').remove(); await enterFly(); } catch (e) { toast(e.message); }
};
try { await refresh(); } catch (e) { toast(e.message, 5000); }
updCover(); drawHotbar(); updMe();
if (AT) { $('start').remove(); document.body.classList.add('orbit'); $('enterBtn').style.display = 'none'; $('status').textContent = `📸 ${when(AT)}의 모습 (기록 보기)`; map.focus({ building: '니콜스관', zoom: 160 }).catch(() => {}); }
else if (me && me.name) { $('start').remove(); await enterFly(); }
// 실시간: 그리는 동안 2초, 둘러볼 땐 5초마다 새 획을 받는다(창을 안 볼 땐 쉼)
let tick = 0; setInterval(async () => { tick++; if (AT || replaying || document.hidden || tick % (cur ? 2 : 5)) return; try { await refresh(); } catch (_) {} }, 1000);
})().catch(e => { console.error(e); const p = document.getElementById('pane'); if (p) p.textContent = '불러오지 못했어요: ' + e.message; });
