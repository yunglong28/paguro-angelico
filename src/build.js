// spec (JSON) -> rigged three.js character: { obj, up(t), setExpression(name), still(bool) }
import * as THREE from '../vendor/three.module.js';
import { host, setEye, EXPRESSIONS, PARTS } from './parts.js';
import { rng } from './mutate.js';

const ANCHORED = new Set(['crown', 'mandrake', 'plinth', 'roots', 'parapodia']);

export function build(spec) {
  const R = rng(spec.seed ?? 1);
  const ctx = { rng: R, eyes: [], anchors: {} };
  const root = new THREE.Group();
  const stage = new THREE.Group(); root.add(stage);

  const hostSpec = spec.host || {};
  ctx.buildHost = () => host(hostSpec, { ...ctx, eyes: ctx.eyes });
  const h = host(hostSpec, ctx);
  const faceEyes = ctx.eyes.slice();
  ctx.anchors = h.anchors;
  const hostWrap = new THREE.Group(); hostWrap.add(h.obj);
  hostWrap.scale.setScalar(hostSpec.scale ?? 1);
  stage.add(hostWrap);

  const ups = [h.up];
  for (const p of spec.parts || []) {
    const make = PARTS[p.type];
    if (!make) { console.warn('unknown part', p.type); continue; }
    const part = make(p, ctx);
    if (part.wrapHost) { // the part re-seats the host inside itself (double articulation)
      stage.remove(hostWrap); part.obj.add(hostWrap); hostWrap.position.y = 0;
    }
    // parts placed from host anchors live in host space so they follow its scale
    (ANCHORED.has(p.type) || p.attach === 'host' ? hostWrap : stage).add(part.obj);
    if (part.up) ups.push(part.up);
  }

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
