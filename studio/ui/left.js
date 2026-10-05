// Left side: an icon rail switching three panels — Cast (every character), Layers (this character's
// structure), Brand (palettes and stage shared by everyone).
import * as S from '../../engine/schema.js';
import { ROLES, withPalette } from '../../engine/palette.js';
import { setStage } from '../../engine/press.js';
import { state, data, dirty, select, open, adopt, specOf, mainCast, prefs, ROOT, emit } from '../core/store.js';
import { selLabel } from '../core/viewport.js';
import { fill } from '../core/thumbs.js';
import { removePart } from './inspector.js';
import { $, $$, esc, icon, toast, menu } from './dom.js';

const TABS = [{ k: 'cast', t: 'Cast', icon: 'users', key: 'C' }, { k: 'layers', t: 'Layers', icon: 'layers', key: 'L' }, { k: 'brand', t: 'Brand', icon: 'brand', key: 'B' }];
const SERIES_LABEL = { angeli: 'Angeli', collettivo: 'Collettivo', banca: 'Banca del tempo', drafts: 'Drafts' };
let rail, panel, tab = prefs.get('tab', 'layers'), query = '', filter = 'all';

export function initLeft(railEl, panelEl) {
  rail = railEl; panel = panelEl;
  rail.innerHTML = TABS.map(t => `<button class="rail-b" data-tab="${t.k}" title="${t.t} (${t.key})" aria-label="${t.t}">${icon(t.icon, 20)}<span>${t.t}</span></button>`).join('');
  rail.onclick = (e) => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); };
  renderLeft();
}
export function showTab(k) { tab = k; prefs.set('tab', k); document.body.classList.add('show-left'); renderLeft(); }
export function renderLeft() {
  if (!panel) return;
  $$('[data-tab]', rail).forEach(b => b.setAttribute('aria-current', b.dataset.tab === tab));
  ({ cast, layers, brand })[tab]();
}

// ---------- Cast ----------
function cast() {
  const keys = mainCast();
  const groups = {};
  keys.forEach(k => { const s = data.seriesOf[k]; if (filter !== 'all' && s !== filter) return; const sp = specOf(k); if (query && !`${sp.name} ${k}`.toLowerCase().includes(query)) return; (groups[s] ||= []).push(k); });
  const ser = [...new Set(keys.map(k => data.seriesOf[k]))];
  panel.innerHTML = `<header class="lp-head"><h2>Cast</h2><span class="count">${keys.length}</span><button class="btn sm primary" id="newBtn" aria-haspopup="menu">${icon('plus', 14)}New</button></header>
    <div class="lp-tools"><label class="search">${icon('search', 15)}<input id="castQ" type="search" placeholder="Search characters" value="${esc(query)}" aria-label="Search characters"></label>
    <div class="chips" role="tablist">${['all', ...ser].map(s => `<button role="tab" data-ser="${s}" aria-selected="${filter === s}">${esc(s === 'all' ? 'All' : SERIES_LABEL[s] || s)}</button>`).join('')}</div></div>
    <div class="lp-body cast">${Object.entries(groups).map(([g, ks]) => `<h3 class="grp">${esc(SERIES_LABEL[g] || g)}<span>${ks.length}</span></h3>` + ks.map(k => {
      const sp = specOf(k);
      return `<button class="crow" data-k="${esc(k)}" aria-current="${k === state.key}"><img alt="" data-ck="${esc(k)}"><span class="ct"><b>${esc(sp.name || k)}</b><small>${esc(S.ARCHETYPES[S.speciesOf(sp)].label)}</small></span>${dirty.has(k) ? '<i class="dirty" title="Unsaved changes"></i>' : ''}</button>`;
    }).join('')).join('') || '<p class="empty">No character matches.</p>'}</div>`;
  $$('[data-ck]', panel).forEach(img => fill(img, specOf(img.dataset.ck), 'y2k', { priority: img.dataset.ck === state.key }));
  panel.querySelector('.lp-body').onclick = (e) => { const b = e.target.closest('[data-k]'); if (b) open(b.dataset.k); };
  const q = $('#castQ', panel);
  q.oninput = () => { query = q.value.trim().toLowerCase(); cast(); const n = $('#castQ', panel); n.focus(); n.setSelectionRange(n.value.length, n.value.length); };
  $$('[data-ser]', panel).forEach(b => b.onclick = () => { filter = b.dataset.ser; cast(); });
  $('#newBtn', panel).onclick = (e) => newMenu(e.currentTarget);
}
export function newMenu(anchor) {
  const seed = () => Math.floor(Math.random() * 1e6);
  menu(anchor, [
    { label: 'Random character', hint: 'Any species, any palette', icon: 'dice', kbd: 'N', run: () => { const s = seed(); adopt(S.randomize(s)); toast(`New random character (seed ${s})`); } },
    '-',
    ...Object.entries(S.ARCHETYPES).map(([k, a]) => ({ label: a.label, hint: a.note, icon: 'species', run: () => { const r = S.randomize(seed()); adopt(S.applyArchetype(r, k)); toast(`New ${a.label.toLowerCase()}`); } })),
  ]);
}

// ---------- Layers ----------
const GROUP_ICON = { body: 'body', head: 'head', face: 'face', ears: 'ears', arms: 'arms', legs: 'legs', house: 'house', back: 'back', tail: 'tail', pose: 'pose', shell: 'shell', eyes: 'face', claws: 'claws' };
function layers() {
  const s = state.spec, P = withPalette(s.palette);
  const row = (sel, ic, label, extra = '', level = 1) => `<div class="lrow" data-sel="${sel}" aria-current="${state.sel === sel}" role="treeitem" tabindex="0" style="--lv:${level}">${icon(ic, 16)}<span class="lt">${label}</span>${extra}</div>`;
  const locked = (id) => S.genes(s).some(x => x.group === id && state.locks.has(x.id)) ? `<span class="lk" title="Has locked genes">${icon('lock', 12)}</span>` : '';
  panel.innerHTML = `<header class="lp-head"><h2 title="${esc(s.name)}">${esc(s.name || s.id)}</h2>${dirty.has(state.key) ? '<i class="dirty" title="Unsaved changes"></i>' : ''}</header>
    <div class="lp-body tree" role="tree">
      ${row('identity', 'id', 'Identity', `<span class="sub">${esc(s.id)}</span>`, 0)}
      ${row('species', 'species', 'Species', `<span class="sub">${esc(S.ARCHETYPES[S.speciesOf(s)].label)}</span>`, 0)}
      <h3 class="grp">Anatomy</h3>
      ${S.anatomyOf(s).filter(a => a.id !== 'species').map(a => row(a.id, GROUP_ICON[a.id] || 'body', esc(a.label), locked(a.id))).join('')}
      <h3 class="grp">Colour</h3>
      ${row('palette', 'drop', 'Palette', `<i class="sw">${ROLES.map(r => `<b style="background:${P[r].color}"></b>`).join('')}</i>${state.locks.has('palette') ? `<span class="lk">${icon('lock', 12)}</span>` : ''}`)}
      <h3 class="grp">Apparatus <button class="ib sm" data-sel="add" title="Add part" aria-label="Add part">${icon('plus', 14)}</button></h3>
      ${(s.parts || []).map((p, n) => row(`part:${n}`, 'part', esc(selLabel(`part:${n}`)) + (p.item ? `<span class="sub">${esc(p.item)}</span>` : ''), `<span class="row-act"><button class="ib sm" data-del="${n}" title="Remove" aria-label="Remove">${icon('x', 13)}</button></span>`)).join('') || '<p class="empty sm">No parts yet.</p>'}
      ${row('add', 'plus', 'Add part…', '', 1)}
    </div>`;
  const body = panel.querySelector('.lp-body');
  body.onclick = (e) => {
    const del = e.target.closest('[data-del]'); if (del) { e.stopPropagation(); removePart(+del.dataset.del); return; }
    const r = e.target.closest('[data-sel]'); if (r) select(r.dataset.sel);
  };
  body.onkeydown = (e) => {
    const rows = $$('.lrow', body), i = rows.indexOf(document.activeElement); if (i < 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); rows[Math.min(rows.length - 1, i + 1)].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); rows[Math.max(0, i - 1)].focus(); }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(rows[i].dataset.sel); }
  };
}

// ---------- Brand ----------
function brand() {
  const B = data.brand, st = B.stage;
  st.sky = { top: '#9fc4ff', mid: '#eef4ff', bottom: '#ffffff', horizon: 0.55, ...(st.sky || {}) };
  const colorRow = (k, label, val) => `<label class="crow-c"><span class="chip-c" style="--c:${val}"><input type="color" data-st="${k}" value="${val}"></span><span>${label}</span><code>${val}</code></label>`;
  panel.innerHTML = `<header class="lp-head"><h2>Brand</h2></header>
    <div class="lp-body pad">
      <p class="hint">Shared by every character: the stage of each look and the palette library. Saved in <code>brand/brand.json</code>.</p>
      <h3 class="grp">Y2K sky</h3>
      <div class="sky" style="background:linear-gradient(${st.sky.top}, ${st.sky.mid} ${st.sky.horizon * 100}%, ${st.sky.bottom})"></div>
      ${colorRow('sky.top', 'Zenith', st.sky.top)}${colorRow('sky.mid', 'Horizon', st.sky.mid)}${colorRow('sky.bottom', 'Floor', st.sky.bottom)}
      <div class="mini-prop"><span>Horizon at</span><input type="range" data-sr="sky.horizon" min="0.2" max="0.9" step="0.01" value="${st.sky.horizon}" style="--p:${(st.sky.horizon - 0.2) / 0.7 * 100}%"></div>
      <div class="mini-prop"><span>Y2K gloss</span><input type="range" data-sr="gloss" min="0" max="1" step="0.01" value="${st.gloss ?? 0.6}" style="--p:${(st.gloss ?? 0.6) * 100}%"></div>
      <h3 class="grp">Studio</h3>
      ${colorRow('paper', 'Backdrop', st.paper || '#f4f4f2')}
      <h3 class="grp">Palette library <span>${Object.keys(B.palettes).length}</span></h3>
      <div class="pals">${Object.entries(B.palettes).map(([n, p]) => `<div class="pal"><i class="sw">${ROLES.map(r => `<b style="background:${withPalette(p)[r].color}"></b>`).join('')}</i><span>${esc(n)}</span><button class="ib sm" data-rm="${esc(n)}" title="Remove from library" aria-label="Remove ${esc(n)}">${icon('x', 13)}</button></div>`).join('')}</div>
      <div class="addpal"><input id="bName" placeholder="Name for the current palette"><button class="btn sm" id="bAdd">${icon('plus', 14)}Add</button></div>
      <button class="btn primary wide" id="bSave">${icon(data.local ? 'save' : 'download', 15)}${data.local ? 'Save brand.json' : 'Download brand.json'}</button>
    </div>`;
  const setPath = (o, p, v) => { const ks = p.split('.'), last = ks.pop(); ks.reduce((a, k) => (a[k] ||= {}), o)[last] = v; };
  const apply = () => { setStage(B.stage); emit('stage'); $('.sky', panel).style.background = `linear-gradient(${st.sky.top}, ${st.sky.mid} ${st.sky.horizon * 100}%, ${st.sky.bottom})`; };
  $$('[data-st]', panel).forEach(i => i.addEventListener('input', () => { setPath(B.stage, i.dataset.st, i.value); i.parentElement.style.setProperty('--c', i.value); i.closest('label').querySelector('code').textContent = i.value; apply(); }));
  $$('[data-sr]', panel).forEach(i => i.addEventListener('input', () => { setPath(B.stage, i.dataset.sr, +i.value); i.style.setProperty('--p', `${(i.value - i.min) / (i.max - i.min) * 100}%`); apply(); }));
  $$('[data-rm]', panel).forEach(b => b.onclick = () => { delete B.palettes[b.dataset.rm]; brand(); emit('brand'); });
  $('#bAdd', panel).onclick = () => { const n = $('#bName', panel).value.trim() || `Palette ${Object.keys(B.palettes).length + 1}`; B.palettes[n] = withPalette(state.spec.palette); brand(); emit('brand'); toast(`Added ${n} to the library`); };
  $('#bSave', panel).onclick = async () => {
    if (!data.local) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(B, null, 2) + '\n'], { type: 'application/json' })); a.download = 'brand.json'; a.click(); return; }
    const r = await fetch(new URL('api/brand', ROOT), { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ brand: B }) }).then(x => x.json()).catch(e => ({ error: e.message }));
    r.error ? toast(r.error, 'error') : toast('Saved brand/brand.json');
  };
}
