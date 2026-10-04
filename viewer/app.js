import { createStage, setLook } from '../src/press.js';
import { GLTFExporter } from '../vendor/GLTFExporter.js';
import { bakeIdle } from '../src/bake.js';
import { build } from '../src/build.js';
import { mutate } from '../src/mutate.js';

const ROOT = new URL('../', import.meta.url);
const Q = new URLSearchParams(location.search);
const EXPORT = Q.has('export');
if (EXPORT) document.body.classList.add('export');

const canvas = document.getElementById('c'), plate = document.getElementById('plate');
const tree = document.getElementById('tree'), pick = document.getElementById('pick');
let stage;
try { stage = createStage(canvas, { preserve: EXPORT, noEnv: Q.has('noenv'), noShadow: Q.has('noshadow') }); }
catch (e) { plate.textContent = 'WebGL non disponibile su questo dispositivo.'; throw e; }

const getJSON = (p) => fetch(new URL(p, ROOT)).then(r => r.json());
const index = await getJSON('characters/index.json');
const specs = Object.fromEntries(await Promise.all(index.map(async id => [id, await getJSON(`characters/${id}.json`)])));
// ?spec=path/to/draft.json previews a spec that is not in the index yet
if (Q.get('spec')) { const d = await getJSON(Q.get('spec')); specs[d.id] = d; index.push(d.id); Q.set('c', d.id); }
const lineage = await getJSON('lineage.json').catch(() => ({ history: [] }));
const MAIN = index.filter(id => !specs[id].seed_of);

const MODES = [{ k: 'plate', t: 'Tavola' }, { k: 'sheet', t: 'Foglio' }, { k: 'variants', t: 'Varianti' }, { k: 'tree', t: 'Genealogia' }];
const state = { id: Q.get('c') || MAIN[0], mode: Q.get('mode') || 'plate', look: Q.get('look') || (location.hash === '#stampa' ? 'print' : 'color'), yaw: +(Q.get('yaw') || 0), tilt: 0.06, zoom: 1 };
try { if (!Q.has('c')) state.id = localStorage.getItem('pa-id') || state.id; if (!Q.has('mode')) state.mode = localStorage.getItem('pa-mode') || state.mode; if (!Q.has('look') && !location.hash) state.look = localStorage.getItem('pa-look') || state.look; } catch (e) {}
if (!specs[state.id]) state.id = MAIN[0];

// ---------- scene management ----------
let actors = []; // [{ch, obj}]
function clear() {
  actors.forEach(a => { stage.scene.remove(a.obj); a.obj.traverse(o => o.geometry && o.geometry.dispose()); });
  actors = [];
}
function add(spec) { const ch = build(spec); addGround(ch); setLook(ch.obj, state.look); stage.scene.add(ch.obj); actors.push(ch); return ch; }
function solo(ch) { actors.forEach(a => { a.obj.visible = a === ch; }); }

// soft contact shadow under the figure; only shown in the 3D look
function addGround(ch) {
  ch.still(true); ch.up(2.5);
  const b = new stage.THREE.Box3().setFromObject(ch.obj);
  const g = new stage.THREE.Mesh(new stage.THREE.CircleGeometry(3.2, 64), new stage.THREE.ShadowMaterial({ opacity: 0.22 }));
  g.rotation.x = -Math.PI / 2; g.position.y = b.min.y - 0.01; g.userData.ground = true; g.receiveShadow = true;
  ch.obj.add(g); ch.still(EXPORT);
}

let variantSeeds = [];
function load() {
  clear(); pick.style.display = 'none';
  const spec = specs[state.id];
  tree.style.display = state.mode === 'tree' ? 'block' : 'none';
  if (state.mode === 'tree') { drawTree(); return; }
  if (state.mode === 'variants') {
    const base = (+Q.get('seed') || spec.seed || 1) * 100;
    variantSeeds = Array.from({ length: 9 }, (_, i) => base + i);
    variantSeeds.forEach((s, i) => add(i === 4 ? spec : mutate(spec, s)));
  } else add(spec);
  if (EXPORT) actors.forEach(a => a.still(true));
}

// ---------- layouts ----------
function views(t) {
  const yaw = state.yaw, tilt = state.tilt;
  if (state.mode === 'plate') return [{ x: 0, y: 0, w: 1, h: 1, yaw, tilt, dist: 8 * state.zoom, fit: true }];
  if (state.mode === 'sheet') {
    const ch = actors[0], out = [];
    const turn = [0, Math.PI / 4, Math.PI / 2, Math.PI];
    const ex = ch.expressions;
    turn.forEach((a, i) => out.push({ x: i / 4, y: 0.34, w: 1 / 4, h: 0.66, yaw: a, tilt: 0.04, dist: 7.6, fit: true, before: () => { ch.setExpression(ch.spec.expression || 'quiete'); ch.up(t); ch.obj.children[0].rotation.y = 0; } }));
    ch.up(2.5); ch.obj.children[0].rotation.y = 0;
    const face = ch.face();
    ex.forEach((e, i) => out.push({ x: i / ex.length, y: 0, w: 1 / ex.length, h: 0.34, yaw: 0.15, tilt: 0.1, dist: ch.spec.faceDist || 3, lift: face.y - 0.12, before: () => { ch.setExpression(e); ch.still(true); ch.up(2.5); ch.obj.children[0].rotation.y = 0; } }));
    ch.still(false);
    return out;
  }
  if (state.mode === 'variants') {
    return actors.map((ch, i) => ({ x: (i % 3) / 3, y: 1 - (Math.floor(i / 3) + 1) / 3, w: 1 / 3, h: 1 / 3, yaw, tilt, dist: 8.4, fit: true, before: () => solo(ch) }));
  }
  return [];
}

// ---------- lineage graph ----------
function drawTree() {
  const nodes = [...lineage.history.map(h => ({ ...h, hist: true })), ...index.map(id => ({ id, name: specs[id].name, parent: specs[id].parent }))];
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  const depth = (n, s = 0) => (n.parent && byId[n.parent] && s < 20 ? depth(byId[n.parent], s + 1) + 1 : 0);
  const cols = {};
  nodes.forEach(n => { n.d = depth(n); (cols[n.d] ||= []).push(n); });
  const W = plate.clientWidth, H = plate.clientHeight, nd = Object.keys(cols).length;
  const vertical = W < H;
  Object.entries(cols).forEach(([d, list]) => list.forEach((n, i) => {
    const a = (+d + 0.5) / nd, b = (i + 0.5) / list.length;
    n.x = vertical ? b * W : a * W; n.y = vertical ? a * H : b * H;
  }));
  const NS = 'http://www.w3.org/2000/svg';
  tree.innerHTML = '';
  const el = (tag, attrs, parent = tree) => { const e = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); parent.appendChild(e); return e; };
  nodes.forEach(n => { const p = byId[n.parent]; if (p) el('path', { d: vertical ? `M${p.x},${p.y} C${p.x},${(p.y + n.y) / 2} ${n.x},${(p.y + n.y) / 2} ${n.x},${n.y}` : `M${p.x},${p.y} C${(p.x + n.x) / 2},${p.y} ${(p.x + n.x) / 2},${n.y} ${n.x},${n.y}`, fill: 'none', stroke: '#001ef7', 'stroke-width': 1.2 }); });
  nodes.forEach(n => {
    // earlier artifacts are real links (window.open is unreliable inside artifact frames)
    const host = n.hist && n.url ? el('a', { href: n.url, target: '_blank', rel: 'noopener' }) : tree;
    const g = el('g', n.hist ? { class: 'node', transform: `translate(${n.x},${n.y})` } : { class: 'node', transform: `translate(${n.x},${n.y})`, tabindex: 0, role: 'button' }, host);
    const txt = el('text', { 'text-anchor': 'middle', y: 4 }, g); txt.textContent = n.name;
    const w = Math.max(60, n.name.length * 7.2 + 18);
    const r = el('rect', { x: -w / 2, y: -13, width: w, height: 26, fill: n.hist ? '#f4f4f2' : (n.id === state.id ? '#e8ff00' : '#f4f4f2'), stroke: '#141410', 'stroke-dasharray': n.hist ? '3 3' : 'none' }, g);
    g.insertBefore(r, txt);
    const go = () => { if (n.hist) return; setChar(n.id); setMode('plate'); };
    g.addEventListener('click', go); g.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  });
}

// ---------- variant promotion ----------
canvas.addEventListener('click', e => {
  if (state.mode !== 'variants' || moved) return;
  const r = canvas.getBoundingClientRect();
  const i = Math.floor((e.clientX - r.left) / r.width * 3) + 3 * Math.floor((e.clientY - r.top) / r.height * 3);
  const spec = specs[state.id], seed = variantSeeds[i];
  if (i === 4) { pick.style.display = 'none'; return; }
  const cmd = `npm run new -- --from ${spec.id} --seed ${seed}`;
  pick.innerHTML = `<div>${spec.name} · variante ${seed}</div><code>${cmd}</code><button id="cp">Copia comando</button><button id="js">Copia JSON</button><button id="x">Chiudi</button>`;
  pick.style.display = 'block';
  const copy = (s, b) => Promise.resolve(navigator.clipboard?.writeText(s)).then(() => { b.textContent = 'Copiato'; }).catch(() => { const c = pick.querySelector('code'); c.textContent = s; getSelection().selectAllChildren(c); b.textContent = 'Seleziona e copia'; });
  pick.querySelector('#cp').onclick = (ev) => copy(cmd, ev.target);
  pick.querySelector('#js').onclick = (ev) => copy(JSON.stringify(mutate(spec, seed), null, 2), ev.target);
  pick.querySelector('#x').onclick = () => { pick.style.display = 'none'; };
});

// ---------- UI ----------
const chars = document.getElementById('chars'), modes = document.getElementById('modes');
const SERIES = [{ k: 'angeli', t: 'Angeli' }, { k: 'collettivo', t: 'Collettivo' }];
const seriesOf = (id) => specs[id].series || 'angeli';
const series = document.createElement('div'); series.className = 'series'; chars.appendChild(series);
SERIES.forEach(x => { const b = document.createElement('button'); b.textContent = x.t; b.dataset.series = x.k; b.onclick = () => { if (seriesOf(state.id) !== x.k) setChar(MAIN.find(id => seriesOf(id) === x.k)); }; series.appendChild(b); });
MAIN.forEach(id => { const b = document.createElement('button'); b.textContent = specs[id].name; b.dataset.k = id; b.dataset.s = seriesOf(id); b.onclick = () => setChar(id); chars.appendChild(b); });
MODES.forEach(m => { const b = document.createElement('button'); b.textContent = m.t; b.dataset.k = m.k; b.onclick = () => setMode(m.k); modes.appendChild(b); });
const sep = document.createElement('span'); sep.className = 'sep'; modes.appendChild(sep);
const LOOKS = [{ k: 'print', t: 'Stampa' }, { k: 'color', t: '3D' }];
LOOKS.forEach(l => { const b = document.createElement('button'); b.textContent = l.t; b.dataset.look = l.k; b.onclick = () => { state.look = l.k; actors.forEach(a => setLook(a.obj, l.k)); sync(); }; modes.appendChild(b); });
const glb = document.createElement('button'); glb.textContent = 'Scarica .glb'; glb.onclick = downloadGLB; modes.appendChild(glb);

// The model as a real 3D file: built fresh, posed at rest, in the lit colour materials.
function downloadGLB() {
  const ch = build(specs[state.id]); ch.still(true); setLook(ch.obj, 'color');
  const clip = bakeIdle(ch);
  new GLTFExporter().parse(ch.obj, (buf) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([buf], { type: 'model/gltf-binary' })); a.download = `${state.id}.glb`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, (e) => console.error(e), { binary: true, animations: [clip] });
}
function sync() {
  chars.querySelectorAll('button[data-k]').forEach(b => { b.setAttribute('aria-pressed', b.dataset.k === state.id); b.hidden = b.dataset.s !== seriesOf(state.id); });
  chars.querySelectorAll('button[data-series]').forEach(b => b.setAttribute('aria-pressed', b.dataset.series === seriesOf(state.id)));
  modes.querySelectorAll('button[data-k]').forEach(b => b.setAttribute('aria-pressed', b.dataset.k === state.mode));
  modes.querySelectorAll('button[data-look]').forEach(b => b.setAttribute('aria-pressed', b.dataset.look === state.look));
  try { localStorage.setItem('pa-id', state.id); localStorage.setItem('pa-mode', state.mode); localStorage.setItem('pa-look', state.look); } catch (e) {}
}
function setChar(id) { state.id = id; state.yaw = 0; load(); sync(); }
function setMode(m) { state.mode = m; load(); sync(); }

let drag = null, moved = false;
canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, yaw: state.yaw, tilt: state.tilt }; moved = false; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', e => {
  if (!drag) return;
  if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 4) moved = true;
  state.yaw = drag.yaw - (e.clientX - drag.x) * 0.008;
  state.tilt = Math.max(-0.9, Math.min(0.9, drag.tilt + (e.clientY - drag.y) * 0.006));
});
addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('wheel', e => { if (state.mode !== 'plate') return; e.preventDefault(); state.zoom = Math.max(0.45, Math.min(1.8, state.zoom * (1 + e.deltaY * 0.001))); }, { passive: false });

function resize() { stage.resize(plate.clientWidth, plate.clientHeight, EXPORT ? 1 : undefined); if (state.mode === 'tree') drawTree(); }
addEventListener('resize', resize);

const still = EXPORT || matchMedia('(prefers-reduced-motion: reduce)').matches;
const T0 = +(Q.get('t') || 2.5), start = performance.now();
let frames = 0;
function frame(now) {
  const t = still ? T0 : (now - start) / 1000;
  // export: draw a few frames, then idle (loop stays alive so the compositor keeps presenting the still)
  if (!(EXPORT && frames >= 6) && state.mode !== 'tree') {
    if (state.mode !== 'sheet') actors.forEach(ch => ch.up(t));
    stage.render(views(t), state.look);
  }
  if (++frames === 3) document.title += ' ·';  // export readiness marker
  requestAnimationFrame(frame);
}
resize(); load(); sync(); requestAnimationFrame(frame);
