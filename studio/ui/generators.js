// Inspector panels of the generating workspaces: Breed, Blend, Describe (+ Sheet and Lineage info).
import * as S from '../../engine/schema.js';
import { state, data, change, adopt, specOf, mainCast, ROOT, clone, emit } from '../core/store.js';
import { later, blended } from '../core/viewport.js';
import { fill } from '../core/thumbs.js';
import { $, $$, esc, icon, toast, menu } from './dom.js';

const head = (ic, title, sub, actions = '') => `<header class="ins-head"><span class="ins-ic">${icon(ic, 18)}</span><div class="ins-t"><h2>${esc(title)}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}</div><div class="ins-act">${actions}</div></header>`;
const sec = (title, body, extra = '') => `<section class="sec"><h3>${esc(title)}${extra}</h3>${body}</section>`;

export function renderGenerator(el) {
  ({ breed, blend, describe, sheet, lineage })[state.mode]?.(el);
}

// ---------- Breed ----------
function breed(el) {
  const n = state.locks.size;
  el.innerHTML = head('breed', 'Breed', 'Interactive evolution')
    + `<div class="ins-body"><p class="hint">The centre is the current character; around it, eight children chosen to differ from each other as much as the spread allows. Click one to adopt it, then breed again. ⌘Z walks back.</p>`
    + sec('Litter', `
      <div class="prop"><label class="pl">Spread</label><div class="pc"><div class="num"><input type="range" id="bAmt" min="0.05" max="1" step="0.01" value="${state.amount}" style="--p:${state.amount * 100}%"><output class="val" id="bAmtV">${Math.round(state.amount * 100)}%</output></div></div><div class="pa"></div></div>
      <div class="scale"><span>Close relatives</span><span>Wild</span></div>
      <div class="actions"><button class="btn primary" id="bRe">${icon('dice', 15)}New litter</button></div>`)
    + sec('Keep', `<p class="hint">Locked genes pass to every child unchanged. Lock single genes from the inspector in Edit.</p>
      <div class="toggles">
        <button class="tog" data-lk="palette" aria-pressed="${state.locks.has('palette')}">${icon('drop', 15)}Palette</button>
        <button class="tog" data-lk="parts.*" aria-pressed="${state.locks.has('parts.*')}">${icon('part', 15)}Apparatus</button>
      </div>
      <div class="lockline">${icon('lock', 14)}<span>${n} locked</span>${n ? '<button class="link" id="bClear">Clear</button>' : ''}</div>`)
    + '</div>';
  const a = $('#bAmt', el);
  a.addEventListener('input', () => { state.amount = +a.value; a.style.setProperty('--p', `${a.value * 100}%`); $('#bAmtV', el).textContent = `${Math.round(a.value * 100)}%`; });
  a.addEventListener('change', () => later(0));
  $('#bRe', el).onclick = () => { state.breedSeed++; later(0); };
  $$('[data-lk]', el).forEach(b => b.onclick = () => { const k = b.dataset.lk; state.locks.has(k) ? state.locks.delete(k) : state.locks.add(k); breed(el); emit('locks'); later(0); });
  $('#bClear', el)?.addEventListener('click', () => { state.locks.clear(); breed(el); emit('locks'); later(0); });
}
export function adoptChild(spec) {
  change(() => spec);
  state.breedSeed++; later(0);
  toast(`Adopted ${spec.name}. Its children are around it.`);
}

// ---------- Blend ----------
const V = [[150, 24], [24, 240], [276, 240]];
function blend(el) {
  const keys = mainCast();
  el.innerHTML = head('blend', 'Blend', 'Mix three characters')
    + `<div class="ins-body"><p class="hint">Numbers mix by weight and colours mix in OKLab. The body plan and the apparatus come from the strongest parent.</p>`
    + sec('Parents', `<div class="parents">${['A', 'B', 'C'].map((l, i) => `<button class="parent" data-pi="${i}" aria-haspopup="menu"><img alt=""><span class="pl-l">${l}</span><b>${esc(specOf(state.blend.ids[i]).name)}</b>${icon('down', 14)}</button>`).join('')}</div>`)
    + sec('Mix', `<svg class="tri" id="tri" viewBox="0 0 300 268" role="slider" tabindex="0" aria-label="Blend weights">
        <polygon points="${V.map(v => v.join(',')).join(' ')}" class="tri-bg"/>
        ${V.map((v, i) => `<circle cx="${v[0]}" cy="${v[1]}" r="6" class="tri-v"/><text x="${v[0] + (i === 1 ? -16 : i === 2 ? 6 : 12)}" y="${v[1] + (i ? 22 : -4)}">${'ABC'[i]}</text>`).join('')}
        <circle id="triDot" r="10" class="tri-dot"/></svg>
      <div class="weights" id="triW"></div>
      <div class="actions"><button class="btn primary" id="bKeep">${icon('check', 15)}Keep this blend</button><button class="btn" id="bEven">Even mix</button></div>`)
    + '</div>';
  $$('.parent', el).forEach(b => {
    fill(b.querySelector('img'), specOf(state.blend.ids[+b.dataset.pi]), state.look);
    b.onclick = () => menu(b, keys.map(k => ({ label: specOf(k).name, hint: data.seriesOf[k], run: () => { state.blend.ids[+b.dataset.pi] = k; blend(el); later(0); } })));
  });
  const dot = $('#triDot', el), tri = $('#tri', el);
  const place = () => {
    const w = state.blend.at;
    dot.setAttribute('cx', V.reduce((a, v, i) => a + v[0] * w[i], 0)); dot.setAttribute('cy', V.reduce((a, v, i) => a + v[1] * w[i], 0));
    $('#triW', el).innerHTML = w.map((v, i) => `<span><i style="width:${Math.round(v * 100)}%"></i><em>${'ABC'[i]}</em>${Math.round(v * 100)}%</span>`).join('');
  };
  const bary = (x, y) => {
    const [a, b, c] = V, d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    const l1 = Math.max(0, ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / d), l2 = Math.max(0, ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / d), l3 = Math.max(0, 1 - l1 - l2), s = l1 + l2 + l3;
    return [l1 / s, l2 / s, l3 / s];
  };
  let dragging = false;
  const move = (e) => { const r = tri.getBoundingClientRect(); state.blend.at = bary((e.clientX - r.left) / r.width * 300, (e.clientY - r.top) / r.height * 268); place(); later(90); };
  tri.addEventListener('pointerdown', e => { dragging = true; tri.setPointerCapture(e.pointerId); move(e); });
  tri.addEventListener('pointermove', e => { if (dragging) move(e); });
  tri.addEventListener('pointerup', () => { dragging = false; });
  tri.addEventListener('keydown', e => { // arrow keys walk towards a corner
    const k = { ArrowUp: 0, ArrowLeft: 1, ArrowRight: 2 }[e.key]; if (k === undefined) return;
    e.preventDefault(); state.blend.at = state.blend.at.map((v, i) => Math.max(0, v + (i === k ? 0.05 : -0.025))); const s = state.blend.at.reduce((a, c) => a + c, 0); state.blend.at = state.blend.at.map(v => v / s); place(); later(90);
  });
  $('#bEven', el).onclick = () => { state.blend.at = [1 / 3, 1 / 3, 1 / 3]; place(); later(0); };
  $('#bKeep', el).onclick = () => { const b = blended(); if (!b) return; const s = clone(b); s.id = S.validate(s).id; adopt(s); toast(`Kept ${s.name} as a new character`); };
  place();
}

// ---------- Describe ----------
const EXAMPLES = [
  'A sleepy archbishop crab whose shell is a chrome cathedral spire, with a bubblegum halo',
  'A clock spirit who lends hours to whoever runs out of them; four eyes, tentacles, gold',
  'A chibi plumber with a wrench and a tiny house on its back, pastel',
  'Make it more uncanny: void eyes, horns, a longer body',
];
let busy = false;
function describe(el) {
  const ok = data.local;
  el.innerHTML = head('sparkle', 'Describe', 'Text → character, with Claude')
    + `<div class="ins-body"><p class="hint">Describe it in words. Claude designs the genome with the same schema the editor uses; anything out of range is clamped. Then refine it by hand.</p>`
    + (ok ? '' : `<div class="note warn">${icon('help', 16)}<div><b>Runs on your machine</b><p>In the project folder run <code>npm install</code>, then <code>npm run dev</code> with <code>ANTHROPIC_API_KEY</code> set, and open the local studio.</p></div></div>`)
    + sec('Prompt', `<label class="field"><textarea id="dText" rows="5" placeholder="A hermit crab who…" ${ok ? '' : 'disabled'}></textarea></label>
      <div class="actions"><button class="btn primary" id="dNew" ${ok && !busy ? '' : 'disabled'}>${icon('sparkle', 15)}Create new</button><button class="btn" id="dEdit" ${ok && !busy ? '' : 'disabled'}>Change current</button></div>
      <p class="status" id="dStatus" role="status">${busy ? '<span class="spin"></span>Claude is designing…' : ''}</p>`)
    + sec('Try', `<div class="examples">${EXAMPLES.map(x => `<button>${esc(x)}</button>`).join('')}</div>`)
    + '</div>';
  $$('.examples button', el).forEach(b => b.onclick = () => { const t = $('#dText', el); t.value = b.textContent; t.focus(); });
  const go = async (edit) => {
    const t = $('#dText', el), prompt = t.value.trim(); if (!prompt) return t.focus();
    busy = true; describe(el); $('#dText', el).value = prompt;
    const r = await fetch(new URL('api/generate', ROOT), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt, base: edit ? state.spec : undefined }) }).then(x => x.json()).catch(e => ({ error: e.message }));
    busy = false; describe(el); $('#dText', el).value = prompt;
    if (r.error) { $('#dStatus', el).textContent = r.error; toast(r.error, 'error'); return; }
    $('#dStatus', el).textContent = `${r.spec.name}: ${r.spec.concept || ''}`;
    if (edit) { const keep = state.spec.id; change(() => { r.spec.id = keep; return r.spec; }); toast(`Changed ${r.spec.name}`); }
    else { adopt(r.spec); toast(`Created ${r.spec.name}`); }
  };
  $('#dNew', el).onclick = () => go(false); $('#dEdit', el).onclick = () => go(true);
}

function sheet(el) {
  el.innerHTML = head('grid', 'Sheet', 'Model sheet')
    + `<div class="ins-body"><p class="hint">Turnaround (front, ¾, side, back) and the six expressions, in the current look. Switch looks from the toolbar; export from Save.</p>`
    + sec('Expression', `<p class="hint">The resting expression is set under Pose &amp; face.</p>`) + '</div>';
}
function lineage(el) {
  el.innerHTML = head('tree', 'Lineage', 'The family tree')
    + `<div class="ins-body"><p class="hint">Every character descends from the first plates. Children made with Breed, Blend or Describe keep a parent, and join the tree when you save them. Click a name to open it.</p></div>`;
}
