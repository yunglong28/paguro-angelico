// Brand style sheet: the cast rendered live through brand tokens (engine/style.js), with dials to modulate them.
import { createStage, setLook, setStyle, ink } from '../engine/press.js';
import { build } from '../engine/build.js';
import { AXES, DEFAULT_TOKENS, applyStyle, setAxis, withDefaults } from '../engine/style.js';

const ROOT = new URL('../', import.meta.url);
const getJSON = (p) => fetch(new URL(p, ROOT)).then(r => r.json());
const $ = (id) => document.getElementById(id);

// ---------- data ----------
const entries = await getJSON('characters/index.json');
const specs = Object.fromEntries(await Promise.all(entries.map(async e => [e.split('/').pop(), await getJSON(`characters/${e}.json`)])));
const MAIN = Object.keys(specs).filter(id => !specs[id].seed_of);
const fileTokens = await getJSON('brand/tokens.json').catch(() => DEFAULT_TOKENS);

const LOOKS = [{ k: 'y2k', t: 'Y2K' }, { k: 'color', t: '3D' }, { k: 'print', t: 'Stampa' }];
const state = { zoom: 1, id: MAIN.includes('angelo-di-mare') ? 'angelo-di-mare' : MAIN[0], look: 'y2k', tokens: withDefaults(fileTokens), yaw: 0.35, tilt: 0.06 };
// the address bar carries the state: #c=<id>&look=<look>&t=<tokens json>
try {
  const H = new URLSearchParams(location.hash.slice(1));
  if (specs[H.get('c')]) state.id = H.get('c');
  if (LOOKS.some(l => l.k === H.get('look'))) state.look = H.get('look');
  if (H.get('t')) state.tokens = withDefaults(JSON.parse(H.get('t')));
} catch (e) {}
setStyle(state.tokens);
$('ver').textContent = state.tokens.version;

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const hero = createStage($('hero')), sheet = createStage($('sheetc'));

// soft contact shadow under a figure (3D and Y2K looks only)
function ground(stage, ch) {
  ch.still(true); ch.up(2.5);
  const b = new stage.THREE.Box3().setFromObject(ch.obj);
  const size = b.getSize(new stage.THREE.Vector3()), mid = b.getCenter(new stage.THREE.Vector3());
  // camera distance that fits the whole figure (fov 30°), and the height to aim at
  ch.frame = { dist: Math.max(size.y, size.x * 0.85, size.z * 0.85) / (2 * Math.tan(Math.PI / 12)) * 1.12 + size.z / 2, lift: mid.y };
  const g = new stage.THREE.Mesh(new stage.THREE.CircleGeometry(9, 64), new stage.THREE.ShadowMaterial({ opacity: 0.22 }));
  g.rotation.x = -Math.PI / 2; g.position.y = b.min.y - 0.01; g.userData.ground = true; g.receiveShadow = true;
  ch.obj.add(g); ch.still(false);
}
const actors = { hero: null, sheet: null };
function mount(stage, key) {
  if (actors[key]) { stage.scene.remove(actors[key].obj); actors[key].obj.traverse(o => o.geometry && o.geometry.dispose()); }
  const ch = build(applyStyle(specs[state.id], state.tokens));
  ground(stage, ch); setLook(ch.obj, state.look); stage.scene.add(ch.obj);
  actors[key] = ch;
}
function rebuild() { mount(hero, 'hero'); mount(sheet, 'sheet'); dirty = true; }
// materials only: re-skin what is already built
function reskin() { setStyle(state.tokens); Object.values(actors).forEach(a => a && setLook(a.obj, state.look)); matrix.reskin(); dirty = true; }

// ---------- 03 inks × looks: five balls per look, each look its own stage ----------
const INKS = [
  { k: 'toner', base: 0.3, shade: 0.7, hex: '#141410', roles: ['Black screen at 15°', 'Graphite shade', 'Chrome'] },
  { k: 'blu', base: 0.36, shade: 0.64, hex: '#001ef7', roles: ['Blue screen at 75°', 'Painted blue', 'Candy plastic, iridescent'] },
  { k: 'fluo', base: 1, shade: 0, hex: '#e8ff00', roles: ['Flat spot ink', 'Lit yellow', 'Glowing gel'] },
  { k: 'rosso', base: 1, shade: 0, hex: '#e3211a', roles: ['Flat spot ink (Collettivo)', 'Constructivist red', 'Glowing gel'] },
  { k: 'paper', base: 0.3, shade: 0.7, hex: '#f4f4f2', roles: ['The stock', 'White', 'White clearcoat'] },
];
const matrix = (() => {
  const el = $('matrix'); const balls = [];
  el.innerHTML = `<div class="corner">ink →<br>look ↓</div>` + INKS.map(i => `<div class="ink"><i style="background:${i.hex}"></i>${i.k}</div>`).join('');
  const stages = LOOKS.map(l => {
    el.insertAdjacentHTML('beforeend', `<div class="look"><div>${l.t}<small>${{ y2k: 'pre-rendered', color: 'lit 3D', print: 'halftone' }[l.k]}</small></div></div>`);
    const c = document.createElement('canvas'); c.setAttribute('aria-label', `The five inks as ${l.t} material balls`); el.appendChild(c);
    const st = createStage(c, { noShadow: true });
    INKS.forEach((i, n) => {
      const m = new st.THREE.Mesh(new st.THREE.SphereGeometry(0.42, 48, 32), ink(i.k, i.base, i.shade));
      st.scene.add(m); setLook(m, l.k); balls.push({ m, look: l.k });
    });
    const mine = balls.slice(-INKS.length);
    const views = mine.map((b, n) => ({ x: n / INKS.length, y: 0, w: 1 / INKS.length, h: 1, yaw: 0, tilt: 0.12, dist: 3.1, before: () => mine.forEach(o => { o.m.visible = o === b; }) }));
    return { st, c, look: l.k, views };
  });
  INKS[0].roles.forEach((_, r) => el.insertAdjacentHTML('beforeend', `<div class="roles"><div>${LOOKS[[2, 1, 0][r]].t}</div>${INKS.map(i => `<div>${i.roles[r]}</div>`).join('')}</div>`));
  return {
    reskin() { balls.forEach(b => setLook(b.m, b.look)); },
    resize() { stages.forEach(s => s.st.resize(s.c.clientWidth, s.c.clientHeight)); },
    render() { stages.forEach(s => s.st.render(s.views, s.look)); },
  };
})();

// ---------- 01 dials ----------
const pct = (inp) => inp.style.setProperty('--p', `${(inp.value - inp.min) / (inp.max - inp.min) * 100}%`);
$('dials').innerHTML = Object.entries(AXES).map(([k, a]) => `
  <div class="dial"><div class="top"><label for="ax-${k}">${a.label}</label><output id="axo-${k}"></output></div>
  <p class="note">${a.note}</p>
  <input type="range" id="ax-${k}" min="0" max="1" step="0.01" aria-describedby="axe-${k}">
  <div class="ends" id="axe-${k}"><span>${a.lo}</span><span>${a.hi}</span></div></div>`).join('');

// fine tokens: every leaf of the token tree that a dial can reach, plus a few extras
const FINE = [
  ['Proportion', [['proportion.eyes', 'eyes', 0.5, 2], ['proportion.stalk', 'stalk', 0.2, 1.8], ['proportion.body', 'body', 0.7, 1.4], ['proportion.bumps', 'bumps', 0, 2], ['proportion.claws', 'claws', 0.5, 1.6]]],
  ['Motion', [['motion.float', 'float', 0, 2.5], ['motion.sway', 'sway', 0, 2]]],
  ['Chrome · toner', [['y2k.chrome.roughness', 'roughness', 0, 0.8], ['y2k.chrome.env', 'reflection', 0.2, 2.5]]],
  ['Candy · blu', [['y2k.plastic.roughness', 'roughness', 0, 0.8], ['y2k.plastic.clearcoat', 'clearcoat', 0, 1], ['y2k.plastic.iridescence', 'iridescence', 0, 1], ['y2k.plastic.sheen', 'sheen', 0, 1]]],
  ['Gel · fluo, rosso', [['y2k.gel.glow', 'glow', 0, 0.6]]],
  ['Sky', [['y2k.sky.top', 'top', 'color'], ['y2k.sky.mid', 'horizon colour', 'color'], ['y2k.sky.bottom', 'floor', 'color'], ['y2k.sky.horizon', 'horizon at', 0.2, 0.9]]],
];
const get = (o, p) => p.split('.').reduce((a, k) => a?.[k], o);
const set = (o, p, v) => { const ks = p.split('.'), last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; };
$('tokens').innerHTML = FINE.map(([g, rows]) => `<div class="group"><h4>${g}</h4>${rows.map(([p, l, lo, hi]) => {
  const id = 'tk-' + p.replace(/\./g, '-');
  return lo === 'color'
    ? `<div class="tok"><label for="${id}">${l}</label><input type="color" id="${id}" data-p="${p}"><output for="${id}"></output></div>`
    : `<div class="tok"><label for="${id}">${l}</label><input type="range" id="${id}" data-p="${p}" min="${lo}" max="${hi}" step="0.01"><output for="${id}"></output></div>`;
}).join('')}</div>`).join('');

const isShape = (p) => p.startsWith('proportion.') || p.startsWith('motion.');
let rebuildTimer = 0;
const later = () => { clearTimeout(rebuildTimer); rebuildTimer = setTimeout(rebuild, 140); };

function refresh() {
  const t = state.tokens;
  for (const k of Object.keys(AXES)) { const i = $(`ax-${k}`); i.value = t.axes[k]; pct(i); $(`axo-${k}`).textContent = (+t.axes[k]).toFixed(2); }
  document.querySelectorAll('#tokens input').forEach(i => { const v = get(t, i.dataset.p); i.value = v; i.nextElementSibling.textContent = typeof v === 'number' ? v.toFixed(2) : v; if (i.type === 'range') pct(i); });
  const json = JSON.stringify(t, null, 2);
  $('json').textContent = json;
  $('open').href = `../viewer/?c=${state.id}&look=${state.look}&tokens=${encodeURIComponent(JSON.stringify(t))}`;
  history.replaceState(null, '', `#c=${state.id}&look=${state.look}&t=${encodeURIComponent(JSON.stringify(t))}`);
  document.querySelectorAll('#chars .chip').forEach(b => b.setAttribute('aria-pressed', b.dataset.k === state.id));
  document.querySelectorAll('#looks .chip').forEach(b => b.setAttribute('aria-pressed', b.dataset.k === state.look));
  $('heroTag').textContent = LOOKS.find(l => l.k === state.look).t;
}

for (const k of Object.keys(AXES)) $(`ax-${k}`).addEventListener('input', e => {
  state.tokens = setAxis(state.tokens, k, +e.target.value);
  refresh(); k === 'kawaii' ? later() : reskin();
});
document.querySelectorAll('#tokens input').forEach(i => i.addEventListener('input', () => {
  set(state.tokens, i.dataset.p, i.type === 'range' ? +i.value : i.value);
  refresh(); isShape(i.dataset.p) ? later() : reskin();
}));

// ---------- pickers ----------
LOOKS.forEach(l => {
  const b = Object.assign(document.createElement('button'), { className: 'chip look', textContent: l.t });
  b.dataset.k = l.k; b.onclick = () => { state.look = l.k; reskin(); refresh(); }; $('looks').appendChild(b);
});
MAIN.forEach(id => {
  const b = Object.assign(document.createElement('button'), { className: 'chip', textContent: specs[id].name });
  b.dataset.k = id; b.onclick = () => { state.id = id; rebuild(); refresh(); }; $('chars').appendChild(b);
});
$('exLabels').innerHTML = ['quiete', 'estasi', 'stupore', 'ira', 'pieta', 'sonno'].map(e => `<span>${e}</span>`).join('');

// ---------- export ----------
$('dl').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(state.tokens, null, 2) + '\n'], { type: 'application/json' }));
  a.download = 'tokens.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};
$('copy').onclick = async (e) => {
  try { await navigator.clipboard.writeText(JSON.stringify(state.tokens, null, 2)); e.target.textContent = 'Copied'; }
  catch (err) { e.target.textContent = 'Select the JSON above'; }
  setTimeout(() => { e.target.textContent = 'Copy JSON'; }, 1600);
};
$('reset').onclick = () => { state.tokens = withDefaults(fileTokens); reskin(); rebuild(); refresh(); };

// ---------- drag the plate ----------
let drag = null;
const hc = $('hero');
hc.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, yaw: state.yaw, tilt: state.tilt }; hc.setPointerCapture(e.pointerId); });
hc.addEventListener('pointermove', e => {
  if (!drag) return;
  state.yaw = drag.yaw - (e.clientX - drag.x) * 0.008;
  state.tilt = Math.max(-0.9, Math.min(0.9, drag.tilt + (e.clientY - drag.y) * 0.006));
});
addEventListener('pointerup', () => { drag = null; });
hc.addEventListener('wheel', e => { e.preventDefault(); state.zoom = Math.max(0.45, Math.min(1.8, state.zoom * (1 + e.deltaY * 0.001))); }, { passive: false });

// ---------- render ----------
function sheetViews() {
  const ch = actors.sheet, out = [];
  [0, Math.PI / 4, Math.PI / 2, Math.PI].forEach((a, i) => out.push({ x: i / 4, y: 0.36, w: 1 / 4, h: 0.64, yaw: a, tilt: 0.04, dist: ch.frame.dist, lift: ch.frame.lift, fit: true,
    before: () => { ch.setExpression(ch.spec.expression || 'quiete'); ch.still(true); ch.up(2.5); ch.obj.children[0].rotation.y = 0; } }));
  ch.still(true); ch.up(2.5); ch.obj.children[0].rotation.y = 0;
  const face = ch.face();
  ch.expressions.forEach((e, i) => out.push({ x: i / 6, y: 0, w: 1 / 6, h: 0.36, yaw: 0.15, tilt: 0.1, dist: ch.spec.faceDist || 3, lift: face.y - 0.12,
    before: () => { ch.setExpression(e); ch.still(true); ch.up(2.5); ch.obj.children[0].rotation.y = 0; } }));
  return out;
}
function resize() {
  const f = (c) => [c.clientWidth, c.clientHeight];
  hero.resize(...f($('hero'))); sheet.resize(...f($('sheetc'))); matrix.resize(); dirty = true;
}
addEventListener('resize', resize);

let dirty = true, frames = 0;
const start = performance.now();
// ?still: draw a few frames and stop (headless screenshots)
const STILL = new URLSearchParams(location.search).has('still');
function frame(now) {
  if (STILL && frames++ > 4) return;
  const t = reduced || STILL ? 2.5 : (now - start) / 1000;
  const ch = actors.hero;
  ch.up(t);
  hero.render([{ x: 0, y: 0, w: 1, h: 1, yaw: state.yaw, tilt: state.tilt, dist: ch.frame.dist * state.zoom, lift: ch.frame.lift, fit: true }], state.look);
  // the sheet and the matrix only change when the tokens do
  if (dirty) { sheet.render(sheetViews(), state.look); matrix.render(); dirty = false; }
  requestAnimationFrame(frame);
}
rebuild(); refresh(); resize(); requestAnimationFrame(frame);
