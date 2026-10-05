// The inspector: properties of whatever is selected, generated from the schema.
import * as S from '../../engine/schema.js';
import { ROLES, ROLE_LABEL, FINISHES, PRINT_INKS, SCHEMES, STYLES, harmony, withPalette, oklch } from '../../engine/palette.js';
import { state, data, change, live, end, select, prefs, clone, emit } from '../core/store.js';
import { selLabel } from '../core/viewport.js';
import { fill } from '../core/thumbs.js';
import { $, $$, esc, icon, fmtNum, toast } from './dom.js';

const ROLE_OF_INK = { auto: null, blu: 'primary', toner: 'dark', fluo: 'accent', rosso: 'secondary', paper: 'light' };
const GROUP_ICON = { species: 'species', body: 'body', head: 'head', face: 'face', ears: 'ears', arms: 'arms', legs: 'legs', house: 'house', mask: 'mask', coat: 'coat', back: 'back', tail: 'tail', pose: 'pose', shell: 'shell', eyes: 'face', claws: 'claws' };
const GROUP_NOTE = {
  body: 'Shape and size of the torso. Everything else attaches to it.', head: 'Choose none to wear the face on the body (blobs, spirits).',
  face: 'Eyes are the logo: style, count, size and spacing.', ears: 'Ears, horns, antennae or fins.', arms: 'Arms and hands; held items ride on the hands.',
  legs: 'Legs, tentacles, or a wisp that makes it float.', house: 'Something on its back it did not build (optional).', pose: 'Expression, scale and idle motion.',
  mask: 'A face over the face: Noh, a carved long face, a helm, goggles or a veil of fringe.', coat: 'What covers the whole body: fur, straw, leaves, a hooded robe, hoops.',
  back: 'What grows from the back: gills and frills (sea slugs), bat wings, spines.', tail: 'Devil, curl or pom-pom.',
  shell: 'The borrowed shell of the hermit crab.', eyes: 'Eyes on stalks.', claws: 'One big claw, one small.',
};

// ---------- property rows ----------
const isRole = (g) => g.label === 'Colour role';
const segOK = (g) => g.type === 'enum' && g.options.length <= 4 && g.options.every(o => o.length <= 8);
function control(id, g, v) {
  const P = withPalette(state.spec.palette);
  if (g.type === 'bool') return `<button class="switch" role="switch" data-g="${id}" aria-checked="${!!v}" aria-label="${esc(g.label)}"><span></span></button>`;
  if (g.type === 'enum' && isRole(g)) return `<div class="roles" role="radiogroup" aria-label="${esc(g.label)}">${g.options.map(o => `<button role="radio" data-g="${id}" data-v="${o}" aria-checked="${o === v}" title="${esc(S.INK_ROLE[o])}" style="--c:${ROLE_OF_INK[o] ? P[ROLE_OF_INK[o]].color : 'repeating-linear-gradient(45deg,#555 0 3px,#999 3px 6px)'}"><span class="sr">${esc(S.INK_ROLE[o])}</span></button>`).join('')}<em>${esc(S.INK_ROLE[v] || v)}</em></div>`;
  if (segOK(g)) return `<div class="seg sm" role="radiogroup" aria-label="${esc(g.label)}">${g.options.map(o => `<button role="radio" data-g="${id}" data-v="${o}" aria-checked="${o === v}">${esc(o)}</button>`).join('')}</div>`;
  if (g.type === 'enum') return `<div class="select"><select data-g="${id}" aria-label="${esc(g.label)}">${g.options.map(o => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>${icon('down', 14)}</div>`;
  const step = g.type === 'int' ? 1 : (g.max - g.min) / 200, p = ((v - g.min) / (g.max - g.min)) * 100;
  return `<div class="num"><input type="range" data-g="${id}" min="${g.min}" max="${g.max}" step="${step}" value="${v}" style="--p:${p}%" aria-label="${esc(g.label)}"><input type="text" inputmode="decimal" class="val" data-n="${id}" value="${fmtNum(v, g.type === 'int')}" aria-label="${esc(g.label)} value"></div>`;
}
function rows(list) {
  return list.map(({ id, gene: g, value: v }) => {
    const L = state.locks.has(id), mod = JSON.stringify(v) !== JSON.stringify(g.def);
    return `<div class="prop${L ? ' locked' : ''}${mod ? ' mod' : ''}" data-row="${id}">
      <label class="pl" title="${esc(g.label)}${mod ? ' · double-click to reset' : ''}">${esc(g.label)}</label>
      <div class="pc">${control(id, g, v)}</div>
      <div class="pa">
        <button class="ib" data-reset="${id}" title="Reset to default (${esc(String(g.def))})" aria-label="Reset ${esc(g.label)}" ${mod ? '' : 'disabled'}>${icon('reset', 14)}</button>
        <button class="ib" data-die="${id}" title="Random value" aria-label="Random ${esc(g.label)}">${icon('dice', 14)}</button>
        <button class="ib lk" data-lock="${id}" aria-pressed="${L}" title="${L ? 'Locked: Randomize and Breed keep it' : 'Lock'}" aria-label="Lock ${esc(g.label)}">${icon(L ? 'lock' : 'unlock', 14)}</button>
      </div></div>`;
  }).join('');
}
const geneOf = (id) => S.genes(state.spec).find(x => x.id === id);
function roll(g) {
  if (g.type === 'enum') return g.options[Math.floor(Math.random() * g.options.length)];
  if (g.type === 'bool') return Math.random() < 0.7;
  const v = g.min + Math.random() * (g.max - g.min);
  return g.type === 'int' ? Math.round(v) : +v.toFixed(3);
}
const clamp = (g, v) => { v = Math.min(g.max, Math.max(g.min, v)); return g.type === 'int' ? Math.round(v) : +v.toFixed(3); };
// one delegated handler set per inspector render
function wire(root) {
  root.addEventListener('input', e => {
    const r = e.target.closest('input[type=range][data-g]'); if (!r) return;
    const x = geneOf(r.dataset.g), v = clamp(x.gene, +r.value);
    r.style.setProperty('--p', `${((v - x.gene.min) / (x.gene.max - x.gene.min)) * 100}%`);
    const box = root.querySelector(`[data-n="${CSS.escape(r.dataset.g)}"]`); if (box) box.value = fmtNum(v, x.gene.type === 'int');
    live(s => { S.setGene(s, r.dataset.g, v); });
  });
  root.addEventListener('change', e => {
    if (e.target.matches('input[type=range][data-g]')) { end(); return; }
    const n = e.target.closest('[data-n]');
    if (n) { const x = geneOf(n.dataset.n), v = parseFloat(n.value.replace(',', '.')); if (Number.isFinite(v)) change(s => { S.setGene(s, n.dataset.n, clamp(x.gene, v)); }); else n.value = fmtNum(x.value, x.gene.type === 'int'); return; }
    const sel = e.target.closest('select[data-g]'); if (sel) change(s => { S.setGene(s, sel.dataset.g, sel.value); });
  });
  root.addEventListener('keydown', e => {
    const n = e.target.closest('[data-n]'); if (!n || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const x = geneOf(n.dataset.n), g = x.gene, step = (g.type === 'int' ? 1 : (g.max - g.min) / 100) * (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1);
    change(s => { S.setGene(s, n.dataset.n, clamp(g, x.value + step)); });
  });
  root.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.v !== undefined && b.dataset.g) return change(s => { S.setGene(s, b.dataset.g, b.dataset.v); });
    if (b.classList.contains('switch')) return change(s => { S.setGene(s, b.dataset.g, b.getAttribute('aria-checked') !== 'true'); });
    if (b.dataset.reset) { const x = geneOf(b.dataset.reset); return change(s => { S.setGene(s, b.dataset.reset, x.gene.def); }); }
    if (b.dataset.die) { const x = geneOf(b.dataset.die); return change(s => { S.setGene(s, b.dataset.die, roll(x.gene)); }); }
    if (b.dataset.lock) { const id = b.dataset.lock; state.locks.has(id) ? state.locks.delete(id) : state.locks.add(id); return render(); }
  });
  root.addEventListener('dblclick', e => {
    const l = e.target.closest('.pl'); if (!l) return;
    const id = l.closest('[data-row]').dataset.row, x = geneOf(id);
    change(s => { S.setGene(s, id, x.gene.def); });
  });
}

// ---------- panel frame ----------
function frame(el, { ic, title, sub, actions = '', body }) {
  el.innerHTML = `<header class="ins-head"><span class="ins-ic">${icon(ic, 18)}</span><div class="ins-t"><h2>${esc(title)}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}</div><div class="ins-act">${actions}</div></header><div class="ins-body">${body}</div>`;
}
const sec = (title, body, extra = '') => `<section class="sec"><h3>${esc(title)}${extra}</h3>${body}</section>`;

// ---------- panels ----------
let el;
export function initInspector(root) { el = root; wire(el); }
export function render() {
  if (!el) return;
  const sel = state.sel, s = state.spec;
  if (sel === 'palette') return palette();
  if (sel === 'identity') return identity();
  if (sel === 'add') return library();
  if (sel === 'species') return species();
  if (sel?.startsWith('part:')) return part(+sel.split(':')[1]);
  const groups = S.anatomyOf(s).filter(a => a.id !== 'species');
  const grp = groups.find(a => a.id === sel) || groups[0];
  const list = S.genes(s).filter(x => x.group === grp.id);
  const allLocked = list.every(x => state.locks.has(x.id));
  frame(el, {
    ic: GROUP_ICON[grp.id] || 'body', title: grp.label, sub: `${S.ARCHETYPES[S.speciesOf(s)].label} · ${list.length} properties`,
    actions: `<button class="ib" id="gRand" title="Randomize this group (locked stay)">${icon('dice')}</button><button class="ib" id="gReset" title="Reset this group">${icon('reset')}</button><button class="ib" id="gLock" aria-pressed="${allLocked}" title="${allLocked ? 'Unlock group' : 'Lock group'}">${icon(allLocked ? 'lock' : 'unlock')}</button>`,
    body: `<p class="hint">${esc(GROUP_NOTE[grp.id] || '')}</p>${sec('Properties', rows(list))}`,
  });
  $('#gRand', el).onclick = () => change(sp => { list.forEach(x => { if (!state.locks.has(x.id)) S.setGene(sp, x.id, roll(x.gene)); }); });
  $('#gReset', el).onclick = () => change(sp => { list.forEach(x => { if (!state.locks.has(x.id)) S.setGene(sp, x.id, x.gene.def); }); });
  $('#gLock', el).onclick = () => { list.forEach(x => allLocked ? state.locks.delete(x.id) : state.locks.add(x.id)); render(); emit('locks'); };
}

function part(n) {
  const p = state.spec.parts?.[n];
  if (!p) { select('body'); return; }
  const def = S.PARTS[p.type] || { label: p.type, genes: [] };
  const list = S.genes(state.spec).filter(x => x.part === n);
  frame(el, {
    ic: 'part', title: def.label, sub: `${def.series}${def.anchored ? ' · rides on the body' : ''}`,
    actions: `<button class="ib" id="pRand" title="Randomize part">${icon('dice')}</button><button class="ib" id="pDup" title="Duplicate">${icon('copy')}</button><button class="ib danger" id="pDel" title="Remove (Delete)">${icon('trash')}</button>`,
    body: `<p class="hint">${esc(def.note || '')}</p>${sec('Properties', rows(list.filter(x => !x.gene.common)))}${sec('Placement', `<p class="hint">${icon('move', 13)} Or drag it in the viewport.</p>` + rows(list.filter(x => x.gene.common)))}`,
  });
  $('#pRand', el).onclick = () => change(sp => { def.genes.forEach(g => { if (!state.locks.has(`parts.${n}.${g.key}`)) S.set(sp.parts[n], g.key, roll(g)); }); });
  $('#pDup', el).onclick = () => { change(sp => { const q = clone(sp.parts[n]); q.move = [(q.move?.[0] || 0) + 0.4, q.move?.[1] || 0, q.move?.[2] || 0]; sp.parts.push(q); }); select(`part:${state.spec.parts.length - 1}`); };
  $('#pDel', el).onclick = () => removePart(n);
}
export function removePart(n) {
  const label = selLabel(`part:${n}`);
  change(s => { s.parts.splice(n, 1); });
  select('add'); toast(`Removed ${label} · ⌘Z to undo`);
}

function identity() {
  const s = state.spec;
  frame(el, {
    ic: 'id', title: 'Identity', sub: `${s.id}.json`,
    body: sec('Character', `
      <label class="field"><span>Name</span><input id="fName" value="${esc(s.name)}"></label>
      <label class="field"><span>File id</span><input id="fId" value="${esc(s.id)}" spellcheck="false"><small>Lowercase, digits and dashes. Saving writes <code>${esc(s.id)}.json</code>.</small></label>
      <label class="field"><span>Concept</span><textarea id="fConcept" rows="4" placeholder="What it is, what it gives to the time bank">${esc(s.concept || '')}</textarea></label>
      <label class="field"><span>References</span><input id="fRefs" value="${esc((s.refs || []).join(', '))}" placeholder="Comma separated"></label>`)
      + sec('Origin', `<dl class="meta"><dt>Parent</dt><dd>${esc(s.parent || '—')}</dd>${s.prompt ? `<dt>Prompt</dt><dd>“${esc(s.prompt)}”</dd>` : ''}<dt>Series</dt><dd>${esc(data.seriesOf[state.key] || 'drafts')}</dd></dl>`),
  });
  const bind = (id, fn) => $(`#${id}`, el).addEventListener('change', e => change(sp => { fn(sp, e.target.value); }, 'meta'));
  bind('fName', (sp, v) => { sp.name = v.trim() || sp.name; });
  bind('fConcept', (sp, v) => { sp.concept = v; });
  bind('fId', (sp, v) => { sp.id = v.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '') || sp.id; });
  bind('fRefs', (sp, v) => { sp.refs = v.split(',').map(x => x.trim()).filter(Boolean); });
}

function species() {
  const cur = S.speciesOf(state.spec);
  frame(el, {
    ic: 'species', title: 'Species', sub: S.ARCHETYPES[cur].label,
    body: `<p class="hint">A starting point. Switching keeps the name, palette and apparatus, and replaces the body; then shape every module from the Layers panel.</p>`
      + sec('Archetypes', `<div class="cards">${Object.entries(S.ARCHETYPES).map(([k, a]) => `<button class="card${k === cur ? ' on' : ''}" data-arch="${k}" aria-pressed="${k === cur}"><img alt="" data-thumb="${k}"><b>${esc(a.label)}</b><small>${esc(a.note)}</small></button>`).join('')}</div>`)
      + `<div class="actions"><button class="btn" id="spRand">${icon('dice', 15)}Random species</button></div>`,
  });
  $$('[data-thumb]', el).forEach(img => fill(img, S.applyArchetype({ ...clone(state.spec), parts: [] }, img.dataset.thumb), state.look));
  el.querySelectorAll('[data-arch]').forEach(b => b.onclick = () => { change(sp => S.applyArchetype(sp, b.dataset.arch)); select('body'); });
  $('#spRand', el).onclick = () => { const ks = Object.keys(S.ARCHETYPES), k = ks[Math.floor(Math.random() * ks.length)]; change(sp => { const r = S.randomize(Math.floor(Math.random() * 1e6), new Set(['palette', 'parts.*', 'id']), S.applyArchetype(sp, k)); r.id = sp.id; r.name = sp.name; return r; }); };
}

const SERIES_LABEL = { angeli: 'Angeli', collettivo: 'Collettivo', banca: 'Banca del tempo' };
function library() {
  const f = prefs.get('libFilter', 'all');
  const demo = S.applyArchetype({ id: 'demo', name: 'demo', palette: clone(state.spec.palette || {}), parts: [] }, state.spec.plan === 'figure' ? S.speciesOf(state.spec) : 'crab');
  const cards = Object.entries(S.PARTS).filter(([, p]) => f === 'all' || p.series === f).filter(([, p]) => state.spec.plan !== 'figure' || !p.wraps);
  frame(el, {
    ic: 'plus', title: 'Add part', sub: `${cards.length} parts`,
    body: `<p class="hint">The apparatus is what makes each one a character. Parts attach where they belong; drag them to place.</p>
      <div class="seg wide" role="tablist">${['all', 'angeli', 'collettivo', 'banca'].map(k => `<button role="tab" data-f="${k}" aria-selected="${f === k}">${k === 'all' ? 'All' : SERIES_LABEL[k]}</button>`).join('')}</div>
      <div class="cards">${cards.map(([t, p]) => `<button class="card" data-t="${t}"><img alt="" data-part="${t}"><b>${esc(p.label)}</b><small>${esc(p.note)}</small></button>`).join('')}</div>`,
  });
  $$('[data-part]', el).forEach(img => fill(img, { ...demo, parts: [S.newPart(img.dataset.part)] }, state.look));
  el.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { prefs.set('libFilter', b.dataset.f); library(); });
  el.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { change(s => { (s.parts ||= []).push(S.newPart(b.dataset.t)); }); select(`part:${state.spec.parts.length - 1}`); });
}

const swatch = (P) => `<i class="sw">${ROLES.map(r => `<b style="background:${P[r].color}"></b>`).join('')}</i>`;
function palette() {
  const P = withPalette(state.spec.palette), L = state.locks.has('palette');
  const hue = +prefs.get('hue', 260), scheme = prefs.get('scheme', 'triadic'), style = prefs.get('style', 'candy');
  frame(el, {
    ic: 'drop', title: 'Palette', sub: 'Six roles · colour, finish, print ink',
    actions: `<button class="ib" id="palLock" aria-pressed="${L}" title="${L ? 'Palette locked' : 'Lock palette'}">${icon(L ? 'lock' : 'unlock')}</button>`,
    body: `<div class="strip">${ROLES.map(r => `<span style="background:${P[r].color}" title="${esc(ROLE_LABEL[r])}"></span>`).join('')}</div>`
      + sec('Brand palettes', `<div class="pals">${Object.entries(data.brand.palettes).map(([n, p]) => `<button class="pal" data-p="${esc(n)}">${swatch(withPalette(p))}<span>${esc(n)}</span></button>`).join('')}</div>`)
      + sec('Generate a harmony', `
        <div class="prop"><label class="pl">Hue</label><div class="pc"><input type="range" id="hHue" class="hue" min="0" max="360" step="1" value="${hue}"></div><div class="pa"></div></div>
        <div class="prop"><label class="pl">Scheme</label><div class="pc"><div class="select"><select id="hScheme">${Object.keys(SCHEMES).map(k => `<option ${k === scheme ? 'selected' : ''}>${k}</option>`).join('')}</select>${icon('down', 14)}</div></div><div class="pa"></div></div>
        <div class="prop"><label class="pl">Style</label><div class="pc"><div class="select"><select id="hStyle">${Object.keys(STYLES).map(k => `<option ${k === style ? 'selected' : ''}>${k}</option>`).join('')}</select>${icon('down', 14)}</div></div><div class="pa"></div></div>
        <div class="actions"><button class="btn primary" id="hGo">Apply harmony</button><button class="btn" id="hRand">${icon('dice', 15)}Surprise</button></div>`, '<span class="tag">OKLCH</span>')
      + sec('Roles', ROLES.map(r => `<div class="role"><label class="chip-c" style="--c:${P[r].color}"><input type="color" data-c="${r}" value="${P[r].color}" aria-label="${esc(ROLE_LABEL[r])} colour"></label>
          <div class="role-t"><b>${esc(ROLE_LABEL[r])}</b><code data-hex="${r}">${P[r].color}</code></div>
          <div class="select"><select data-f="${r}" aria-label="${esc(ROLE_LABEL[r])} finish">${FINISHES.map(f => `<option ${f === P[r].finish ? 'selected' : ''}>${f}</option>`).join('')}</select>${icon('down', 14)}</div>
          <div class="select" title="Print ink"><select data-i="${r}" aria-label="${esc(ROLE_LABEL[r])} print ink">${PRINT_INKS.map(f => `<option ${f === P[r].print ? 'selected' : ''}>${f}</option>`).join('')}</select>${icon('down', 14)}</div></div>`).join('')
        + '<p class="hint">Last column: the press ink each role is screened with in the Print look.</p>', '<span class="tag">finish · ink</span>'),
  });
  const hh = $('#hHue', el);
  hh.style.background = `linear-gradient(90deg,${Array.from({ length: 13 }, (_, k) => oklch(0.72, 0.15, k * 30)).join(',')})`;
  const remember = () => { prefs.set('hue', hh.value); prefs.set('scheme', $('#hScheme', el).value); prefs.set('style', $('#hStyle', el).value); };
  hh.addEventListener('input', () => { remember(); live(s => { s.palette = harmony(+hh.value, $('#hScheme', el).value, $('#hStyle', el).value); }, 'paint'); refreshRoles(); });
  hh.addEventListener('change', () => { end(); render(); });
  $('#hGo', el).onclick = () => { remember(); change(s => { s.palette = harmony(+hh.value, $('#hScheme', el).value, $('#hStyle', el).value); }, 'paint'); };
  $('#hRand', el).onclick = () => {
    const h = Math.floor(Math.random() * 360), sc = Object.keys(SCHEMES)[Math.floor(Math.random() * 6)], st = Object.keys(STYLES)[Math.floor(Math.random() * 5)];
    prefs.set('hue', h); prefs.set('scheme', sc); prefs.set('style', st); change(s => { s.palette = harmony(h, sc, st); }, 'paint');
  };
  $('#palLock', el).onclick = () => { L ? state.locks.delete('palette') : state.locks.add('palette'); render(); emit('locks'); };
  el.querySelectorAll('[data-p]').forEach(b => b.onclick = () => change(s => { s.palette = clone(data.brand.palettes[b.dataset.p]); }, 'paint'));
  el.querySelectorAll('[data-c]').forEach(inp => {
    inp.addEventListener('input', () => { live(s => { s.palette = withPalette(s.palette); s.palette[inp.dataset.c].color = inp.value; }, 'paint'); inp.parentElement.style.setProperty('--c', inp.value); $(`[data-hex="${inp.dataset.c}"]`, el).textContent = inp.value; });
    inp.addEventListener('change', () => { end(); render(); });
  });
  el.querySelectorAll('[data-f]').forEach(sel => sel.onchange = () => change(s => { s.palette = withPalette(s.palette); s.palette[sel.dataset.f].finish = sel.value; }, 'paint'));
  el.querySelectorAll('[data-i]').forEach(sel => sel.onchange = () => change(s => { s.palette = withPalette(s.palette); s.palette[sel.dataset.i].print = sel.value; }, 'paint'));
  function refreshRoles() { const Q = withPalette(state.spec.palette); el.querySelectorAll('[data-c]').forEach(i => { i.value = Q[i.dataset.c].color; i.parentElement.style.setProperty('--c', i.value); $(`[data-hex="${i.dataset.c}"]`, el).textContent = i.value; }); $$('.strip span', el).forEach((sp, k) => { sp.style.background = Q[ROLES[k]].color; }); }
}
