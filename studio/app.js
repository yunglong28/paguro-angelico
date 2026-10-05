// Time Bank Spirit Studio: one app to edit, generate and publish characters on one genome (engine/schema.js).
//   core/store.js     cast, current character, undo history, events
//   core/viewport.js  the live 3D view: build, render, pick, drag, cameras, overlays, lineage
//   core/thumbs.js    thumbnails of characters, species and parts
//   ui/topbar.js      identity, workspaces, history, save; the floating view toolbar
//   ui/left.js        rail + Cast / Layers / Brand panels
//   ui/inspector.js   properties of the selection (generated from the schema)
//   ui/generators.js  Breed, Blend, Describe panels
import { load, initState, state, on, setMode, setLook, undo, redo, open, select, EXPORT, MODES } from './core/store.js';
import { initViewport, render, onAdoptChild, onOpenFromTree, frameAll } from './core/viewport.js';
import { initTopbar, syncTopbar, togglePlay, randomize, save, LOOKS } from './ui/topbar.js';
import { initLeft, renderLeft, showTab, newMenu } from './ui/left.js';
import { initInspector, render as renderInspector, removePart } from './ui/inspector.js';
import { renderGenerator, adoptChild } from './ui/generators.js';
import { $, $$, icon, closeMenu } from './ui/dom.js';

if (EXPORT) document.body.classList.add('export');
await load();
initState();

// static icons in the markup
$$('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon, el.classList.contains('btn') ? 15 : 18) + (el.dataset.label ? `<span>${el.dataset.label}</span>` : ''); });

const inspectorEl = $('#inspector');
initViewport();
onAdoptChild(adoptChild);
onOpenFromTree(k => { setMode('edit'); open(k); });
if (!EXPORT) { initTopbar(); initLeft($('#rail'), $('#leftPanel')); initInspector(inspectorEl); }

function renderRight() { if (EXPORT) return; state.mode === 'edit' ? renderInspector() : renderGenerator(inspectorEl); }
function renderAll() { if (EXPORT) return; renderRight(); renderLeft(); syncTopbar(); }

// the Cast panel shows thumbnails: refresh it a moment after edits stop, not on every step
let castTimer = 0;
const refreshLeftSoon = () => { clearTimeout(castTimer); castTimer = setTimeout(renderLeft, 600); };
on('change', ({ live }) => { if (EXPORT) return; if (!live) { renderRight(); refreshLeftSoon(); } syncTopbar(); });
on('select', () => { if (state.mode !== 'edit') setMode('edit'); renderRight(); renderLeft(); });
on('mode', renderAll);
on('open', renderAll);
on('cast', () => !EXPORT && renderLeft());
on('locks', () => !EXPORT && renderLeft());
on('look', () => { if (EXPORT) return; syncTopbar(); if (['species', 'add'].includes(state.sel) && state.mode === 'edit') renderRight(); });
on('brand', () => { if (!EXPORT && state.sel === 'palette') renderRight(); });

// ---------- keyboard ----------
addEventListener('keydown', e => {
  if (EXPORT) return;
  const target = e.target instanceof Element ? e.target : document.body;
  const typing = target.closest('input, textarea, select, [contenteditable]');
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'z') { if (typing) return; e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save('draft'); return; }
  if (typing || mod || e.altKey || $('#keys').open) return;
  const k = e.key;
  const m = MODES.find(x => x.key === k); if (m) { setMode(m.k); return; }
  if (k === ' ') { e.preventDefault(); togglePlay(); return; }
  if (k === 'f' || k === 'F') return frameAll();
  if (k === 'r' || k === 'R') return randomize();
  if (k === 'n' || k === 'N') return newMenu($('#rail'));
  if (k === 'c' || k === 'C') return showTab('cast');
  if (k === 'l' || k === 'L') return showTab('layers');
  if (k === 'b' || k === 'B') return showTab('brand');
  if (k === '?') return $('#keys').showModal();
  if (k === '[' || k === ']') { const i = LOOKS.findIndex(l => l.k === state.look); setLook(LOOKS[(i + (k === ']' ? 1 : LOOKS.length - 1)) % LOOKS.length].k); return; }
  if ((k === 'Delete' || k === 'Backspace') && state.sel.startsWith('part:')) { e.preventDefault(); removePart(+state.sel.split(':')[1]); return; }
  if (k === 'Escape') { closeMenu(); document.body.classList.remove('show-left', 'show-right'); select('body'); }
});
addEventListener('beforeunload', e => { if (!EXPORT && document.querySelector('#docDirty:not([hidden])')) { e.preventDefault(); e.returnValue = ''; } });

// ---------- loop ----------
const still = EXPORT || matchMedia('(prefers-reduced-motion: reduce)').matches;
const Q = new URLSearchParams(location.search);
let frames = 0, t = +(Q.get('t') || 2.5), last = performance.now();
function frame(now) {
  if (!state.paused && !still) t += (now - last) / 1000;
  last = now;
  if (!(EXPORT && frames >= 6)) render(t);
  if (++frames === 3) document.title += ' ·'; // export readiness marker
  requestAnimationFrame(frame);
}
renderAll();
requestAnimationFrame(frame);
// for automated checks and the console
window.tbs = { state, get frames() { return frames; }, get t() { return t; }, select, setMode, undo, redo };
