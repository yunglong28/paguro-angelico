// Thumbnails: every character, archetype and part is chosen by looking at it.
// One small offscreen renderer draws them one at a time in idle moments; results are cached by
// genome, so a thumbnail is only redrawn when what it shows has changed.
import { createStage, setLook } from '../../engine/press.js';
import { build } from '../../engine/build.js';

const SIZE = 192;
let stage = null;
const cache = new Map(), queue = [], waiting = new Map();
let busy = false;

function ensure() {
  if (stage) return stage;
  const c = document.createElement('canvas');
  stage = createStage(c, { preserve: true, antialias: true, noShadow: true });
  stage.resize(SIZE, SIZE, 1);
  return stage;
}
function draw(spec, look) {
  const st = ensure(), THREE = st.THREE;
  const ch = build(spec); ch.still(true); ch.up(2.5); setLook(ch.obj, look);
  const b = new THREE.Box3().setFromObject(ch.obj), size = b.getSize(new THREE.Vector3()), mid = b.getCenter(new THREE.Vector3());
  st.scene.add(ch.obj);
  st.render([{ x: 0, y: 0, w: 1, h: 1, yaw: 0.45, tilt: 0.1, dist: Math.max(size.y, size.x * 0.9) / (2 * Math.tan(Math.PI / 12)) * 1.06 + size.z / 2, lift: mid.y }], look);
  const url = st.renderer.domElement.toDataURL('image/png');
  st.scene.remove(ch.obj);
  ch.obj.traverse(o => { if (o.geometry && !o.geometry.userData.sculpted) o.geometry.dispose(); });
  return url;
}
const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 400 }) : setTimeout(fn, 30));
function pump() {
  if (busy || !queue.length) return;
  busy = true;
  idle(() => {
    const { key, spec, look } = queue.shift();
    let url = null;
    try { url = draw(spec, look); } catch (e) { console.warn('thumbnail failed', e); }
    cache.set(key, url);
    if (cache.size > 300) cache.delete(cache.keys().next().value); // oldest first
    (waiting.get(key) || []).forEach(fn => fn(url)); waiting.delete(key);
    busy = false; pump();
  });
}
// thumb(spec, look) -> Promise<dataURL>; `priority` jumps the queue (the thing you are looking at)
export function thumb(spec, look = 'y2k', { priority = false } = {}) {
  const key = `${look}|${JSON.stringify(spec)}`;
  if (cache.has(key)) return Promise.resolve(cache.get(key));
  return new Promise(res => {
    if (!waiting.has(key)) { waiting.set(key, []); const job = { key, spec, look }; priority ? queue.unshift(job) : queue.push(job); }
    waiting.get(key).push(res);
    pump();
  });
}
// fill an <img data-thumb> as soon as its picture is ready
const asked = new WeakMap(); let ticket = 0;
export function fill(img, spec, look, opts) {
  img.classList.add('loading');
  const t = ++ticket; asked.set(img, t);
  thumb(spec, look, opts).then(url => { if (asked.get(img) !== t || !url) return; img.src = url; img.classList.remove('loading'); });
}
