// Studio state: the loaded cast, the character being edited, undo history, and a tiny event bus.
// Everything that changes the genome goes through change()/begin()/end(), so history and the
// viewport stay in sync. UI modules listen with on('change' | 'select' | 'mode' | 'look' | 'cast' | 'stage').
import { setStage, normLook } from '../../engine/press.js';

export const ROOT = new URL('../../', import.meta.url);
export const Q = new URLSearchParams(location.search);
export const EXPORT = Q.has('export');
export const clone = (x) => JSON.parse(JSON.stringify(x));
const getJSON = (p) => fetch(new URL(p, ROOT)).then(r => { if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.json(); });
export const prefs = {
  get: (k, d = null) => { try { return localStorage.getItem(`tbs-${k}`) ?? d; } catch (e) { return d; } },
  set: (k, v) => { try { localStorage.setItem(`tbs-${k}`, v); } catch (e) {} },
};

// ---------- events ----------
const handlers = {};
export const on = (ev, fn) => { (handlers[ev] ||= []).push(fn); };
export const emit = (ev, payload) => (handlers[ev] || []).forEach(fn => fn(payload));

// ---------- data ----------
export const data = { cast: {}, seriesOf: {}, order: [], lineage: { history: [] }, brand: { palettes: {}, stage: {} }, local: false };
export async function load() {
  const entries = await getJSON('characters/index.json');
  await Promise.all(entries.map(async e => { const [series, id] = e.split('/'); data.cast[id] = await getJSON(`characters/${e}.json`); data.seriesOf[id] = series; }));
  data.order = entries.map(e => e.split('/').pop());
  data.lineage = await getJSON('characters/lineage.json').catch(() => ({ history: [] }));
  data.brand = await getJSON('brand/brand.json').catch(() => ({}));
  data.brand.palettes ||= {}; data.brand.stage ||= {};
  setStage(data.brand.stage);
  data.local = !EXPORT && await fetch(new URL('api/ping', ROOT)).then(r => r.ok).catch(() => false);
  if (Q.get('spec')) { const d = await getJSON(Q.get('spec')); data.cast[d.id] = d; data.seriesOf[d.id] = 'drafts'; data.order.push(d.id); }
}
export const series = () => [...new Set(data.order.map(k => data.seriesOf[k]))];
export const mainCast = () => data.order.filter(k => !data.cast[k].seed_of || edits[k]);
export const specOf = (k) => edits[k] || data.cast[k];

// ---------- state ----------
export const MODES = [
  { k: 'edit', t: 'Edit', icon: 'edit', key: '1', note: 'Shape every gene by hand' },
  { k: 'breed', t: 'Breed', icon: 'breed', key: '2', note: 'Eight children around this one; adopt the one you like' },
  { k: 'blend', t: 'Blend', icon: 'blend', key: '3', note: 'Mix three characters on a triangle' },
  { k: 'describe', t: 'Describe', icon: 'sparkle', key: '4', note: 'Write it in words, Claude designs it' },
  { k: 'sheet', t: 'Sheet', icon: 'grid', key: '5', note: 'Turnaround and expressions' },
  { k: 'lineage', t: 'Lineage', icon: 'tree', key: '6', note: 'The family tree' },
];
const OLD_MODE = { plate: 'edit', variants: 'breed', tree: 'lineage' };
export const state = {
  key: null, spec: null, mode: 'edit', look: 'y2k', sel: 'body',
  locks: new Set(), yaw: 0.35, tilt: 0.08, zoom: 1, paused: false,
  amount: 0.5, breedSeed: 1, blend: { ids: [], at: [1 / 3, 1 / 3, 1 / 3] },
};
export const edits = {}; // working copies edited this session, by cast key
export const dirty = new Set();

export function initState() {
  const main = data.order.filter(k => !data.cast[k].seed_of);
  const want = Q.get('c') || prefs.get('key');
  state.key = data.cast[want] ? want : main[0];
  state.spec = clone(data.cast[state.key]);
  const m = OLD_MODE[Q.get('mode')] || Q.get('mode') || prefs.get('mode', 'edit');
  state.mode = MODES.some(x => x.k === m) ? m : 'edit';
  state.look = normLook(Q.get('look') || prefs.get('look', 'y2k'));
  state.yaw = +(Q.get('yaw') ?? 0.35);
  state.breedSeed = +(Q.get('seed') || 1);
  state.blend.ids = [state.key, ...main.filter(k => k !== state.key).slice(0, 2)];
}
export function remember() { prefs.set('key', state.key); prefs.set('mode', state.mode); prefs.set('look', state.look); }

// ---------- history ----------
const past = [], future = [];
const snap = () => JSON.stringify(state.spec);
let gesture = null; // snapshot taken when a continuous edit (slider drag, colour pick) starts
export const canUndo = () => past.length > 0, canRedo = () => future.length > 0;
function push(before) { past.push(before); if (past.length > 300) past.shift(); future.length = 0; }
function touched() { edits[state.key] = state.spec; dirty.add(state.key); }
// change(fn, kind): fn edits the spec in place or returns a new one.
// kind: 'shape' rebuilds the model, 'paint' re-skins it, 'meta' changes nothing visible
export function change(fn, kind = 'shape') {
  const before = snap();
  const r = fn(state.spec); if (r) state.spec = r;
  if (snap() === before) return false;
  push(before); touched(); emit('change', { kind });
  return true;
}
// continuous edits: begin() once, live() on every step (no history entry), end() when released
export function begin() { if (gesture == null) gesture = snap(); }
export function live(fn, kind = 'shape') { begin(); fn(state.spec); touched(); emit('change', { kind, live: true }); }
export function end() { if (gesture != null && gesture !== snap()) { push(gesture); touched(); emit('change', { kind: 'meta' }); } gesture = null; }
export function undo() { if (!past.length) return; future.push(snap()); state.spec = JSON.parse(past.pop()); touched(); emit('change', { kind: 'shape' }); }
export function redo() { if (!future.length) return; past.push(snap()); state.spec = JSON.parse(future.pop()); touched(); emit('change', { kind: 'shape' }); }

// ---------- navigation ----------
export function select(sel) { state.sel = sel; emit('select', sel); }
export function setMode(m) { if (state.mode === m) return; state.mode = m; if (m === 'blend' && !state.blend.ids.includes(state.key)) state.blend.ids[0] = state.key; remember(); emit('mode', m); }
export function setLook(l) { state.look = l; remember(); emit('look', l); }
export function open(key) {
  if (state.key === key) return;
  state.key = key; state.spec = clone(edits[key] || data.cast[key]);
  past.length = 0; future.length = 0; state.sel = 'body';
  if (state.mode === 'lineage') state.mode = 'edit';
  remember(); emit('open', key); emit('change', { kind: 'shape' });
}
// a new character from a generator joins the cast as an unsaved draft and becomes current
export function adopt(spec) {
  let key = spec.id; while (data.cast[key] && !edits[key]) key += '-2';
  spec.id = key; data.cast[key] ||= spec; data.seriesOf[key] ||= 'drafts';
  if (!data.order.includes(key)) data.order.push(key);
  const before = snap();
  state.key = key; state.spec = spec; touched(); push(before); state.sel = 'body';
  remember(); emit('cast'); emit('open', key); emit('change', { kind: 'shape' });
}
// after a save: the file on disk is now the cast entry
export function saved(spec, folder) {
  const prev = state.key;
  if (prev !== spec.id) { delete edits[prev]; dirty.delete(prev); }
  data.cast[spec.id] = spec; data.seriesOf[spec.id] = folder;
  if (!data.order.includes(spec.id)) data.order.push(spec.id);
  state.key = spec.id; state.spec = clone(spec); delete edits[spec.id]; dirty.delete(spec.id);
  remember(); emit('cast'); emit('change', { kind: 'meta' });
}
