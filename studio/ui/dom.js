// Small UI primitives: escaping, one icon set, toasts, popover menus.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 24×24 stroke icons, drawn for this tool (stroke = currentColor, see .i in studio.css)
const P = {
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  dice: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.5" cy="8.5" r="1.3" class="f"/><circle cx="15.5" cy="15.5" r="1.3" class="f"/><circle cx="12" cy="12" r="1.3" class="f"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>',
  unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7.5a4 4 0 0 1 7.6-1.7"/>',
  reset: '<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6L3.5 8.5"/><path d="M3.5 3.5v5h5"/>',
  play: '<path d="M7 4.5v15l12.5-7.5z" class="f"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  frame: '<path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/><circle cx="12" cy="12" r="2.5"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6 6 0 0 1 3.5 5.8"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 12.5 9 5 9-5"/><path d="m3 16.5 9 5 9-5" opacity=".5"/>',
  brand: '<circle cx="12" cy="12" r="8.5"/><circle cx="8.2" cy="10" r="1.4" class="f"/><circle cx="12" cy="7.3" r="1.4" class="f"/><circle cx="15.8" cy="10" r="1.4" class="f"/><path d="M12 20.5a2.5 2.5 0 0 1 0-5h1.5a3 3 0 0 0 3-3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
  trash: '<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  save: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
  edit: '<path d="M5 3.5 19 10l-6.2 2.2L10.5 19z"/>',
  breed: '<path d="M7 3c0 6.5 10 5.5 10 12s-10 6-10 6"/><path d="M17 3c0 6.5-10 5.5-10 12"/><path d="M9 6.5h6M9 17.5h6"/>',
  blend: '<circle cx="9" cy="9.5" r="5.5"/><circle cx="15" cy="9.5" r="5.5"/><circle cx="12" cy="14.5" r="5.5"/>',
  sparkle: '<path d="M11 3.5 12.8 9 18 10.8l-5.2 1.8L11 18l-1.8-5.4L4 10.8 9.2 9z"/><path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  tree: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="12" r="2"/><path d="M6 7v10M8 5c5 0 4 7 8 7M8 19c5 0 4-7 8-7"/>',
  id: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="11" r="2.3"/><path d="M5.5 16.5a3.5 3.5 0 0 1 7 0M15 10h3M15 14h3"/>',
  species: '<path d="M12 20.5c-4.4 0-7.5-3.2-7.5-7.5 0-4.6 3.6-8.4 7.5-9.5 3.9 1.1 7.5 4.9 7.5 9.5 0 4.3-3.1 7.5-7.5 7.5z"/><circle cx="9.6" cy="12" r="1.1" class="f"/><circle cx="14.4" cy="12" r="1.1" class="f"/>',
  body: '<ellipse cx="12" cy="13" rx="7" ry="7.5"/><path d="M9 20.5h6"/>',
  head: '<circle cx="12" cy="10" r="6.5"/><path d="M9 20.5h6M12 16.5v4"/>',
  face: '<path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="2.5"/>',
  ears: '<path d="M7.5 11 5.5 3.5l5 4M16.5 11l2-7.5-5 4"/><circle cx="12" cy="14.5" r="6"/>',
  arms: '<circle cx="12" cy="6" r="2.2"/><path d="M12 9v6M4 16c3-1 5-6 8-6s5 5 8 6"/>',
  legs: '<path d="M9 3.5v8l-2 9M15 3.5v8l2 9"/>',
  house: '<path d="M4 11 12 4l8 7v9H4z"/><path d="M10 20v-5h4v5"/>',
  pose: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9.2 9.6h.01M14.8 9.6h.01"/>',
  shell: '<path d="M12 12.5a1.8 1.8 0 1 1 1.8-1.8 3.8 3.8 0 1 1-3.8-3.8 5.8 5.8 0 1 1-5.8 5.8"/>',
  claws: '<path d="M7 11.5a4 4 0 1 1 3.5-5.9L7.5 8.5M17 11.5a4 4 0 1 0-3.5-5.9l3 2.9"/><path d="M7 11.5l3 7M17 11.5l-3 7"/>',
  back: '<path d="M12 13c-1.5-5-5.5-7.5-9-7.5 1 3 .8 6 3 8 2 1.6 4.5.8 6-.5zM12 13c1.5-5 5.5-7.5 9-7.5-1 3-.8 6-3 8-2 1.6-4.5.8-6-.5z"/><path d="M12 13v6"/>',
  tail: '<path d="M4 18.5c6 0 9.5-3 9.5-8a4 4 0 0 1 8 0c0 2.4-2.6 3.4-3.6 1.6"/>',
  part: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  drop: '<path d="M12 3.5s6.5 7 6.5 11.3a6.5 6.5 0 0 1-13 0C5.5 10.5 12 3.5 12 3.5z"/>',
  help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.6M12 16.8h.01"/>',
  panel: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M9.5 4.5v15"/>',
  inspector: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M14.5 4.5v15"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  move: '<path d="M12 3v18M3 12h18M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5"/>',
};
export const icon = (name, size = 16) => `<svg class="i" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${P[name] || P.part}</svg>`;

// ---------- toast ----------
let toastTimer = 0;
export function toast(msg, kind = 'info') {
  const t = $('#toast'); if (!t) return;
  t.innerHTML = `${kind === 'error' ? icon('x', 14) : icon('check', 14)}<span>${esc(msg)}</span>`;
  t.dataset.kind = kind; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), kind === 'error' ? 6000 : 3000);
}

// ---------- popover menu ----------
// items: [{ label, hint?, icon?, kbd?, disabled?, run }] or '-' for a divider
let openMenu = null;
export function menu(anchor, items, { align = 'start' } = {}) {
  closeMenu();
  const m = document.createElement('div');
  m.className = 'menu'; m.setAttribute('role', 'menu');
  m.innerHTML = items.map((it, i) => it === '-' ? '<hr>' : `<button role="menuitem" data-i="${i}" ${it.disabled ? 'disabled' : ''}>${it.icon ? icon(it.icon, 15) : '<span class="i-gap"></span>'}<span class="mt"><b>${esc(it.label)}</b>${it.hint ? `<small>${esc(it.hint)}</small>` : ''}</span>${it.kbd ? `<kbd>${esc(it.kbd)}</kbd>` : ''}</button>`).join('');
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect(), mw = m.offsetWidth;
  m.style.top = `${Math.min(r.bottom + 6, innerHeight - m.offsetHeight - 8)}px`;
  m.style.left = `${Math.max(8, Math.min(align === 'end' ? r.right - mw : r.left, innerWidth - mw - 8))}px`;
  m.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (!b) return; closeMenu(); items[+b.dataset.i].run(); });
  anchor.setAttribute('aria-expanded', 'true');
  openMenu = { m, anchor };
  m.querySelector('button:not([disabled])')?.focus();
  m.addEventListener('keydown', e => {
    const bs = $$('button:not([disabled])', m), i = bs.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); bs[(i + 1) % bs.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); bs[(i - 1 + bs.length) % bs.length].focus(); }
    if (e.key === 'Escape') { closeMenu(); anchor.focus(); }
  });
}
export function closeMenu() { if (!openMenu) return; openMenu.m.remove(); openMenu.anchor.setAttribute('aria-expanded', 'false'); openMenu = null; }
addEventListener('pointerdown', e => { if (openMenu && !openMenu.m.contains(e.target) && !openMenu.anchor.contains(e.target)) closeMenu(); });

export const fmtNum = (v, int) => (int ? String(Math.round(v)) : (+v).toFixed(2));
