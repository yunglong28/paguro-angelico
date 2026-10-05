// spec (JSON) -> rigged three.js character: { obj, up(t), setExpression(name), still(bool) }
import * as THREE from '../vendor/three.module.js';
import { host, setEye, EXPRESSIONS, PARTS as ANGELI } from './parts.js';
import { COLLETTIVO } from './collettivo.js';
import { figure, TIME_PARTS } from './figure.js';
import { withPalette } from './palette.js';

const PARTS = { ...ANGELI, ...COLLETTIVO, ...TIME_PARTS };
const merge = (a, b) => { const o = { ...a }; for (const [k, v] of Object.entries(b)) o[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' ? merge(a[k], v) : v; return o; };
import { rng } from './rng.js';

const ANCHORED = new Set(['crown', 'mandrake', 'plinth', 'roots', 'parapodia', 'banner', 'scales', 'prop', 'orbit']);

export function build(spec) {
  const R = rng(spec.seed ?? 1);
  const ctx = { rng: R, eyes: [], anchors: {} };
  const root = new THREE.Group();
  root.userData.palette = withPalette(spec.palette); // setLook(root, look) paints with it
  const stage = new THREE.Group(); root.add(stage);

  // the body plan: the hermit crab (host), or the modular figure (spirits, blobs, chibi)
  const isFigure = spec.plan === 'figure';
  const hostSpec = (isFigure ? spec.figure : spec.host) || {};
  // extra bodies for collective parts: the character's own, with overrides (crab only; figures repeat as they are)
  ctx.buildHost = (o = {}) => (isFigure ? figure(hostSpec, ctx) : host(merge(hostSpec, o), ctx));
  const h = isFigure ? figure(hostSpec, ctx) : host(hostSpec, ctx);
  const hostEyes = ctx.eyes.slice();
  ctx.anchors = h.anchors;
  ctx.mounts = h.mounts || {}; // moving attachment points (a figure's hands)
  const hostWrap = new THREE.Group(); hostWrap.add(h.obj);
  hostWrap.scale.setScalar(hostSpec.scale ?? 1);
  stage.add(hostWrap);

  const ups = [h.up];
  (spec.parts || []).forEach((p, n) => {
    const make = PARTS[p.type];
    if (!make) { console.warn('unknown part', p.type); return; }
    const part = make(p, ctx);
    part.obj.userData.sel = `part:${n}`;
    // every part can be moved and resized (Spore-style placement), on top of its own params
    if (p.move) part.obj.position.add(new THREE.Vector3(...p.move.map(v => v || 0)));
    if (p.size && p.size !== 1) part.obj.scale.multiplyScalar(p.size);
    if (part.wrapHost) { // the part re-seats the host inside itself (double articulation)
      stage.remove(hostWrap); part.obj.add(hostWrap); hostWrap.position.y = 0;
    }
    // parts placed from host anchors live in host space so they follow its scale
    (part.mount ? ctx.mounts[part.mount] : ANCHORED.has(p.type) || p.attach === 'host' ? hostWrap : stage).add(part.obj);
    if (part.hideHost) hostWrap.visible = false;
    if (part.hostAt) hostWrap.position.copy(part.hostAt);
    if (part.hostScale) hostWrap.scale.setScalar(part.hostScale);
    if (part.after) part.after(hostWrap, ctx.anchors);
    if (part.up) ups.push(part.up);
  });

  // frame close-ups on a visible crab: the main host, or the first crab a collective part made
  let faceEyes = hostWrap.visible ? hostEyes : ctx.eyes.slice(hostEyes.length, hostEyes.length + 2);
  const pose = spec.pose || {};
  stage.scale.setScalar(pose.scale ?? 1);
  stage.position.y = pose.lift ?? 0;

  let expr = EXPRESSIONS[spec.expression] || EXPRESSIONS.quiete;
  let blinking = true;
  function setExpression(name) { expr = EXPRESSIONS[name] || expr; h.mouth(expr.mouth); }
  setExpression(spec.expression || 'quiete');

  return {
    obj: root, spec,
    setExpression, still(v) { blinking = !v; },
    expressions: Object.keys(EXPRESSIONS),
    // world-space centre of the host's own eyes, for close-up framing
    face() {
      root.updateMatrixWorld(true);
      const c = new THREE.Vector3(), v = new THREE.Vector3();
      // no rigged eyes (masks, button or lens eyes): the body's face anchor
      if (!faceEyes.length && ctx.anchors.face) return hostWrap.localToWorld(ctx.anchors.face.clone());
      faceEyes.forEach(e => c.add(e.getWorldPosition(v)));
      return c.divideScalar(Math.max(1, faceEyes.length));
    },
    up(t) {
      ups.forEach(f => f(t));
      ctx.eyes.forEach(e => {
        const ph = (t + e.userData.off) % 4.2;
        setEye(e, expr, blinking && ph < 0.14 ? 1 : 0);
      });
      stage.position.y = (pose.lift ?? 0) + Math.sin(t * 1.2) * (pose.float ?? 0);
      stage.rotation.y = Math.sin(t * 0.4) * (pose.sway ?? 0.3);
    },
  };
}
