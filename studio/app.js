// Time Bank Spirit Studio: one app to edit, generate and publish characters.
// Every tool works on the same genome (engine/schema.js); the character files are the genomes.
//   Edit      VRoid-style: outliner left, live model centre (click a part to select, drag it to move), inspector right
//   Breed     interactive evolution: 8 children spread out around the current one (Picbreeder / local MAP-Elites)
//   Blend     MetaHuman-style: three parents on a triangle, drag to mix
//   Describe  text → character with Claude (local dev server)
//   Sheet     turnaround + expressions;  Lineage  the family tree
import { createStage, setLook, setStage, normLook } from '../engine/press.js';
import { build } from '../engine/build.js';
import { bakeIdle } from '../engine/bake.js';
import { GLTFExporter } from '../vendor/GLTFExporter.js';
import * as S from '../engine/schema.js';
import { ROLES, ROLE_LABEL, FINISHES, PRINT_INKS, SCHEMES, STYLES, harmony, withPalette, oklch } from '../engine/palette.js';

const ROOT = new URL('../', import.meta.url);
const Q = new URLSearchParams(location.search);
const EXPORT = Q.has('export');
const $ = (id) => document.getElementById(id);
const clone = (x) => JSON.parse(JSON.stringify(x));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const getJSON = (p) => fetch(new URL(p, ROOT)).then(r => { if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.json(); });
const store = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };
if (EXPORT) document.body.classList.add('export');

// ---------- data ----------
const entries = await getJSON('characters/index.json');
const cast = {}, seriesOf = {};
await Promise.all(entries.map(async e => { const [series, id] = e.split('/'); cast[id] = await getJSON(`characters/${e}.json`); seriesOf[id] = series; }));
const order = entries.map(e => e.split('/').pop());
const lineage = await getJSON('characters/lineage.json').catch(() => ({ history: [] }));
const brand = await getJSON('brand/brand.json').catch(() => ({ palettes: {}, stage: {} }));
brand.palettes ||= {}; brand.stage ||= {};
setStage(brand.stage);
const LOCAL = !EXPORT && await fetch(new URL('api/ping', ROOT)).then(r => r.ok).catch(() => false);
if (Q.get('spec')) { const d = await getJSON(Q.get('spec')); cast[d.id] = d; seriesOf[d.id] = 'drafts'; order.push(d.id); }
const SERIES = [...new Set(Object.values(seriesOf))];

// ---------- state ----------
const MODES = [['edit', 'Edit'], ['breed', 'Breed'], ['blend', 'Blend'], ['describe', 'Describe'], ['sheet', 'Sheet'], ['lineage', 'Lineage']];
const OLD_MODE = { plate: 'edit', variants: 'breed', tree: 'lineage' };
const LOOK_LABEL = { studio: 'Studio', y2k: 'Y2K', toon: 'Toon', print: 'Print' };
const main = order.filter(id => !cast[id].seed_of);
const startKey = cast[Q.get('c')] ? Q.get('c') : cast[store.get('tbs-key')] ? store.get('tbs-key') : main[0];
const state = {
  key: startKey, spec: clone(cast[startKey]),
  mode: (() => { const m = OLD_MODE[Q.get('mode')] || Q.get('mode') || store.get('tbs-mode') || 'edit'; return MODES.some(x => x[0] === m) ? m : 'edit'; })(),
  look: normLook(Q.get('look') || store.get('tbs-look') || 'y2k'),
  sel: 'body', locks: new Set(), yaw: +(Q.get('yaw') || 0.35), tilt: 0.08, zoom: 1, paused: false,
  amount: 0.5, breedSeed: +(Q.get('seed') || 1),
  blend: { ids: [startKey, ...main.filter(k => k !== startKey).slice(0, 2)], at: [1 / 3, 1 / 3, 1 / 3] },
};
const edits = {}; // working copies of characters edited this session, by cast key
const dirty = new Set();

// ---------- history ----------
const past = [], future = [];
const snap = () => JSON.stringify(state.spec);
let gesture = null; // snapshot taken when a slider drag starts
function pushPast(before) { past.push(before); if (past.length > 300) past.shift(); future.length = 0; }
function begin() { if (gesture == null) gesture = snap(); }
function end() { if (gesture != null && gesture !== snap()) { pushPast(gesture); touched(); } gesture = null; syncTop(); }
// change(fn, kind): fn edits the spec in place or returns a new one. kind: 'shape' rebuilds, 'paint' re-skins
function change(fn, kind = 'shape') {
  const before = snap();
  const r = fn(state.spec); if (r) state.spec = r;
  if (snap() === before) return;
  pushPast(before); touched(); apply(kind); renderPanels();
}
function touched() { edits[state.key] = state.spec; dirty.add(state.key); }
function undo() { if (!past.length) return; future.push(snap()); state.spec = JSON.parse(past.pop()); touched(); apply('shape'); renderPanels(); }
function redo() { if (!future.length) return; past.push(snap()); state.spec = JSON.parse(future.pop()); touched(); apply('shape'); renderPanels(); }

// ---------- stage ----------
const canvas = $('c'), view = $('view');
let stage;
try { stage = createStage(canvas, { preserve: EXPORT, antialias: !EXPORT }); }
catch (e) { view.insertAdjacentHTML('beforeend', '<p class="hud tl">WebGL is not available on this device.</p>'); throw e; }
const THREE = stage.THREE;
let ch = null, actors = [], kids = [], blendSpec = null;
let selBox = null, selTargets = [];

function addGround(c) {
  c.still(true); c.up(2.5);
  const b = new THREE.Box3().setFromObject(c.obj);
  const size = b.getSize(new THREE.Vector3()), mid = b.getCenter(new THREE.Vector3());
  c.frame = { dist: Math.max(size.y, size.x * 0.85, size.z * 0.85) / (2 * Math.tan(Math.PI / 12)) * 1.1 + size.z / 2, lift: mid.y };
  const g = new THREE.Mesh(new THREE.CircleGeometry(12, 64), new THREE.ShadowMaterial({ opacity: 0.2 }));
  g.rotation.x = -Math.PI / 2; g.position.y = b.min.y - 0.01; g.userData.ground = true; g.receiveShadow = true;
  c.obj.add(g); c.still(EXPORT);
}
function actor(spec) {
  const c = build(spec); addGround(c); setLook(c.obj, state.look);
  stage.scene.add(c.obj); actors.push(c); return c;
}
function clearActors() {
  actors.forEach(a => { stage.scene.remove(a.obj); a.obj.traverse(o => o.geometry && o.geometry.dispose()); });
  actors = []; kids = []; ch = null;
}
function solo(a) { actors.forEach(x => { x.obj.visible = x === a; }); }

// rebuild what the current mode shows
let buildTimer = 0;
function rebuild() {
  clearActors();
  if (state.mode === 'lineage') { drawTree(); return; }
  if (state.mode === 'blend') { blendSpec = S.blend(state.blend.ids.map(k => edits[k] || cast[k]), state.blend.at); ch = actor(blendSpec); }
  else ch = actor(state.spec);
  if (state.mode === 'breed') kids = S.breed(state.spec, state.breedSeed, 8, state.amount, state.locks).map(s => ({ spec: s, a: actor(s) }));
  highlight();
  hud();
}
const later = (ms = 70) => { clearTimeout(buildTimer); buildTimer = setTimeout(rebuild, ms); };
function apply(kind) {
  if (kind === 'none') { hud(); return; }
  if (kind === 'paint' && ch && state.mode !== 'blend') {
    ch.obj.userData.palette = withPalette(state.spec.palette); setLook(ch.obj, state.look);
    if (state.mode === 'breed') later(200);
    hud(); return;
  }
  later();
}
function reskinAll() { actors.forEach(a => setLook(a.obj, state.look)); }

// ---------- selection ----------
function findSel(root, sel) {
  const out = [];
  if (!root || !sel) return out;
  if (sel === 'pose') return [];
  root.traverse(o => { if (o.userData.sel === sel) out.push(o); });
  return out;
}
function highlight() {
  if (selBox) { stage.scene.remove(selBox); selBox = null; }
  selTargets = state.mode === 'edit' && ch ? findSel(ch.obj, state.sel).filter(visibleChain) : [];
  if (!selTargets.length) return;
  selBox = new THREE.Box3Helper(new THREE.Box3(), 0xe8ff00);
  selBox.material.depthTest = false; selBox.renderOrder = 999; selBox.userData.helper = true;
  stage.scene.add(selBox);
}
function updateBox() {
  if (!selBox) return;
  selBox.visible = !EXPORT && state.look !== 'print' && state.mode === 'edit';
  const b = selBox.box.makeEmpty();
  selTargets.forEach(o => b.expandByObject(o));
}
function visibleChain(o) { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; }
function select(sel) {
  state.sel = sel;
  if (!['edit', 'sheet'].includes(state.mode) && !['brand', 'add'].includes(sel)) setMode('edit');
  highlight(); renderPanels();
}

// ---------- views ----------
const mainView = (c) => ({ x: 0, y: 0, w: 1, h: 1, yaw: state.yaw, tilt: state.tilt, dist: c.frame.dist * state.zoom, lift: c.frame.lift, fit: true, before: actors.length > 1 ? () => solo(c) : null });
function views(t) {
  if (!ch) return [];
  if (state.mode === 'breed') {
    const cells = [...kids.slice(0, 4).map(k => k.a), ch, ...kids.slice(4).map(k => k.a)];
    return cells.map((a, i) => ({ x: (i % 3) / 3, y: 1 - (Math.floor(i / 3) + 1) / 3, w: 1 / 3, h: 1 / 3, yaw: state.yaw, tilt: state.tilt, dist: a.frame.dist * 1.05, lift: a.frame.lift, fit: true, before: () => solo(a) }));
  }
  if (state.mode === 'sheet') {
    const out = [], rest = () => { ch.still(true); ch.up(2.5); ch.obj.children[0].rotation.y = 0; };
    [0, Math.PI / 4, Math.PI / 2, Math.PI].forEach((a, i) => out.push({ x: i / 4, y: 0.36, w: 1 / 4, h: 0.64, yaw: a, tilt: 0.04, dist: ch.frame.dist, lift: ch.frame.lift, fit: true, before: () => { ch.setExpression(ch.spec.expression || 'quiete'); rest(); } }));
    rest(); const face = ch.face();
    ch.expressions.forEach((e, i) => out.push({ x: i / 6, y: 0, w: 1 / 6, h: 0.36, yaw: 0.15, tilt: 0.1, dist: ch.spec.faceDist || Math.max(2.6, ch.frame.dist * 0.42), lift: face.y - 0.12, before: () => { ch.setExpression(e); rest(); } }));
    return out;
  }
  return [mainView(ch)];
}

// ---------- viewport interaction: orbit, zoom, click to select, drag a selected part ----------
const ray = new THREE.Raycaster();
let drag = null;
function ndc(e) { const r = canvas.getBoundingClientRect(); return new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); }
function pick(e) {
  if (!ch) return null;
  ray.setFromCamera(ndc(e), stage.camera); // the camera is still in the main view's pose from the last frame
  for (const h of ray.intersectObject(ch.obj, true)) {
    if (h.object.userData.ground || !visibleChain(h.object)) continue;
    let o = h.object; while (o && !o.userData.sel) o = o.parent;
    if (o) return { sel: o.userData.sel, obj: o, point: h.point };
  }
  return null;
}
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  drag = { x: e.clientX, y: e.clientY, yaw: state.yaw, tilt: state.tilt, moved: false };
  if (state.mode !== 'edit' || !state.sel.startsWith('part:')) return;
  const hit = pick(e);
  if (!hit || hit.sel !== state.sel) return;
  // drag the selected part on a plane facing the camera (Spore-style placement)
  const n = new THREE.Vector3(); stage.camera.getWorldDirection(n);
  drag.part = { obj: hit.obj, plane: new THREE.Plane().setFromNormalAndCoplanarPoint(n, hit.point), from: hit.obj.parent.worldToLocal(hit.point.clone()), pos: hit.obj.position.clone() };
  canvas.classList.add('moving');
});
canvas.addEventListener('pointermove', e => {
  if (!drag) return;
  if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 4) drag.moved = true;
  if (drag.part) {
    ray.setFromCamera(ndc(e), stage.camera);
    const p = new THREE.Vector3(); if (!ray.ray.intersectPlane(drag.part.plane, p)) return;
    const d = drag.part.obj.parent.worldToLocal(p).sub(drag.part.from);
    drag.part.obj.position.copy(drag.part.pos).add(d); drag.part.d = d;
    return;
  }
  state.yaw = drag.yaw - (e.clientX - drag.x) * 0.008;
  state.tilt = Math.max(-0.9, Math.min(1.2, drag.tilt + (e.clientY - drag.y) * 0.006));
});
canvas.addEventListener('pointerup', e => {
  const d = drag; drag = null; canvas.classList.remove('moving');
  if (!d) return;
  if (d.part && d.part.d) {
    const n = +state.sel.split(':')[1], v = d.part.d;
    change(s => { const p = s.parts[n]; const m = p.move || [0, 0, 0]; p.move = [m[0] + v.x, m[1] + v.y, m[2] + v.z].map(x => +x.toFixed(3)); }, 'none');
    return;
  }
  if (d.moved) return;
  if (state.mode === 'breed') return adoptAt(e);
  if (state.mode === 'edit') { const hit = pick(e); if (hit) select(hit.sel); }
});
canvas.addEventListener('wheel', e => { if (!['edit', 'blend', 'describe'].includes(state.mode)) return; e.preventDefault(); state.zoom = Math.max(0.35, Math.min(2, state.zoom * (1 + e.deltaY * 0.001))); }, { passive: false });

function adoptAt(e) {
  const r = canvas.getBoundingClientRect();
  const i = Math.floor((e.clientX - r.left) / r.width * 3) + 3 * Math.floor((e.clientY - r.top) / r.height * 3);
  if (i === 4) return;
  const kid = kids[i < 4 ? i : i - 1]; if (!kid) return;
  change(() => clone(kid.spec), 'none');
  state.breedSeed++; later(0);
  toast(`Adopted ${kid.spec.name}. Here are its children.`);
}

// ---------- top bar ----------
$('modes').innerHTML = MODES.map(([k, t]) => `<button role="tab" data-m="${k}">${t}</button>`).join('');
$('modes').onclick = (e) => { const b = e.target.closest('button'); if (b) setMode(b.dataset.m); };
$('looks').innerHTML = Object.entries(LOOK_LABEL).map(([k, t]) => `<button data-l="${k}">${t}</button>`).join('');
$('looks').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; state.look = b.dataset.l; reskinAll(); syncTop(); };
$('undo').onclick = undo; $('redo').onclick = redo;
$('random').onclick = () => randomizeAll();
$('newChar').onclick = () => newCharacter();
$('pause').onclick = () => { state.paused = !state.paused; $('pause').setAttribute('aria-pressed', state.paused); $('pause').textContent = state.paused ? 'Play' : 'Pause'; };
$('frame').onclick = () => { state.yaw = 0.35; state.tilt = 0.08; state.zoom = 1; };
function setMode(m) {
  state.mode = m; showTree(m === 'lineage');
  if (m === 'blend' && !state.blend.ids.includes(state.key)) state.blend.ids[0] = state.key;
  rebuild(); renderPanels();
}
function syncTop() {
  $('modes').querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', b.dataset.m === state.mode));
  $('looks').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.l === state.look));
  $('undo').disabled = !past.length; $('redo').disabled = !future.length;
  store.set('tbs-key', state.key); store.set('tbs-mode', state.mode); store.set('tbs-look', state.look);
}
const HINTS = {
  edit: 'Drag to orbit · scroll to zoom · click a part to select it · drag a selected apparatus part to move it',
  breed: 'Click a child to adopt it; its children appear around it. Locked genes never change.',
  blend: 'Drag the point inside the triangle to mix the three parents.',
  describe: 'Describe a character in words; Claude writes the genome, you refine it here.',
  sheet: 'Turnaround and the six expressions.', lineage: 'Click a character to open it.',
};
function hud() {
  const s = state.mode === 'blend' && blendSpec ? blendSpec : state.spec;
  $('hudName').textContent = s.name || s.id;
  $('hudId').textContent = `${s.id}${dirty.has(state.key) && state.mode !== 'blend' ? ' · unsaved' : ''}`;
  $('hint').textContent = HINTS[state.mode];
}

// ---------- save ----------
const saveMenu = $('saveMenu');
$('saveBtn').onclick = () => {
  const open = saveMenu.hidden; saveMenu.hidden = !open; $('saveBtn').setAttribute('aria-expanded', open);
  if (!open) return;
  const id = esc(S.validate(state.spec).id);
  saveMenu.innerHTML = (LOCAL
    ? `<button data-a="draft">Save draft<small>characters/drafts/${id}.json</small></button>` + SERIES.filter(s => s !== 'drafts').map(s => `<button data-a="pub:${s}">Publish to ${esc(s)}<small>characters/${esc(s)}/${id}.json + index</small></button>`).join('') + '<hr>'
    : `<button disabled><small>Run <b>npm run dev</b> to save into the project. On the site you can download.</small></button><hr>`)
    + `<button data-a="json">Download JSON</button><button data-a="glb">Download .glb<small>with its idle animation</small></button>`;
};
saveMenu.onclick = async (e) => {
  const b = e.target.closest('button[data-a]'); if (!b) return;
  saveMenu.hidden = true; $('saveBtn').setAttribute('aria-expanded', false);
  const a = b.dataset.a, spec = S.validate(state.spec);
  if (a === 'json') return download(`${spec.id}.json`, new Blob([JSON.stringify(spec, null, 2) + '\n'], { type: 'application/json' }));
  if (a === 'glb') return downloadGLB();
  const to = a === 'draft' ? 'drafts' : a.slice(4);
  const r = await fetch(new URL('api/character', ROOT), { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ spec, to }) }).then(r => r.json()).catch(err => ({ error: err.message }));
  if (r.error) return toast(r.error, true);
  // the saved file becomes the cast entry
  if (state.key !== r.spec.id) { delete edits[state.key]; dirty.delete(state.key); }
  cast[r.spec.id] = r.spec; seriesOf[r.spec.id] = to; if (!order.includes(r.spec.id)) order.push(r.spec.id);
  state.key = r.spec.id; state.spec = clone(r.spec); delete edits[state.key]; dirty.delete(state.key);
  renderPanels(); hud(); toast(`Saved ${r.path}`);
};
addEventListener('click', e => { if (!e.target.closest('.menu-wrap')) { saveMenu.hidden = true; $('saveBtn').setAttribute('aria-expanded', false); } });
function download(name, blob) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function downloadGLB() {
  const c = build(state.spec); c.still(true); setLook(c.obj, 'studio');
  const clip = bakeIdle(c);
  new GLTFExporter().parse(c.obj, (buf) => download(`${state.spec.id}.glb`, new Blob([buf], { type: 'model/gltf-binary' })), (e) => toast(e.message, true), { binary: true, animations: [clip] });
}

// ---------- characters ----------
function openCharacter(key) {
  if (state.key === key && state.mode !== 'lineage') return;
  state.key = key; state.spec = clone(edits[key] || cast[key]);
  past.length = 0; future.length = 0; state.sel = 'body';
  if (state.mode === 'lineage') state.mode = 'edit';
  setMode(state.mode);
}
function adoptNew(spec, note) {
  let key = spec.id; while (cast[key] && !edits[key]) key += '-2';
  spec.id = key; cast[key] ||= spec; seriesOf[key] ||= 'drafts'; if (!order.includes(key)) order.push(key);
  const before = snap();
  state.key = key; state.spec = spec; edits[key] = spec; dirty.add(key);
  pushPast(before); state.sel = 'body';
  if (state.mode === 'lineage' || state.mode === 'describe' && !note) state.mode = 'edit';
  setMode(state.mode);
  if (note) toast(note);
}
const seed = () => Math.floor(Math.random() * 1e6);
function newCharacter() { const s = seed(); adoptNew(S.randomize(s), `New random character (seed ${s})`); }
function randomizeAll() {
  const s = seed();
  change(sp => { const r = S.randomize(s, new Set([...state.locks, 'id']), sp); r.id = sp.id; r.name = sp.name; return r; });
  toast(state.locks.size ? `Randomized, ${state.locks.size} locked gene${state.locks.size > 1 ? 's' : ''} kept` : 'Randomized. Lock genes to keep them next time');
}

// ---------- left: cast + outliner ----------
function primaryOf(s) { return withPalette(s.palette).primary.color; }
function renderCast() {
  const groups = {};
  order.forEach(k => { if (cast[k].seed_of && !edits[k]) return; (groups[seriesOf[k]] ||= []).push(k); });
  $('cast').innerHTML = Object.entries(groups).map(([g, ks]) => `<div class="series">${esc(g)}</div>` + ks.map(k => {
    const s = edits[k] || cast[k];
    return `<button class="row" data-k="${esc(k)}" aria-current="${k === state.key}"><i class="dot" style="background:${primaryOf(s)}"></i><span class="grow">${esc(s.name || k)}</span>${dirty.has(k) ? '<span class="k">●</span>' : ''}</button>`;
  }).join('')).join('');
}
$('cast').onclick = (e) => { const b = e.target.closest('[data-k]'); if (b) openCharacter(b.dataset.k); };

const ANAT = S.ANATOMY.map(a => [a.id, a.label]);
function renderOutliner() {
  const s = state.spec, P = withPalette(s.palette);
  const row = (sel, label, extra = '', dot = '') => `<button class="row" data-sel="${sel}" aria-selected="${state.sel === sel && ['edit', 'sheet'].includes(state.mode)}">${dot}<span class="grow">${label}</span>${extra}</button>`;
  $('outTitle').textContent = s.name || s.id;
  $('outliner').innerHTML =
    row('identity', 'Identity', `<span class="k">${esc(s.id)}</span>`) +
    '<h3>Anatomy</h3>' + ANAT.map(([k, l]) => row(k, l, state.locks.has(`group:${k}`) ? `<span class="k">${ICON.lock}</span>` : '')).join('') +
    '<h3>Colour</h3>' + row('palette', 'Palette', '', `<i class="dot" style="background:conic-gradient(${ROLES.map(r => P[r].color).join(',')})"></i>`) +
    '<h3>Apparatus</h3>' + (s.parts || []).map((p, n) => row(`part:${n}`, esc(S.PARTS[p.type]?.label || p.type), `<span class="x" data-del="${n}" title="Remove" role="button" aria-label="Remove ${esc(p.type)}">✕</span>`)).join('') +
    `<button class="row add" data-sel="add">+ Add part</button>` +
    '<h3>Brand</h3>' + row('brand', 'Stage & palettes');
}
$('outliner').onclick = (e) => {
  const del = e.target.closest('[data-del]');
  if (del) { e.stopPropagation(); removePart(+del.dataset.del); return; }
  const b = e.target.closest('[data-sel]'); if (b) select(b.dataset.sel);
};
function removePart(n) {
  change(s => { s.parts.splice(n, 1); });
  if (state.sel.startsWith('part:')) state.sel = 'add';
  renderPanels();
}

// ---------- right: inspector ----------
const pct = (inp) => inp.style.setProperty('--p', `${(inp.value - inp.min) / (inp.max - inp.min) * 100}%`);
const ICON = {
  lock: '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor"/><path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  open: '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M5 7V5a3 3 0 0 1 5.6-1.5" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
  die: '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="5.6" cy="5.6" r="1.1" fill="currentColor"/><circle cx="10.4" cy="10.4" r="1.1" fill="currentColor"/><circle cx="8" cy="8" r="1.1" fill="currentColor"/></svg>',
};
const fmt = (g, v) => g.type === 'int' ? String(v) : (+v).toFixed(2);
function geneRows(list) {
  // list: [{ id, gene, value }]
  return list.map(({ id, gene: g, value: v }) => {
    const L = state.locks.has(id);
    const lock = `<button class="lock" data-lock="${id}" aria-pressed="${L}" title="${L ? 'Unlock' : 'Lock: Randomize and Breed keep it'}" aria-label="Lock ${esc(g.label)}">${L ? ICON.lock : ICON.open}</button>`;
    const die = `<button class="die" data-die="${id}" title="Random value" aria-label="Random ${esc(g.label)}">${ICON.die}</button>`;
    let ctl;
    if (g.type === 'enum') ctl = `<select class="wide" data-g="${id}" aria-label="${esc(g.label)}">${g.options.map(o => `<option value="${o}" ${o === v ? 'selected' : ''}>${esc(S.INK_ROLE[o] && g.label === 'Colour role' ? `${S.INK_ROLE[o]}` : o)}</option>`).join('')}</select>`;
    else if (g.type === 'bool') ctl = `<span class="wide"><button class="toggle" role="switch" data-g="${id}" aria-checked="${!!v}" aria-label="${esc(g.label)}"></button></span>`;
    else ctl = `<input type="range" data-g="${id}" min="${g.min}" max="${g.max}" step="${g.type === 'int' ? 1 : (g.max - g.min) / 200}" value="${v}" aria-label="${esc(g.label)}"><input type="number" data-n="${id}" min="${g.min}" max="${g.max}" step="${g.type === 'int' ? 1 : 0.01}" value="${fmt(g, v)}" aria-label="${esc(g.label)} value">`;
    return `<div class="gene ${L ? 'locked' : ''}"><label>${esc(g.label)}</label>${ctl}${lock}${die}</div>`;
  }).join('');
}
function geneById(id) { return S.genes(state.spec).find(x => x.id === id); }
function rollOne(g) {
  if (g.type === 'enum') return g.options[Math.floor(Math.random() * g.options.length)];
  if (g.type === 'bool') return Math.random() < 0.7;
  const v = g.min + Math.random() * (g.max - g.min);
  return g.type === 'int' ? Math.round(v) : +v.toFixed(3);
}
// shared handlers for gene controls inside the inspector
function wireGenes(root) {
  root.querySelectorAll('input[type=range][data-g]').forEach(inp => {
    pct(inp);
    inp.addEventListener('input', () => {
      begin(); const x = geneById(inp.dataset.g); const v = x.gene.type === 'int' ? Math.round(+inp.value) : +(+inp.value).toFixed(3);
      S.setGene(state.spec, inp.dataset.g, v); pct(inp);
      root.querySelector(`[data-n="${inp.dataset.g}"]`).value = fmt(x.gene, v);
      touched(); apply('shape');
    });
    inp.addEventListener('change', end);
  });
  root.querySelectorAll('input[type=number][data-n]').forEach(inp => inp.addEventListener('change', () => {
    const x = geneById(inp.dataset.n); const v = Math.min(x.gene.max, Math.max(x.gene.min, +inp.value || 0));
    change(s => { S.setGene(s, inp.dataset.n, x.gene.type === 'int' ? Math.round(v) : v); });
  }));
  root.querySelectorAll('select[data-g]').forEach(sel => sel.addEventListener('change', () => change(s => { S.setGene(s, sel.dataset.g, sel.value); })));
  root.querySelectorAll('.toggle[data-g]').forEach(t => t.addEventListener('click', () => change(s => { S.setGene(s, t.dataset.g, t.getAttribute('aria-checked') !== 'true'); })));
  root.querySelectorAll('[data-lock]').forEach(b => b.addEventListener('click', () => { const id = b.dataset.lock; state.locks.has(id) ? state.locks.delete(id) : state.locks.add(id); renderPanels(); }));
  root.querySelectorAll('[data-die]').forEach(b => b.addEventListener('click', () => { const x = geneById(b.dataset.die); change(s => { S.setGene(s, b.dataset.die, rollOne(x.gene)); }); }));
}

function renderInspector() {
  const el = $('inspector');
  const m = state.mode;
  if (m === 'breed') return breedPanel(el);
  if (m === 'blend') return blendPanel(el);
  if (m === 'describe') return describePanel(el);
  if (m === 'lineage') { el.innerHTML = `<div class="ins"><div class="ih"><h1>Lineage</h1></div><p class="note">Every character descends from the chat's first plates. Children made with Breed, Blend or Describe keep a <code class="inline">parent</code>, so they join the tree when you save them.</p></div>`; return; }
  const sel = state.sel, s = state.spec;
  if (sel === 'palette') return palettePanel(el);
  if (sel === 'identity') return identityPanel(el);
  if (sel === 'add') return libraryPanel(el);
  if (sel === 'brand') return brandPanel(el);
  if (sel.startsWith('part:')) {
    const n = +sel.split(':')[1], p = s.parts?.[n];
    if (!p) { state.sel = 'body'; return renderInspector(); }
    const def = S.PARTS[p.type] || { label: p.type, genes: [] };
    const list = S.genes(s).filter(x => x.part === n);
    el.innerHTML = `<div class="ins"><div class="ih"><h1>${esc(def.label)}</h1></div><p class="note">${esc(def.note || '')}${def.anchored ? ' · rides on the crab' : ''}</p>
      ${geneRows(list.filter(x => !x.gene.common))}<div class="sub">Placement <span>drag it in the viewport</span></div>${geneRows(list.filter(x => x.gene.common))}
      <div class="actions"><button class="btn" id="pRand">Randomize part</button><button class="btn" id="pDup">Duplicate</button><button class="btn" id="pDel">Remove</button></div></div>`;
    wireGenes(el);
    $('pRand').onclick = () => change(sp => { def.genes.forEach(g => { if (!state.locks.has(`parts.${n}.${g.key}`)) S.set(sp.parts[n], g.key, rollOne(g)); }); });
    $('pDup').onclick = () => { change(sp => { const q = clone(sp.parts[n]); q.move = [(q.move?.[0] || 0) + 0.4, q.move?.[1] || 0, q.move?.[2] || 0]; sp.parts.push(q); }); select(`part:${state.spec.parts.length - 1}`); };
    $('pDel').onclick = () => removePart(n);
    return;
  }
  const grp = S.ANATOMY.find(a => a.id === sel) || S.ANATOMY[0];
  const list = S.genes(s).filter(x => x.group === grp.id);
  const allLocked = list.every(x => state.locks.has(x.id));
  el.innerHTML = `<div class="ins"><div class="ih"><h1>${esc(grp.label)}</h1><button class="mini" id="gLock">${allLocked ? 'Unlock all' : 'Lock all'}</button><button class="mini" id="gRand">Randomize</button></div>
    <p class="note">${grp.id === 'pose' ? 'Expression, scale and idle motion.' : 'Shared by every crab in the character, including the extra ones collective parts spawn.'}</p>${geneRows(list)}</div>`;
  wireGenes(el);
  $('gLock').onclick = () => { list.forEach(x => allLocked ? state.locks.delete(x.id) : state.locks.add(x.id)); allLocked ? state.locks.delete(`group:${grp.id}`) : state.locks.add(`group:${grp.id}`); renderPanels(); };
  $('gRand').onclick = () => change(sp => { list.forEach(x => { if (!state.locks.has(x.id)) S.setGene(sp, x.id, rollOne(x.gene)); }); });
}

function identityPanel(el) {
  const s = state.spec;
  el.innerHTML = `<div class="ins"><div class="ih"><h1>Identity</h1></div>
    <label class="field"><span>Name</span><input id="fName" value="${esc(s.name)}"></label>
    <label class="field"><span>File id (kebab-case)</span><input id="fId" value="${esc(s.id)}" pattern="[a-z0-9-]+"></label>
    <label class="field"><span>Concept</span><textarea id="fConcept">${esc(s.concept || '')}</textarea></label>
    <label class="field"><span>References (comma separated)</span><input id="fRefs" value="${esc((s.refs || []).join(', '))}"></label>
    <p class="note">Parent: <code class="inline">${esc(s.parent || 'none')}</code>${s.prompt ? `<br>Prompt: “${esc(s.prompt)}”` : ''}</p></div>`;
  const bind = (id, fn) => $(id).addEventListener('change', () => change(sp => { fn(sp, $(id).value); }, 'none'));
  bind('fName', (sp, v) => { sp.name = v; }); bind('fConcept', (sp, v) => { sp.concept = v; });
  bind('fId', (sp, v) => { sp.id = v.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '') || sp.id; });
  bind('fRefs', (sp, v) => { sp.refs = v.split(',').map(x => x.trim()).filter(Boolean); });
}

function libraryPanel(el) {
  const card = ([t, p]) => `<button class="card" data-t="${t}"><em>${p.series}</em><b>${esc(p.label)}</b><small>${esc(p.note)}</small></button>`;
  const by = (s) => Object.entries(S.PARTS).filter(([, p]) => p.series === s).map(card).join('');
  el.innerHTML = `<div class="ins"><div class="ih"><h1>Add part</h1></div><p class="note">The apparatus is what makes each crab a character. Parts attach where they belong; drag them to place.</p>
    <div class="sub">Angeli</div><div class="lib">${by('angeli')}</div><div class="sub">Collettivo</div><div class="lib">${by('collettivo')}</div></div>`;
  el.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { change(s => { (s.parts ||= []).push(S.newPart(b.dataset.t)); }); select(`part:${state.spec.parts.length - 1}`); });
}

function swatches(P) { return `<i>${ROLES.map(r => `<b style="background:${P[r].color}"></b>`).join('')}</i>`; }
function palettePanel(el) {
  const P = withPalette(state.spec.palette), L = state.locks.has('palette');
  const hue = +(store.get('tbs-hue') || 260), scheme = store.get('tbs-scheme') || 'triadic', style = store.get('tbs-style') || 'candy';
  el.innerHTML = `<div class="ins"><div class="ih"><h1>Palette</h1><button class="lock" id="palLock" aria-pressed="${L}" title="Lock the palette" aria-label="Lock the palette">${L ? ICON.lock : ICON.open}</button></div>
    <p class="note">Six roles, each a colour and a finish. Parts paint with roles, never with colours, so one palette restyles the whole character.</p>
    <div class="sub">Brand palettes</div><div class="chips">${Object.entries(brand.palettes).map(([n, p]) => `<button class="pchip" data-p="${esc(n)}">${swatches(withPalette(p))}${esc(n)}</button>`).join('')}</div>
    <div class="sub">Generate a harmony <span>OKLCH</span></div>
    <div class="gene"><label>Hue</label><input type="range" id="hHue" min="0" max="360" step="1" value="${hue}" class="wide" style="grid-column:2/4"><span></span><span></span></div>
    <div class="gene"><label>Scheme</label><select id="hScheme" style="grid-column:2/4">${Object.keys(SCHEMES).map(k => `<option ${k === scheme ? 'selected' : ''}>${k}</option>`).join('')}</select><span></span><span></span></div>
    <div class="gene"><label>Style</label><select id="hStyle" style="grid-column:2/4">${Object.keys(STYLES).map(k => `<option ${k === style ? 'selected' : ''}>${k}</option>`).join('')}</select><span></span><span></span></div>
    <div class="actions"><button class="btn primary" id="hGo">Apply harmony</button><button class="btn" id="hRand">Surprise me</button></div>
    <div class="sub">Roles <span>colour · finish · print ink</span></div>
    ${ROLES.map(r => `<div class="role"><input type="color" data-c="${r}" value="${P[r].color}" aria-label="${ROLE_LABEL[r]} colour"><span>${ROLE_LABEL[r]}<code>${P[r].color}</code></span>
      <select data-f="${r}" aria-label="${ROLE_LABEL[r]} finish">${FINISHES.map(f => `<option ${f === P[r].finish ? 'selected' : ''}>${f}</option>`).join('')}</select>
      <select data-i="${r}" aria-label="${ROLE_LABEL[r]} print ink">${PRINT_INKS.map(f => `<option ${f === P[r].print ? 'selected' : ''}>${f}</option>`).join('')}</select></div>`).join('')}
    <p class="note" style="margin-top:10px">Print ink: which press ink the role is screened with in the Print look.</p></div>`;
  const hh = $('hHue'); hh.style.setProperty('--p', `${hue / 3.6}%`);
  hh.style.background = `linear-gradient(90deg,${Array.from({ length: 13 }, (_, k) => oklch(0.7, 0.16, k * 30)).join(',')})`; hh.style.borderRadius = '9px'; hh.style.height = '10px';
  const remember = () => { store.set('tbs-hue', hh.value); store.set('tbs-scheme', $('hScheme').value); store.set('tbs-style', $('hStyle').value); };
  const live = () => { remember(); begin(); state.spec.palette = harmony(+hh.value, $('hScheme').value, $('hStyle').value); touched(); apply('paint'); refreshRoles(); };
  hh.addEventListener('input', live); hh.addEventListener('change', () => { end(); renderPanels(); });
  $('hGo').onclick = () => { remember(); change(s => { s.palette = harmony(+hh.value, $('hScheme').value, $('hStyle').value); }, 'paint'); };
  $('hRand').onclick = () => { const h = Math.floor(Math.random() * 360), sc = Object.keys(SCHEMES)[Math.floor(Math.random() * 6)], st = Object.keys(STYLES)[Math.floor(Math.random() * 5)]; store.set('tbs-hue', h); store.set('tbs-scheme', sc); store.set('tbs-style', st); change(s => { s.palette = harmony(h, sc, st); }, 'paint'); };
  $('palLock').onclick = () => { L ? state.locks.delete('palette') : state.locks.add('palette'); renderPanels(); };
  el.querySelectorAll('[data-p]').forEach(b => b.onclick = () => change(s => { s.palette = clone(brand.palettes[b.dataset.p]); }, 'paint'));
  el.querySelectorAll('[data-c]').forEach(inp => {
    inp.addEventListener('input', () => { begin(); state.spec.palette = withPalette(state.spec.palette); state.spec.palette[inp.dataset.c].color = inp.value; touched(); apply('paint'); inp.nextElementSibling.querySelector('code').textContent = inp.value; });
    inp.addEventListener('change', () => { end(); renderOutliner(); renderCast(); });
  });
  el.querySelectorAll('[data-f]').forEach(sel => sel.onchange = () => change(s => { s.palette = withPalette(s.palette); s.palette[sel.dataset.f].finish = sel.value; }, 'paint'));
  el.querySelectorAll('[data-i]').forEach(sel => sel.onchange = () => change(s => { s.palette = withPalette(s.palette); s.palette[sel.dataset.i].print = sel.value; }, 'paint'));
  function refreshRoles() { const Q2 = withPalette(state.spec.palette); el.querySelectorAll('[data-c]').forEach(i => { i.value = Q2[i.dataset.c].color; i.nextElementSibling.querySelector('code').textContent = i.value; }); }
}

function brandPanel(el) {
  const st = { ...brand.stage, sky: { top: '#9fc4ff', mid: '#eef4ff', bottom: '#ffffff', horizon: 0.55, ...(brand.stage.sky || {}) } };
  brand.stage = st;
  el.innerHTML = `<div class="ins"><div class="ih"><h1>Brand</h1></div><p class="note">The layer every character shares: the stage of each look, and the palette library. Saved in <code class="inline">brand/brand.json</code>.</p>
    <div class="sub">Y2K sky</div>
    ${['top', 'mid', 'bottom'].map(k => `<div class="role"><input type="color" data-sky="${k}" value="${st.sky[k]}"><span>${{ top: 'Zenith', mid: 'Horizon', bottom: 'Floor' }[k]}<code>${st.sky[k]}</code></span><span></span><span></span></div>`).join('')}
    <div class="gene"><label>Horizon at</label><input type="range" id="bHor" min="0.2" max="0.9" step="0.01" value="${st.sky.horizon}" style="grid-column:2/4"><span></span><span></span></div>
    <div class="gene"><label>Y2K gloss</label><input type="range" id="bGloss" min="0" max="1" step="0.01" value="${st.gloss ?? 0.6}" style="grid-column:2/4"><span></span><span></span></div>
    <div class="role"><input type="color" id="bPaper" value="${st.paper || '#f4f4f2'}"><span>Studio backdrop<code>${st.paper || '#f4f4f2'}</code></span><span></span><span></span></div>
    <div class="sub">Palette library</div>
    <div class="chips">${Object.entries(brand.palettes).map(([n, p]) => `<span class="pchip">${swatches(withPalette(p))}${esc(n)}<button class="x" data-rm="${esc(n)}" aria-label="Remove ${esc(n)}">✕</button></span>`).join('')}</div>
    <div class="actions"><input id="bName" placeholder="Name" style="flex:1;padding:6px 8px"><button class="btn" id="bAdd">Add current palette</button></div>
    <div class="actions"><button class="btn hot" id="bSave">${LOCAL ? 'Save brand.json' : 'Download brand.json'}</button></div></div>`;
  const restage = () => { setStage(brand.stage); reskinAll(); };
  el.querySelectorAll('[data-sky]').forEach(i => i.addEventListener('input', () => { brand.stage.sky[i.dataset.sky] = i.value; i.nextElementSibling.querySelector('code').textContent = i.value; restage(); }));
  $('bHor').addEventListener('input', () => { pct($('bHor')); brand.stage.sky.horizon = +$('bHor').value; restage(); }); pct($('bHor'));
  $('bGloss').addEventListener('input', () => { pct($('bGloss')); brand.stage.gloss = +$('bGloss').value; restage(); }); pct($('bGloss'));
  $('bPaper').addEventListener('input', () => { brand.stage.paper = $('bPaper').value; restage(); });
  el.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { delete brand.palettes[b.dataset.rm]; brandPanel(el); });
  $('bAdd').onclick = () => { const n = $('bName').value.trim() || `Palette ${Object.keys(brand.palettes).length + 1}`; brand.palettes[n] = withPalette(state.spec.palette); brandPanel(el); };
  $('bSave').onclick = async () => {
    if (!LOCAL) return download('brand.json', new Blob([JSON.stringify(brand, null, 2) + '\n'], { type: 'application/json' }));
    const r = await fetch(new URL('api/brand', ROOT), { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ brand }) }).then(r => r.json()).catch(e => ({ error: e.message }));
    toast(r.error || 'Saved brand/brand.json', !!r.error);
  };
}

// ---------- Breed ----------
function breedPanel(el) {
  el.innerHTML = `<div class="ins"><div class="ih"><h1>Breed</h1></div>
    <p class="note">The centre is the current character. Around it, eight children chosen to be as different from each other as possible within the spread (a local design gallery). Click one to adopt it and breed again. Undo walks back.</p>
    <div class="gene"><label>Spread</label><input type="range" id="bAmt" min="0.05" max="1" step="0.01" value="${state.amount}" style="grid-column:2/4"><span></span><span></span></div>
    <div class="actions"><button class="btn primary" id="bRe">New litter</button></div>
    <div class="sub">Locks <span>${state.locks.size} locked</span></div>
    <p class="note">Lock genes in Edit (padlock) to keep them through breeding: the palette, a part's shape, the eyes…</p>
    <div class="actions"><button class="btn" id="bLockPal">${state.locks.has('palette') ? 'Unlock' : 'Lock'} palette</button><button class="btn" id="bLockParts">${state.locks.has('parts.*') ? 'Unlock' : 'Lock'} apparatus</button><button class="btn" id="bClear">Clear locks</button></div></div>`;
  const a = $('bAmt'); pct(a);
  a.addEventListener('input', () => { pct(a); state.amount = +a.value; });
  a.addEventListener('change', () => later(0));
  $('bRe').onclick = () => { state.breedSeed++; later(0); };
  const tog = (k) => { state.locks.has(k) ? state.locks.delete(k) : state.locks.add(k); breedPanel(el); later(0); };
  $('bLockPal').onclick = () => tog('palette'); $('bLockParts').onclick = () => tog('parts.*');
  $('bClear').onclick = () => { state.locks.clear(); breedPanel(el); later(0); };
}

// ---------- Blend ----------
function blendPanel(el) {
  const keys = order.filter(k => !cast[k].seed_of || edits[k]);
  const opt = (sel) => keys.map(k => `<option value="${esc(k)}" ${k === sel ? 'selected' : ''}>${esc((edits[k] || cast[k]).name)}</option>`).join('');
  const V = [[150, 22], [22, 240], [278, 240]];
  el.innerHTML = `<div class="ins"><div class="ih"><h1>Blend</h1></div>
    <p class="note">Numbers mix by weight, colours mix in OKLab, and the apparatus comes from the strongest parent, with each part blended with its namesakes.</p>
    ${['A', 'B', 'C'].map((l, i) => `<div class="gene"><label>Parent ${l}</label><select data-pi="${i}" style="grid-column:2/6">${opt(state.blend.ids[i])}</select></div>`).join('')}
    <svg class="tri" id="tri" viewBox="0 0 300 270" role="slider" aria-label="Blend weights" tabindex="0">
      <polygon points="${V.map(v => v.join(',')).join(' ')}" fill="rgba(61,92,255,.08)" stroke="#3a3a41"/>
      ${V.map((v, i) => `<circle cx="${v[0]}" cy="${v[1]}" r="5" fill="#3d5cff"/><text x="${v[0] + (i === 1 ? -14 : i === 2 ? 4 : 10)}" y="${v[1] + (i ? 20 : -6)}">${'ABC'[i]}</text>`).join('')}
      <circle id="triDot" r="9" fill="#e8ff00" stroke="#141410" stroke-width="2"/></svg>
    <p class="note" id="triW"></p>
    <div class="actions"><button class="btn hot" id="bKeep">Keep this blend</button><button class="btn" id="bEven">Even mix</button></div></div>`;
  const dot = $('triDot'), tri = $('tri');
  const place = () => {
    const w = state.blend.at, x = V.reduce((a, v, i) => a + v[0] * w[i], 0), y = V.reduce((a, v, i) => a + v[1] * w[i], 0);
    dot.setAttribute('cx', x); dot.setAttribute('cy', y);
    $('triW').textContent = w.map((v, i) => `${'ABC'[i]} ${Math.round(v * 100)}%`).join(' · ');
  };
  const bary = (x, y) => {
    const [a, b, c] = V, d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    let l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / d, l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / d;
    l1 = Math.max(0, l1); l2 = Math.max(0, l2); let l3 = Math.max(0, 1 - l1 - l2); const s = l1 + l2 + l3;
    return [l1 / s, l2 / s, l3 / s];
  };
  let dragging = false;
  const move = (e) => { const r = tri.getBoundingClientRect(); state.blend.at = bary((e.clientX - r.left) / r.width * 300, (e.clientY - r.top) / r.height * 270); place(); later(90); };
  tri.addEventListener('pointerdown', e => { dragging = true; tri.setPointerCapture(e.pointerId); move(e); });
  tri.addEventListener('pointermove', e => { if (dragging) move(e); });
  tri.addEventListener('pointerup', () => { dragging = false; });
  el.querySelectorAll('[data-pi]').forEach(s => s.onchange = () => { state.blend.ids[+s.dataset.pi] = s.value; later(0); });
  $('bEven').onclick = () => { state.blend.at = [1 / 3, 1 / 3, 1 / 3]; place(); later(0); };
  $('bKeep').onclick = () => { if (!blendSpec) return; const s = clone(blendSpec); s.id = S.validate(s).id; adoptNew(s, `Kept ${s.name}: it is now a new character`); setMode('edit'); };
  place();
}

// ---------- Describe ----------
const EXAMPLES = [
  'A sleepy archbishop crab whose shell is a chrome cathedral spire, with a bubblegum halo',
  'Three tiny crabs sharing one giant pearl shell, pastel, like a 1999 PlayStation mascot',
  'A neon raver crab with iridescent wings and huge eyes, Wetrix aqua palette',
  'Make it angrier and more constructivist: red, black, a banner',
];
function describePanel(el) {
  el.innerHTML = `<div class="ins"><div class="ih"><h1>Describe</h1></div>
    <p class="note">Write what you want. Claude (claude-opus-5-5) designs the genome under the same schema the editor uses; out-of-range values are clamped. Then refine it by hand, breed it, or save it.</p>
    ${LOCAL ? '' : `<div class="warn">Describe runs on your machine. In the project folder: <code class="inline">npm install</code>, then <code class="inline">npm run dev</code> with <code class="inline">ANTHROPIC_API_KEY</code> set (or after <code class="inline">ant auth login</code>), and open the local studio.</div>`}
    <label class="field"><span>Description</span><textarea id="dText" placeholder="A hermit crab who…" ${LOCAL ? '' : 'disabled'}></textarea></label>
    <div class="actions"><button class="btn primary" id="dNew" ${LOCAL ? '' : 'disabled'}>Create new</button><button class="btn" id="dEdit" ${LOCAL ? '' : 'disabled'}>Change current</button></div>
    <p class="note" id="dStatus"></p>
    <div class="sub">Try</div><div class="examples">${EXAMPLES.map(x => `<button>${esc(x)}</button>`).join('')}</div></div>`;
  el.querySelectorAll('.examples button').forEach(b => b.onclick = () => { $('dText').value = b.textContent; $('dText').focus(); });
  const go = async (edit) => {
    const prompt = $('dText').value.trim(); if (!prompt) return $('dText').focus();
    $('dNew').disabled = $('dEdit').disabled = true;
    $('dStatus').innerHTML = '<span class="busy"></span>Claude is designing… (this can take a minute)';
    const r = await fetch(new URL('api/generate', ROOT), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt, base: edit ? state.spec : undefined }) }).then(r => r.json()).catch(e => ({ error: e.message }));
    $('dNew').disabled = $('dEdit').disabled = false;
    if (r.error) { $('dStatus').textContent = r.error; return; }
    $('dStatus').textContent = `${r.spec.name}: ${r.spec.concept || ''}`;
    if (edit) { const keepId = state.spec.id; change(() => { r.spec.id = keepId; return r.spec; }); toast(`Changed ${r.spec.name}`); }
    else adoptNew(r.spec, `Created ${r.spec.name}`);
  };
  $('dNew').onclick = () => go(false); $('dEdit').onclick = () => go(true);
}

// ---------- lineage ----------
function drawTree() {
  const tree = $('tree');
  const nodes = [...lineage.history.map(h => ({ ...h, hist: true })), ...order.filter(k => !cast[k].seed_of || edits[k]).map(k => { const s = edits[k] || cast[k]; return { id: k, name: s.name, parent: s.parent }; })];
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  const depth = (n, s = 0) => (n.parent && byId[n.parent] && s < 20 ? depth(byId[n.parent], s + 1) + 1 : 0);
  const cols = {};
  nodes.forEach(n => { n.d = depth(n); (cols[n.d] ||= []).push(n); });
  const W = view.clientWidth, H = view.clientHeight, nd = Object.keys(cols).length, vertical = W < H;
  Object.entries(cols).forEach(([d, list]) => list.forEach((n, i) => { const a = (+d + 0.5) / nd, b = (i + 0.5) / list.length; n.x = vertical ? b * W : a * W; n.y = vertical ? a * H : b * H; }));
  const NS = 'http://www.w3.org/2000/svg';
  tree.innerHTML = '';
  const el = (tag, attrs, parent = tree) => { const e = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); parent.appendChild(e); return e; };
  nodes.forEach(n => { const p = byId[n.parent]; if (p) el('path', { d: vertical ? `M${p.x},${p.y} C${p.x},${(p.y + n.y) / 2} ${n.x},${(p.y + n.y) / 2} ${n.x},${n.y}` : `M${p.x},${p.y} C${(p.x + n.x) / 2},${p.y} ${(p.x + n.x) / 2},${n.y} ${n.x},${n.y}`, fill: 'none', stroke: '#3d5cff', 'stroke-width': 1.2 }); });
  nodes.forEach(n => {
    const host = n.hist && n.url ? el('a', { href: n.url, target: '_blank', rel: 'noopener' }) : tree;
    const g = el('g', { class: 'node', transform: `translate(${n.x},${n.y})`, ...(n.hist ? {} : { tabindex: 0, role: 'button' }) }, host);
    const w = Math.max(60, n.name.length * 6.8 + 18);
    el('rect', { x: -w / 2, y: -13, width: w, height: 26, rx: 4, fill: !n.hist && n.id === state.key ? '#e8ff00' : '#ffffff', stroke: '#141410', 'stroke-dasharray': n.hist ? '3 3' : 'none' }, g);
    const t = el('text', { 'text-anchor': 'middle', y: 4 }, g); t.textContent = n.name;
    if (n.hist) return;
    const go = () => { state.mode = 'edit'; openCharacter(n.id); };
    g.addEventListener('click', go); g.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  });
}

// ---------- misc ----------
// (svg elements ignore the `hidden` property, so toggle display)
function showTree(on) { $('tree').style.display = on ? 'block' : 'none'; canvas.style.display = on ? 'none' : 'block'; }
let toastTimer = 0;
function toast(msg, err = false) { const t = $('toast'); t.textContent = msg; t.classList.toggle('err', err); t.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 3200); }
function renderPanels() { renderCast(); renderOutliner(); renderInspector(); syncTop(); hud(); }
addEventListener('keydown', e => {
  if (e.target.closest('input,textarea,select')) return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && state.sel.startsWith('part:')) { e.preventDefault(); removePart(+state.sel.split(':')[1]); }
  else if (e.key === 'Escape') select('body');
});
addEventListener('beforeunload', e => { if (dirty.size && !EXPORT) { e.preventDefault(); e.returnValue = ''; } });
function resize() { stage.resize(view.clientWidth, view.clientHeight, EXPORT ? 1 : undefined); if (state.mode === 'lineage') drawTree(); }
addEventListener('resize', resize);
new ResizeObserver(resize).observe(view);

// ---------- loop ----------
const still = EXPORT || matchMedia('(prefers-reduced-motion: reduce)').matches;
const T0 = +(Q.get('t') || 2.5), start = performance.now();
let frames = 0, tNow = T0, last = start;
function frame(now) {
  if (!state.paused && !still) tNow += (now - last) / 1000;
  last = now;
  if (!(EXPORT && frames >= 6) && state.mode !== 'lineage' && ch) {
    if (state.mode !== 'sheet') actors.forEach(a => a.up(tNow));
    actors.forEach(a => { a.obj.visible = true; });
    updateBox();
    stage.render(views(tNow), state.look);
  }
  if (++frames === 3) document.title += ' ·'; // export readiness marker
  requestAnimationFrame(frame);
}
showTree(state.mode === 'lineage');
resize(); rebuild(); renderPanels(); requestAnimationFrame(frame);
// for automated checks and the console
window.tbs = { state, get frames() { return frames; }, get t() { return tNow; }, get ch() { return ch; }, get actors() { return actors; }, stage, select, setMode, change, undo, redo, S };
