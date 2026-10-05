// The 3D viewport: builds what the current mode shows, renders it, and handles direct manipulation
// (orbit, zoom, click a part to select it, drag a selected apparatus part to move it).
import { createStage, setLook } from '../../engine/press.js';
import { build } from '../../engine/build.js';
import { withPalette } from '../../engine/palette.js';
import * as S from '../../engine/schema.js';
import { state, data, edits, EXPORT, on, change, select, specOf, clone } from './store.js';
import { $, esc } from '../ui/dom.js';

let stage, THREE, canvas, view, overlay, tree;
let ch = null, actors = [], kids = [], blendSpec = null;
let selBox = null, selTargets = [];
export const current = () => ch;
export const children = () => kids;
export const blended = () => blendSpec;

export const CAMERAS = [
  { k: 'front', t: 'Front', yaw: 0, key: 'Q' }, { k: 'three', t: '¾', yaw: 0.65, key: 'W' },
  { k: 'side', t: 'Side', yaw: Math.PI / 2, key: 'E' }, { k: 'back', t: 'Back', yaw: Math.PI, key: 'R' },
];

export function initViewport() {
  canvas = $('#c'); view = $('#view'); overlay = $('#overlay'); tree = $('#tree');
  stage = createStage(canvas, { preserve: EXPORT, antialias: !EXPORT });
  THREE = stage.THREE;
  wirePointer();
  on('change', ({ kind }) => { if (kind === 'paint') reskinCurrent(); else if (kind === 'shape') later(); else hudSel(); });
  on('mode', () => { showTree(state.mode === 'lineage'); rebuild(); });
  on('open', () => rebuild());
  on('cast', () => { if (state.mode === 'lineage') drawTree(); });
  on('look', () => actors.forEach(a => setLook(a.obj, state.look)));
  on('stage', () => actors.forEach(a => setLook(a.obj, state.look)));
  on('select', () => highlight());
  new ResizeObserver(resize).observe(view);
  showTree(state.mode === 'lineage');
  resize(); rebuild();
  return stage;
}
function resize() { stage.resize(view.clientWidth, view.clientHeight, EXPORT ? 1 : undefined); if (state.mode === 'lineage') drawTree(); layoutOverlay(); }

// ---------- actors ----------
function frameOf(c) {
  c.still(true); c.up(2.5);
  const b = new THREE.Box3().setFromObject(c.obj);
  const size = b.getSize(new THREE.Vector3()), mid = b.getCenter(new THREE.Vector3());
  c.frame = { dist: Math.max(size.y, size.x * 0.85, size.z * 0.85) / (2 * Math.tan(Math.PI / 12)) * 1.1 + size.z / 2, lift: mid.y };
  const g = new THREE.Mesh(new THREE.CircleGeometry(12, 64), new THREE.ShadowMaterial({ opacity: 0.2 }));
  g.rotation.x = -Math.PI / 2; g.position.y = b.min.y - 0.01; g.userData.ground = true; g.receiveShadow = true;
  c.obj.add(g); c.still(EXPORT);
}
function actor(spec) { const c = build(spec); frameOf(c); setLook(c.obj, state.look); stage.scene.add(c.obj); actors.push(c); return c; }
function clearActors() {
  actors.forEach(a => { stage.scene.remove(a.obj); a.obj.traverse(o => o.geometry && o.geometry.dispose()); });
  actors = []; kids = []; ch = null;
}
const solo = (a) => actors.forEach(x => { x.obj.visible = x === a; });

let timer = 0;
export function later(ms = 60) { clearTimeout(timer); timer = setTimeout(rebuild, ms); }
export function rebuild() {
  clearTimeout(timer);
  clearActors();
  if (state.mode === 'lineage') { drawTree(); layoutOverlay(); return; }
  if (state.mode === 'blend') { blendSpec = S.blend(state.blend.ids.map(specOf), state.blend.at); ch = actor(blendSpec); }
  else ch = actor(state.spec);
  if (state.mode === 'breed') kids = S.breed(state.spec, state.breedSeed, 8, state.amount, state.locks).map(spec => ({ spec, a: actor(spec) }));
  highlight(); layoutOverlay();
}
function reskinCurrent() {
  if (!ch || state.mode === 'blend') return;
  ch.obj.userData.palette = withPalette(state.spec.palette); setLook(ch.obj, state.look);
  if (state.mode === 'breed') later(250);
}

// ---------- selection highlight ----------
const visible = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
function findSel(root, sel) {
  const out = [];
  if (!root || !sel || sel === 'pose') return out;
  // the meshes whose nearest tagged ancestor is `sel` (so Body doesn't include the arms it carries)
  root.traverse(o => {
    if (!o.isMesh) return;
    let p = o; while (p && !p.userData.sel) p = p.parent;
    if (p?.userData.sel === sel) out.push(o);
  });
  return out;
}
function highlight() {
  if (selBox) { stage.scene.remove(selBox); selBox = null; }
  selTargets = state.mode === 'edit' && ch ? findSel(ch.obj, state.sel).filter(visible) : [];
  hudSel();
  if (!selTargets.length) return;
  selBox = new THREE.Box3Helper(new THREE.Box3(), 0xe8ff00);
  selBox.material.depthTest = false; selBox.material.transparent = true; selBox.material.opacity = 0.9; selBox.renderOrder = 999;
  stage.scene.add(selBox);
}
function updateBox() {
  if (!selBox) return;
  selBox.visible = !EXPORT && state.look !== 'print' && state.mode === 'edit';
  const b = selBox.box.makeEmpty(); selTargets.forEach(o => b.expandByObject(o));
}
// the chip in the corner that says what is selected
function hudSel() {
  const el = $('#selChip'); if (!el) return;
  const label = selLabel(state.sel);
  el.hidden = state.mode !== 'edit' || !label || !selTargets.length; // only for things you can see in 3D
  el.innerHTML = label ? `<span>Editing</span><b>${esc(label)}</b>` : '';
}
export function selLabel(sel) {
  if (!sel) return '';
  if (sel.startsWith('part:')) { const p = state.spec.parts?.[+sel.split(':')[1]]; return p ? S.PARTS[p.type]?.label || p.type : ''; }
  const g = S.anatomyOf(state.spec).find(a => a.id === sel);
  return g ? g.label : { palette: 'Palette', identity: 'Identity', add: 'Add part', brand: 'Brand' }[sel] || '';
}

// ---------- views ----------
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
  return [{ x: 0, y: 0, w: 1, h: 1, yaw: state.yaw, tilt: state.tilt, dist: ch.frame.dist * state.zoom, lift: ch.frame.lift, fit: true }];
}
export function render(t) {
  if (state.mode === 'lineage' || !ch) return;
  if (state.mode !== 'sheet') actors.forEach(a => a.up(t));
  actors.forEach(a => { a.obj.visible = true; });
  updateBox();
  stage.render(views(t), state.look);
}

// ---------- camera ----------
let anim = null;
export function camera(k) {
  const c = CAMERAS.find(x => x.k === k); if (!c) return;
  animateTo({ yaw: c.yaw, tilt: 0.06 });
}
export function frameAll() { animateTo({ yaw: state.yaw, tilt: 0.08, zoom: 1 }); }
function animateTo(to) {
  const from = { yaw: state.yaw, tilt: state.tilt, zoom: state.zoom }, t0 = performance.now();
  // shortest way round
  if (to.yaw !== undefined) { let d = (to.yaw - from.yaw) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; to.yaw = from.yaw + d; }
  cancelAnimationFrame(anim);
  const step = (now) => {
    const u = Math.min(1, (now - t0) / 380), e = 1 - Math.pow(1 - u, 3);
    for (const k of Object.keys(to)) state[k] = from[k] + (to[k] - from[k]) * e;
    if (u < 1) anim = requestAnimationFrame(step);
  };
  anim = requestAnimationFrame(step);
}

// ---------- pointer: orbit, zoom, pick, drag ----------
const ray = () => new THREE.Raycaster();
function ndc(e) { const r = canvas.getBoundingClientRect(); return new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); }
function pick(e) {
  if (!ch) return null;
  const R = ray(); R.setFromCamera(ndc(e), stage.camera); // the camera keeps the main view's pose from the last frame
  for (const h of R.intersectObject(ch.obj, true)) {
    if (h.object.userData.ground || !visible(h.object)) continue;
    let o = h.object; while (o && !o.userData.sel) o = o.parent;
    if (o) return { sel: o.userData.sel, obj: o, point: h.point };
  }
  return null;
}
function wirePointer() {
  let drag = null;
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, yaw: state.yaw, tilt: state.tilt, moved: false };
    if (state.mode !== 'edit' || !state.sel.startsWith('part:')) return;
    const hit = pick(e);
    if (!hit || hit.sel !== state.sel) return;
    const n = new THREE.Vector3(); stage.camera.getWorldDirection(n);
    drag.part = { obj: hit.obj, plane: new THREE.Plane().setFromNormalAndCoplanarPoint(n, hit.point), from: hit.obj.parent.worldToLocal(hit.point.clone()), pos: hit.obj.position.clone() };
    canvas.classList.add('moving');
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag) { if (state.mode === 'edit' && e.pointerType === 'mouse') hover(e); return; }
    if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 4) drag.moved = true;
    if (drag.part) {
      const R = ray(); R.setFromCamera(ndc(e), stage.camera);
      const p = new THREE.Vector3(); if (!R.ray.intersectPlane(drag.part.plane, p)) return;
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
      change(s => { const p = s.parts[n]; const m = p.move || [0, 0, 0]; p.move = [m[0] + v.x, m[1] + v.y, m[2] + v.z].map(x => +x.toFixed(3)); }, 'meta');
      return;
    }
    if (!d.moved && state.mode === 'edit') { const hit = pick(e); select(hit ? hit.sel : state.sel); }
  });
  canvas.addEventListener('pointerleave', () => { canvas.style.cursor = ''; });
  canvas.addEventListener('wheel', e => {
    if (!['edit', 'blend', 'describe'].includes(state.mode)) return;
    e.preventDefault(); state.zoom = Math.max(0.35, Math.min(2.2, state.zoom * (1 + e.deltaY * 0.001)));
  }, { passive: false });
}
// show a pointer over things you can click
let hoverAt = 0;
function hover(e) {
  const now = performance.now(); if (now - hoverAt < 60) return; hoverAt = now;
  const hit = pick(e);
  canvas.style.cursor = hit ? (hit.sel === state.sel && hit.sel.startsWith('part:') ? 'move' : 'pointer') : '';
}

// ---------- overlays: labels on top of the canvas (breed cells, sheet captions) ----------
let onAdopt = () => {};
export function onAdoptChild(fn) { onAdopt = fn; }
function layoutOverlay() {
  if (!overlay) return;
  if (state.mode === 'breed') {
    const order = [0, 1, 2, 3, -1, 4, 5, 6, 7];
    overlay.className = 'overlay breed';
    overlay.innerHTML = order.map((k, i) => k < 0
      ? `<div class="cell current"><span class="tag">Current</span></div>`
      : `<button class="cell" data-kid="${k}" aria-label="Adopt child ${k + 1}"><span class="tag">seed ${esc(kids[k]?.spec.seed ?? '')}</span><span class="adopt">Adopt</span></button>`).join('');
    overlay.querySelectorAll('[data-kid]').forEach(b => b.onclick = () => { const k = kids[+b.dataset.kid]; if (k) onAdopt(clone(k.spec)); });
  } else if (state.mode === 'sheet') {
    overlay.className = 'overlay sheet';
    overlay.innerHTML = `<div class="row turn">${['Front', '¾', 'Side', 'Back'].map(t => `<span>${t}</span>`).join('')}</div><div class="row ex">${(ch?.expressions || []).map(t => `<span>${esc(t)}</span>`).join('')}</div>`;
  } else { overlay.className = 'overlay'; overlay.innerHTML = ''; }
}

// ---------- lineage ----------
function showTree(on) { tree.style.display = on ? 'block' : 'none'; canvas.style.display = on ? 'none' : 'block'; }
let onOpen = () => {};
export function onOpenFromTree(fn) { onOpen = fn; }
function drawTree() {
  const nodes = [...data.lineage.history.map(h => ({ ...h, hist: true })), ...data.order.filter(k => !data.cast[k].seed_of || edits[k]).map(k => { const s = specOf(k); return { id: k, name: s.name, parent: s.parent }; })];
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  const depth = (n, s = 0) => (n.parent && byId[n.parent] && s < 20 ? depth(byId[n.parent], s + 1) + 1 : 0);
  const cols = {};
  nodes.forEach(n => { n.d = depth(n); (cols[n.d] ||= []).push(n); });
  const W = view.clientWidth, H = view.clientHeight, nd = Object.keys(cols).length, vertical = W < H;
  Object.entries(cols).forEach(([d, list]) => list.forEach((n, i) => { const a = (+d + 0.5) / nd, b = (i + 0.5) / list.length; n.x = vertical ? b * W : a * W; n.y = vertical ? a * H : b * H; }));
  const NS = 'http://www.w3.org/2000/svg';
  tree.innerHTML = '';
  const el = (tag, attrs, parent = tree) => { const e = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); parent.appendChild(e); return e; };
  nodes.forEach(n => { const p = byId[n.parent]; if (p) el('path', { class: 'edge', d: vertical ? `M${p.x},${p.y} C${p.x},${(p.y + n.y) / 2} ${n.x},${(p.y + n.y) / 2} ${n.x},${n.y}` : `M${p.x},${p.y} C${(p.x + n.x) / 2},${p.y} ${(p.x + n.x) / 2},${n.y} ${n.x},${n.y}` }); });
  nodes.forEach(n => {
    const host = n.hist && n.url ? el('a', { href: n.url, target: '_blank', rel: 'noopener' }) : tree;
    const g = el('g', { class: `node${n.hist ? ' hist' : ''}${n.id === state.key ? ' on' : ''}`, transform: `translate(${n.x},${n.y})`, ...(n.hist ? {} : { tabindex: 0, role: 'button', 'aria-label': `Open ${n.name}` }) }, host);
    const w = Math.max(64, n.name.length * 6.6 + 22);
    el('rect', { x: -w / 2, y: -14, width: w, height: 28, rx: 14 }, g);
    const t = el('text', { 'text-anchor': 'middle', y: 4 }, g); t.textContent = n.name;
    if (n.hist) return;
    g.addEventListener('click', () => onOpen(n.id)); g.addEventListener('keydown', e => { if (e.key === 'Enter') onOpen(n.id); });
  });
}
