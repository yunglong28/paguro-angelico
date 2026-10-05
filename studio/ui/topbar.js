// Top bar (identity, workspaces, history, save) and the floating viewport toolbar (looks, cameras, playback).
import * as S from '../../engine/schema.js';
import { build } from '../../engine/build.js';
import { bakeIdle } from '../../engine/bake.js';
import { setLook as paint } from '../../engine/press.js';
import { GLTFExporter } from '../../vendor/GLTFExporter.js';
import { state, data, dirty, MODES, setMode, setLook, undo, redo, canUndo, canRedo, change, saved, series, ROOT } from '../core/store.js';
import { CAMERAS, camera, frameAll } from '../core/viewport.js';
import { $, $$, esc, icon, toast, menu } from './dom.js';

export const LOOKS = [{ k: 'studio', t: 'Studio' }, { k: 'y2k', t: 'Y2K' }, { k: 'toon', t: 'Toon' }, { k: 'print', t: 'Print' }];
const SERIES_LABEL = { angeli: 'Angeli', collettivo: 'Collettivo', banca: 'Banca del tempo' };

export function initTopbar() {
  $('#modes').innerHTML = MODES.map(m => `<button role="tab" data-m="${m.k}" title="${esc(m.note)} (${m.key})">${icon(m.icon, 16)}<span>${m.t}</span></button>`).join('');
  $('#modes').onclick = (e) => { const b = e.target.closest('[data-m]'); if (b) setMode(b.dataset.m); };
  $('#undo').onclick = undo; $('#redo').onclick = redo;
  $('#random').onclick = randomize;
  $('#saveBtn').onclick = () => save('draft');
  $('#saveMore').onclick = (e) => saveMenu(e.currentTarget);
  $('#help').onclick = () => $('#keys').showModal();
  $('#keysClose').onclick = () => $('#keys').close();
  $('#toggleLeft').onclick = () => document.body.classList.toggle('show-left');
  $('#toggleRight').onclick = () => document.body.classList.toggle('show-right');
  // floating toolbar
  $('#looks').innerHTML = LOOKS.map(l => `<button data-l="${l.k}" aria-pressed="false">${l.t}</button>`).join('');
  $('#looks').onclick = (e) => { const b = e.target.closest('[data-l]'); if (b) setLook(b.dataset.l); };
  $('#cams').innerHTML = CAMERAS.map(c => `<button data-cam="${c.k}" title="${c.t} view">${c.t}</button>`).join('');
  $('#cams').onclick = (e) => { const b = e.target.closest('[data-cam]'); if (b) camera(b.dataset.cam); };
  $('#play').onclick = togglePlay;
  $('#frameBtn').onclick = frameAll;
}
export function togglePlay() { state.paused = !state.paused; syncTopbar(); }

export function syncTopbar() {
  const s = state.spec;
  document.body.dataset.mode = state.mode;
  $('#docName').textContent = s.name || s.id;
  $('#docMeta').textContent = `${S.ARCHETYPES[S.speciesOf(s)].label} · ${data.seriesOf[state.key] || 'drafts'}`;
  $('#docDirty').hidden = !dirty.has(state.key);
  $$('#modes [data-m]').forEach(b => b.setAttribute('aria-selected', b.dataset.m === state.mode));
  $$('#looks [data-l]').forEach(b => b.setAttribute('aria-pressed', b.dataset.l === state.look));
  $('#undo').disabled = !canUndo(); $('#redo').disabled = !canRedo();
  $('#play').innerHTML = icon(state.paused ? 'play' : 'pause', 16);
  $('#play').title = state.paused ? 'Play (Space)' : 'Pause (Space)';
  $('#cams').hidden = !['edit', 'blend', 'describe'].includes(state.mode);
  $('#vtool').hidden = state.mode === 'lineage';
  $('#saveBtn').innerHTML = `${icon(data.local ? 'save' : 'download', 15)}<span>${data.local ? 'Save' : 'Download'}</span>`;
  $('#saveBtn').title = data.local ? `Save draft: characters/drafts/${S.validate(s).id}.json (⌘S)` : 'Download the character as JSON (⌘S)';
}

export function randomize() {
  const seed = Math.floor(Math.random() * 1e6);
  change(sp => { const r = S.randomize(seed, new Set([...state.locks, 'id']), sp); r.id = sp.id; r.name = sp.name; return r; });
  const n = state.locks.size;
  toast(n ? `Randomized · ${n} locked gene${n > 1 ? 's' : ''} kept` : 'Randomized · lock genes to keep them');
}

// ---------- save / export ----------
function download(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
function downloadJSON() { const s = S.validate(state.spec); download(`${s.id}.json`, new Blob([JSON.stringify(s, null, 2) + '\n'], { type: 'application/json' })); toast(`Downloaded ${s.id}.json`); }
function downloadGLB() {
  const c = build(state.spec); c.still(true); paint(c.obj, 'studio');
  new GLTFExporter().parse(c.obj, (buf) => { download(`${state.spec.id}.glb`, new Blob([buf], { type: 'model/gltf-binary' })); toast(`Downloaded ${state.spec.id}.glb`); }, (e) => toast(e.message, 'error'), { binary: true, animations: [bakeIdle(c)] });
}
export async function save(where = 'draft') {
  if (!data.local) return downloadJSON();
  const spec = S.validate(state.spec), to = where === 'draft' ? 'drafts' : where;
  const r = await fetch(new URL('api/character', ROOT), { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ spec, to }) }).then(x => x.json()).catch(e => ({ error: e.message }));
  if (r.error) return toast(r.error, 'error');
  saved(r.spec, to); toast(`Saved ${r.path}`);
}
function saveMenu(anchor) {
  const id = S.validate(state.spec).id;
  menu(anchor, [
    ...(data.local ? [
      { label: 'Save draft', hint: `characters/drafts/${id}.json`, icon: 'save', kbd: '⌘S', run: () => save('draft') },
      ...series().filter(s => s !== 'drafts').map(s => ({ label: `Publish to ${SERIES_LABEL[s] || s}`, hint: `characters/${s}/${id}.json + index`, icon: 'check', run: () => save(s) })),
      '-',
    ] : [{ label: 'Saving into the project', hint: 'Run npm run dev to save; here you can download', icon: 'help', disabled: true, run() {} }, '-']),
    { label: 'Download JSON', hint: `${id}.json`, icon: 'download', run: downloadJSON },
    { label: 'Download .glb', hint: 'Animated 3D model', icon: 'part', run: downloadGLB },
  ], { align: 'end' });
}
