// Part library. Every part is (params, ctx) => { obj, up?(t) }.
// ctx: { rng, eyes: [], anchors: {}, buildHost(params) }
import * as THREE from '../vendor/three.module.js';
import { ink } from './press.js';
import { sculpt, blend, sphere, ellipsoid, cone, rbox, carve } from './sdf.js';
import { rng } from './mutate.js';

const UP = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const TAU = Math.PI * 2;
const lerp = (a, b, u) => a + (b - a) * u;

// ---------- primitives ----------
export function sph(r, m, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, seg = 24) {
  const o = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75)), m);
  o.position.set(x, y, z); o.scale.set(sx, sy, sz); return o;
}
export function limb(a, b, r, m, r2 = r) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, d.length(), 10), m);
  o.position.copy(A).add(B).multiplyScalar(0.5);
  o.quaternion.setFromUnitVectors(UP, d.normalize()); return o;
}
// Tube swept along points with a per-point radius (parallel-transport frames).
export function sweep(pts, radii, m, radial = 18) {
  const pos = [], idx = [];
  let N = null;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const T = b.clone().sub(a).normalize();
    if (!N) { N = Math.abs(T.y) < 0.9 ? UP.clone() : Z.clone(); }
    N.sub(T.clone().multiplyScalar(N.dot(T))).normalize();
    const B = T.clone().cross(N);
    for (let j = 0; j <= radial; j++) {
      const ang = j / radial * TAU, r = radii[i];
      pos.push(pts[i].x + (N.x * Math.cos(ang) + B.x * Math.sin(ang)) * r,
               pts[i].y + (N.y * Math.cos(ang) + B.y * Math.sin(ang)) * r,
               pts[i].z + (N.z * Math.cos(ang) + B.z * Math.sin(ang)) * r);
    }
  }
  for (let i = 0; i < pts.length - 1; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return new THREE.Mesh(g, m);
}

// ---------- the rigged eye ----------
// Lids are hemispherical caps: closure 0 = tucked behind, 0.5 = half, 1 = shut.
export function eye(s, lidInk, side = 0) {
  const g = new THREE.Group();
  const ball = new THREE.Group(); g.add(ball);
  ball.add(sph(0.2 * s, ink('paper', 0, 0), 0, 0, 0, 1.15, 1, 0.9));
  const pupil = sph(0.09 * s, ink('toner', 0.94, 0.06), 0, 0, 0.16 * s, 1, 1.1, 0.55);
  ball.add(pupil);
  const capU = new THREE.Mesh(new THREE.SphereGeometry(0.215 * s, 20, 10, 0, TAU, 0, Math.PI / 2), lidInk);
  const capL = new THREE.Mesh(new THREE.SphereGeometry(0.212 * s, 20, 10, 0, TAU, Math.PI / 2, Math.PI / 2), lidInk);
  [capU, capL].forEach(c => { c.scale.set(1.15, 1, 0.92); c.rotation.order = 'ZYX'; g.add(c); });
  g.userData = { ball, pupil, capU, capL, side, off: Math.random() * 4, lid: 0.3, low: 0, slant: 0 };
  return g;
}
export function setEye(e, ex, blink = 0) {
  const u = e.userData;
  const c = Math.max(ex.lid, blink);
  u.capU.rotation.x = -Math.PI / 2 + c * Math.PI;
  u.capL.rotation.x = Math.PI / 2 - Math.max(ex.low, blink * 0.5) * Math.PI;
  u.capU.rotation.z = u.side * ex.slant;
  u.capL.rotation.z = -u.side * ex.slant * 0.4;
  u.pupil.scale.setScalar(ex.pupil); u.pupil.scale.z *= 0.55;
  u.ball.rotation.set(-ex.gaze[1] * 0.55, ex.gaze[0] * 0.55, 0);
}

export const EXPRESSIONS = {
  quiete:  { lid: 0.36, low: 0.06, slant: 0,    pupil: 1,    gaze: [0, 0],     mouth: 'smile' },
  estasi:  { lid: 0.52, low: 0.16, slant: -0.3, pupil: 0.85, gaze: [0, 0.65],  mouth: 'o' },
  stupore: { lid: 0.02, low: 0,    slant: 0,    pupil: 0.55, gaze: [0, 0.05],  mouth: 'O' },
  ira:     { lid: 0.46, low: 0.12, slant: 0.5,  pupil: 1.15, gaze: [0, -0.1],  mouth: 'flat' },
  pieta:   { lid: 0.5,  low: 0.05, slant: -0.45, pupil: 1,   gaze: [0.1, -0.5], mouth: 'frown' },
  sonno:   { lid: 1,    low: 0.1,  slant: 0,    pupil: 1,    gaze: [0, 0],     mouth: 'flat' },
};

function mouthSet(par, x, y, z, s, m) {
  const mk = {};
  const arc = (flip) => { const o = new THREE.Mesh(new THREE.TorusGeometry(0.1 * s, 0.024 * s, 8, 24, Math.PI), m); o.rotation.z = flip ? Math.PI : 0; o.position.set(x, y + (flip ? 0.03 : -0.06) * s, z); return o; };
  mk.smile = arc(true); mk.frown = arc(false);
  mk.o = sph(0.05 * s, m, x, y - 0.02 * s, z, 1, 1.2, 0.4);
  mk.O = sph(0.09 * s, m, x, y - 0.04 * s, z, 0.9, 1.25, 0.4);
  mk.flat = limb([x - 0.09 * s, y, z], [x + 0.09 * s, y, z], 0.022 * s, m);
  Object.values(mk).forEach(o => par.add(o));
  return (name) => Object.entries(mk).forEach(([k, o]) => { o.visible = k === name; });
}

// ---------- host: the hermit crab ----------
export function spiralShell(p) {
  const { turns = 4.5, growth = 0.1, knobs = 0, size = 1.5, ribs = 0 } = p;
  const m = ink(p.ink || 'toner', p.base ?? 0.22, p.shade ?? 0.78);
  const tMax = turns * TAU, n = Math.round(turns * 64), Rend = 0.36 * size, rEnd = 0.34 * size, H = 1.25 * size;
  const pts = [], radii = [], at = [];
  for (let i = 0; i <= n; i++) {
    const th = i / n * tMax, f = Math.exp(growth * (th - tMax));
    pts.push(new THREE.Vector3(Math.cos(th) * Rend * f, -H * f, Math.sin(th) * Rend * f));
    radii.push(Math.max(0.004, rEnd * f * (1 + ribs * 0.12 * Math.pow(Math.max(0, Math.cos(th * 9)), 6))));
    at.push({ th, f });
  }
  const g = new THREE.Group();
  g.add(sweep(pts, radii, m));
  const lip = new THREE.Mesh(new THREE.TorusGeometry(radii[n] * 0.96, 0.035 * size, 8, 40), ink('toner', 0.85, 0.15));
  const T = pts[n].clone().sub(pts[n - 1]).normalize();
  lip.position.copy(pts[n]); lip.quaternion.setFromUnitVectors(Z, T); g.add(lip);
  if (knobs > 0) {
    const K = ink('toner', 0.4, 0.6);
    for (let i = 8; i <= n; i += 7) {
      const { th, f } = at[i]; if (f < 0.08) continue;
      const out = new THREE.Vector3(Math.cos(th), 0.55, Math.sin(th)).normalize();
      const L = knobs * 0.5 * f * size + 0.02;
      const c = new THREE.Mesh(new THREE.ConeGeometry(radii[i] * 0.35, L, 8), K);
      c.position.copy(pts[i]).add(out.clone().multiplyScalar(radii[i] + L * 0.4));
      c.quaternion.setFromUnitVectors(UP, out); g.add(c);
    }
  }
  // aperture faces +z: yaw so the end tangent points forward, then move the mouth to the origin
  const yaw = Math.atan2(T.x, T.z);
  const inner = new THREE.Group(); inner.add(g); g.rotation.y = -yaw;
  const A = pts[n].clone().applyAxisAngle(UP, -yaw);
  g.position.copy(A).negate();
  const apex = pts[0].clone().applyAxisAngle(UP, -yaw).sub(A);
  return { obj: inner, apex, g, pts, radii };
}

export function host(P = {}, ctx) {
  const w = new THREE.Group();
  const bodyM = ink(P.body?.ink || 'blu', P.body?.base ?? 0.36, P.body?.shade ?? 0.64);
  const T = ink('toner', 0.22, 0.78);
  const ups = [];
  // shell
  let shell = null, shellRoot = null;
  if (P.shell !== false) {
    const sp = P.shell || {};
    shell = spiralShell(sp);
    shellRoot = new THREE.Group();
    shellRoot.position.set(0, sp.y ?? -0.05, sp.z ?? -0.2);
    shellRoot.rotation.set(sp.tilt ?? -0.38, sp.yaw ?? 0.5, sp.roll ?? 0);
    shellRoot.add(shell.obj); w.add(shellRoot);
    if (sp.detached) {
      shellRoot.position.set(sp.detached[0], sp.detached[1], sp.detached[2]);
      ups.push(t => { shellRoot.rotation.y = t * 0.25; shellRoot.position.y = sp.detached[1] + Math.sin(t * 0.8) * 0.12; });
    }
  }
  // body: one sculpted carapace (blob + rostrum + eye sockets + tubercles + abdomen into the shell)
  const bs = P.body?.size ?? 1;
  const body = new THREE.Group(); w.add(body);
  const bumps = P.body?.bumps ?? 9;
  body.add(new THREE.Mesh(sculpt(`body|${bs}|${bumps}`, () => {
    const R = rng(7), parts = [
      ellipsoid([0, -0.35, 0.25], [0.63 * bs, 0.46 * bs, 0.55 * bs]),
      ellipsoid([0, -0.22, 0.25 + 0.5 * bs], [0.26 * bs, 0.16 * bs, 0.12 * bs]),
      cone([0, -0.3, 0.05], [0, -0.1, -0.35], 0.34 * bs, 0.2 * bs),
      sphere([-0.18 * bs, 0.0, 0.42], 0.1), sphere([0.18 * bs, 0.0, 0.42], 0.1),
    ];
    for (let i = 0; i < bumps; i++) {
      const a = R.range(-1.1, 1.1), b = R.range(0.25, 0.95);
      parts.push(sphere([Math.sin(a) * 0.5 * bs * Math.cos(b * 0.6), -0.35 + Math.sin(b) * 0.42 * bs, 0.25 + Math.cos(a) * 0.42 * bs * Math.cos(b)], 0.05 * bs));
    }
    return blend(parts, 0.1);
  }, 0.028), bodyM));
  const mouth = mouthSet(body, 0, -0.32, 0.25 + 0.53 * bs, 1.05 * bs, ink('toner', 0.92, 0.08));
  [-1, 1].forEach(k => body.add(sph(0.06, ink('fluo', 1, 0), k * 0.36 * bs, -0.42, 0.25 + 0.42 * bs, 1, 0.7, 0.3)));
  // stalk eyes
  const es = P.eyes?.size ?? 1, sl = P.eyes?.stalk ?? 0.55, ne = P.eyes?.count ?? 2;
  const stalks = [];
  for (let i = 0; i < ne; i++) {
    const k = ne === 1 ? 0 : lerp(-1, 1, i / (ne - 1));
    const g = new THREE.Group(); g.position.set(k * 0.18 * bs, 0.02, 0.42);
    const top = [k * 0.1, sl, 0];
    g.add(new THREE.Mesh(sculpt(`stalk|${k}|${sl}`, () => blend([cone([0, -0.02, 0], top, 0.055, 0.032), sphere([0, 0.06, 0], 0.06)], 0.05), 0.012), bodyM));
    const e = eye(1.12 * es, bodyM, Math.sign(k)); e.position.set(top[0], top[1] + 0.12 * es, 0.02);
    g.add(e); body.add(g); ctx.eyes.push(e); stalks.push(g);
  }
  // chelipeds: hermit crabs carry one big claw (right) and one small; the finger is hinged
  const claws = [], tips = {};
  if (P.claws !== false) [-1, 1].forEach(k => {
    const cs = (P.claws?.size ?? 1) * (k > 0 ? 1.25 : 0.85);
    const c = new THREE.Group(); c.position.set(k * 0.62 * bs, -0.4, 0.5);
    const Pm = [k * 0.36 * cs, 0.06, 0.22];
    c.add(new THREE.Mesh(sculpt(`claw|${k}|${cs}`, () => blend([
      cone([0, 0, 0], [k * 0.22, 0.04, 0.12], 0.08, 0.065),
      sphere([k * 0.22, 0.04, 0.12], 0.075),
      ellipsoid(Pm, [0.16 * cs, 0.11 * cs, 0.12 * cs]),
      cone([Pm[0] + k * 0.1 * cs, Pm[1] - 0.03 * cs, Pm[2] + 0.04], [Pm[0] + k * 0.3 * cs, Pm[1] - 0.02 * cs, Pm[2] + 0.1], 0.07 * cs, 0.022),
    ], 0.07), 0.02), bodyM));
    const finger = new THREE.Group(); finger.position.set(Pm[0] + k * 0.1 * cs, Pm[1] + 0.05 * cs, Pm[2] + 0.03); c.add(finger);
    finger.add(new THREE.Mesh(sculpt(`finger|${k}|${cs}`, () => cone([0, 0, 0], [k * 0.22 * cs, 0.0, 0.07], 0.055 * cs, 0.02), 0.012), bodyM));
    const hold = P.claws?.hold ?? 'seed';
    if (k > 0 && (hold === 'seed' || hold === 'rosso')) c.add(sph(0.09, ink(hold === 'rosso' ? 'rosso' : 'fluo', 1, 0), Pm[0] + k * 0.3 * cs, Pm[1] + 0.02, Pm[2] + 0.12));
    if (P.claws?.raise) c.rotation.z = k * P.claws.raise;
    tips[k > 0 ? 'clawR' : 'clawL'] = new THREE.Vector3(Pm[0] + k * 0.32 * cs, Pm[1], Pm[2] + 0.1).applyEuler(c.rotation).add(c.position);
    body.add(c); claws.push({ c, finger, k });
  });
  // walking legs: coxa, femur, knee, dactyl as one sculpted limb
  const legs = [], nl = P.legs ?? 3;
  for (let i = 0; i < nl; i++) [-1, 1].forEach(k => {
    const g = new THREE.Group(); g.position.set(k * 0.42 * bs, -0.6, 0.12 - i * 0.2);
    const knee = [k * 0.32, 0.14, 0.04], ankle = [k * 0.46, -0.22, 0.08 - i * 0.03], foot = [k * 0.52, -0.45, 0.1 - i * 0.06];
    g.add(new THREE.Mesh(sculpt(`leg|${k}|${i}`, () => blend([
      sphere([0, 0, 0], 0.06), cone([0, 0, 0], knee, 0.058, 0.045), sphere(knee, 0.05),
      cone(knee, ankle, 0.045, 0.034), sphere(ankle, 0.036), cone(ankle, foot, 0.032, 0.008),
    ], 0.04), 0.014), T));
    w.add(g); legs.push({ g, i, k });
  });

  const anchors = {
    head: new THREE.Vector3(0, 0.85, 0.3),
    back: new THREE.Vector3(0, 0.2, -0.6),
    feet: new THREE.Vector3(0, -1.05, 0.1),
    ...tips,
    apex: shell ? shell.apex.clone().applyEuler(shellRoot.rotation).add(shellRoot.position) : new THREE.Vector3(0, 0.6, -0.4),
  };
  return {
    obj: w, anchors, mouth,
    up(t) {
      body.position.y = Math.abs(Math.sin(t * 3)) * 0.05;
      stalks.forEach((s, i) => { s.rotation.z = Math.sin(t * 1.7 + i * 2) * 0.12; });
      claws.forEach(({ finger, k }, i) => { const o = Math.max(0, Math.sin(t * 2.2 + i * 1.5)) * 0.45; finger.rotation.z = k * o; });
      legs.forEach(({ g, i, k }) => { g.rotation.y = Math.sin(t * 3 + i * 1.3 + (k > 0 ? Math.PI : 0)) * 0.18; });
      ups.forEach(f => f(t));
    },
  };
}

// ---------- attributes ----------
export function halo(p) {
  const { r = 0.75, x = 0, y = 0.6, z = -0.9, punch = 36, rays = 0, rings = 1 } = p;
  const g = new THREE.Group();
  const d = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.02, 72), ink('fluo', 1, 0)); d.rotation.x = Math.PI / 2; g.add(d);
  const K = ink('toner', 0.9, 0.1);
  for (let j = 0; j < rings; j++) g.add(new THREE.Mesh(new THREE.TorusGeometry(r - j * 0.09, j ? 0.012 : 0.025, 8, 90), K));
  // punched gold tooling (punzonatura): rows of dots inside the rim
  for (let row = 0; row < 2; row++) {
    const rr = r - 0.12 - row * 0.1, n = Math.round(punch * rr / r);
    for (let i = 0; i < n; i++) { const a = (i + row * 0.5) / n * TAU; g.add(sph(row ? 0.02 : 0.03, K, Math.cos(a) * rr, Math.sin(a) * rr, 0.02, 1, 1, 0.4, 8)); }
  }
  for (let i = 0; i < rays; i++) {
    const a = i / rays * TAU, L = i % 2 ? 0.25 : 0.55;
    g.add(limb([Math.cos(a) * (r + 0.06), Math.sin(a) * (r + 0.06), 0], [Math.cos(a) * (r + L), Math.sin(a) * (r + L), 0], 0.012, K));
  }
  g.position.set(x, y, z);
  return { obj: g, up: (t) => { g.rotation.z = Math.sin(t * 0.3) * 0.04; } };
}

function wing(feathers, len, m, eyesN, ctx, k) {
  const g = new THREE.Group();
  for (let i = 0; i < feathers; i++) {
    const u = feathers === 1 ? 0.5 : i / (feathers - 1);
    const piv = new THREE.Group(); piv.rotation.z = (u - 0.5) * 1.25;
    const L = len * (1 - Math.abs(u - 0.5) * 0.55);
    const f = sph(0.5, m, 0, L * 0.5, -i * 0.004, 0.15, L, 0.05, 16); piv.add(f);
    piv.add(limb([0, 0.05, 0.02], [0, L * 0.92, 0.02], 0.008, ink('toner', 0.9, 0.1)));
    g.add(piv);
    const showEye = eyesN >= feathers || (eyesN === 1 && i === Math.floor(feathers / 2)) || (eyesN > 1 && i % Math.ceil(feathers / eyesN) === 0);
    if (showEye) {
      const e = eye(eyesN > 1 ? 0.38 : 0.6, ink('blu', 0.5, 0.5), 0);
      e.position.set(0, L * (eyesN > 1 ? 0.78 : 0.45), 0.06); piv.add(e); ctx.eyes.push(e);
    }
  }
  return g;
}
export function wings(p, ctx) {
  const { pairs = 3, feathers = 7, len = 1.3, eyes = 1, z = -0.45, spread = 1, flap = 0.12 } = p;
  const m = ink(p.ink || 'toner', p.base ?? 0.06, p.shade ?? 0.5);
  const w = new THREE.Group(), all = [];
  for (let i = 0; i < pairs; i++) {
    const u = pairs === 1 ? 0.35 : i / (pairs - 1);
    const y = lerp(0.6, -0.6, u), x = (0.5 + 0.25 * Math.sin(u * Math.PI)) * spread, rz = lerp(-0.35, -2.5, u);
    [-1, 1].forEach(k => {
      const piv = new THREE.Group(); piv.position.set(k * x, y, z); piv.rotation.set(0, k * lerp(-0.25, 0.3, u), k * rz);
      piv.add(wing(feathers, len * (1 - u * 0.15), m, eyes, ctx, k)); w.add(piv); all.push({ piv, rz: k * rz, i, k });
    });
  }
  return { obj: w, up: (t) => all.forEach(o => { o.piv.rotation.z = o.rz + o.k * Math.sin(t * 2.2 + o.i) * flap * -1; }) };
}

export function rings(p, ctx) {
  const { count = 3, r0 = 1.45, step = 0.3, eyes = 7, speed = 1, thick = 0.07 } = p;
  const m = ink(p.ink || 'toner', 0.85, 0.15), w = new THREE.Group(), rs = [];
  for (let j = 0; j < count; j++) {
    const r = r0 + j * step, ring = new THREE.Group();
    ring.add(new THREE.Mesh(new THREE.TorusGeometry(r, thick, 10, 140), m));
    ring.add(new THREE.Mesh(new THREE.TorusGeometry(r - 0.13, 0.014, 6, 140), m));
    const n = eyes + j * 2;
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU;
      [1, -1].forEach(s => { const e = eye(0.7, ink('blu', 0.5, 0.5), 0); e.position.set(Math.cos(a) * (r - 0.06), Math.sin(a) * (r - 0.06), s * 0.06); if (s < 0) e.rotation.y = Math.PI; ring.add(e); ctx.eyes.push(e); });
    }
    w.add(ring); rs.push(ring);
  }
  return {
    obj: w, up: (t) => rs.forEach((r, j) => {
      const s = t * speed * (0.5 - j * 0.1);
      r.rotation.set(j === 1 ? Math.PI / 2 + s * 0.3 : s, j === 2 ? Math.PI / 2 + s * 0.6 : s * 0.4, s * (j % 2 ? 0.8 : 0.2));
    }),
  };
}

export function mandorla(p, ctx) {
  const { r = 1.25, aspect = 1.65, rays = 64, eyes = 4, stars = 22, z = -0.6 } = p;
  const T = ink('toner', 0.85, 0.15), B = ink('blu', 0.4, 0.6), w = new THREE.Group();
  [0, 1].forEach(j => { const o = new THREE.Mesh(new THREE.TorusGeometry(r + j * 0.18, j ? 0.02 : 0.06, 10, 140), j ? T : B); o.scale.set(1, aspect, 1); o.position.z = z; w.add(o); });
  // inner glory: concentric almond bands in blu, lighter toward the figure
  for (let j = 0; j < 3; j++) { const o = new THREE.Mesh(new THREE.TorusGeometry(r - 0.14 - j * 0.12, 0.05, 6, 120), ink('blu', 0.12 + j * 0.05, 0.1)); o.scale.set(1, aspect, 0.3); o.position.z = z - 0.05; w.add(o); }
  for (let i = 0; i < rays; i++) {
    const a = i / rays * TAU, x = Math.cos(a), y = Math.sin(a) * aspect, L = i % 2 ? 0.35 : 0.7, R = r + 0.25;
    w.add(limb([x * R, y * R * 0.92, z], [x * (R + L), y * (R + L) * 0.92, z], 0.012, T));
  }
  const cardinal = [[0, r * aspect + 1.1], [0, -(r * aspect + 1.1)], [-(r + 0.95), 0], [r + 0.95, 0]];
  for (let i = 0; i < eyes; i++) { const [x, y] = cardinal[i % 4]; const e = eye(0.8, B, 0); e.position.set(x, y, z + 0.1); w.add(e); ctx.eyes.push(e); }
  for (let i = 0; i < stars; i++) { const x = ctx.rng.range(-2.7, 2.7), y = ctx.rng.range(-2.7, 2.7); if (Math.hypot(x / (r + 0.5), y / ((r + 0.5) * aspect)) > 1.35) w.add(sph(0.035, T, x, y, z - 0.3, 1, 1, 1, 8)); }
  return { obj: w, up: (t) => { w.rotation.z = Math.sin(t * 0.3) * 0.03; } };
}

export function eyecloud(p, ctx) {
  const { count = 9, r = 2, z = -0.7, size = 0.6 } = p;
  const w = new THREE.Group(), list = [];
  for (let i = 0; i < count; i++) {
    const a = i / count * TAU + ctx.rng.range(-0.2, 0.2), rr = r * ctx.rng.range(0.85, 1.15);
    const e = eye(size, ink('blu', 0.45, 0.55), 0); e.position.set(Math.cos(a) * rr, Math.sin(a) * rr, z + ctx.rng.range(-0.3, 0.3));
    w.add(e); ctx.eyes.push(e); list.push({ e, a, rr });
  }
  return { obj: w, up: (t) => list.forEach((o, i) => { o.e.position.y = Math.sin(o.a) * o.rr + Math.sin(t + i) * 0.05; }) };
}

// Deleuze & Guattari: God is a lobster, a double articulation.
export function double(p, ctx) {
  const { gap = 1.0, strata = 7, pincers = true, scale = 0.62 } = p;
  const w = new THREE.Group();
  const other = ctx.buildHost();
  other.obj.scale.setScalar(scale); const g = new THREE.Group(); g.add(other.obj);
  g.position.y = -gap; g.rotation.z = Math.PI; w.add(g);
  const B = ink('blu', 0.36, 0.64), T = ink('toner', 0.3, 0.7), F = ink('fluo', 1, 0);
  const st = new THREE.Group(), mid = Math.floor(strata / 2);
  for (let i = 0; i < strata; i++) {
    const rr = 1.25 - Math.abs(i - mid) * 0.12, c = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, 0.07, 64), i === mid ? F : (i % 2 ? B : T));
    c.position.y = (i - mid) * 0.09; c.scale.z = 0.45; st.add(c);
  }
  st.position.y = -gap / 2; w.add(st);
  const pz = [];
  if (pincers) [-1, 1].forEach(k => {
    const q = new THREE.Group(); q.position.set(k * 1.6, -gap / 2, 0);
    const up = sph(0.55, T, 0, 0.42, 0, 0.45, 1, 0.35, 24), lo = sph(0.55, B, 0, -0.42, 0, 0.45, 1, 0.35, 24);
    q.add(up, lo, sph(0.18, T)); w.add(q); pz.push({ up, lo, k });
  });
  w.position.y = gap / 2; // main host above, mirrored host below, the stratum is the hinge
  return {
    obj: w, wrapHost: true,
    up: (t) => {
      other.up(t + 1.7);
      st.children.forEach((c, i) => { c.rotation.y = t * 0.3 * (i % 2 ? 1 : -1); });
      pz.forEach(o => { const a = (Math.sin(t * 1.8) * 0.5 + 0.5) * 0.35; o.up.rotation.z = o.k * (0.35 + a); o.lo.rotation.z = -o.k * (0.35 + a); });
    },
  };
}

export function crown(p, ctx) {
  const { r = 0.32, h = 0.38, points = 6, on = 'apex', arches = 2 } = p;
  const F = ink('fluo', 1, 0), T = ink('toner', 0.5, 0.5), w = new THREE.Group();
  const band = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.92, h * 0.4, 40, 1, true), F); w.add(band);
  w.add(new THREE.Mesh(new THREE.TorusGeometry(r, 0.025, 6, 40), T).rotateX(Math.PI / 2).translateZ(h * 0.2));
  for (let i = 0; i < points; i++) {
    const a = i / points * TAU;
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.06, h * 0.55, 6), F); c.position.set(Math.cos(a) * r, h * 0.45, Math.sin(a) * r); w.add(c);
    w.add(sph(0.045, i % 2 ? ink('blu', 0.6, 0.4) : T, Math.cos(a) * r * 1.02, 0, Math.sin(a) * r * 1.02, 1, 1, 1, 10));
  }
  for (let i = 0; i < arches; i++) {
    const a = new THREE.Mesh(new THREE.TorusGeometry(r * 0.95, 0.03, 6, 30, Math.PI), T);
    a.rotation.y = i / arches * Math.PI; a.scale.y = 1.25; a.position.y = h * 0.2; w.add(a);
  }
  w.add(sph(0.07, F, 0, h * 0.2 + r * 1.2, 0), limb([0, h * 0.2 + r * 1.25, 0], [0, h * 0.2 + r * 1.55, 0], 0.018, T), limb([-0.07, h * 0.2 + r * 1.45, 0], [0.07, h * 0.2 + r * 1.45, 0], 0.018, T));
  const a = ctx.anchors[on] || ctx.anchors.apex;
  w.position.copy(a).add(new THREE.Vector3(...(p.offset || [0, 0.05, 0]))); w.rotation.z = p.tilt ?? 0.12;
  return { obj: w };
}

// Mandrake: the shell's spire germinates, leaves and two buds (herbals, mascot.pdf p.256-257)
export function mandrake(p, ctx) {
  const { leaves = 5, len = 1.1, buds = 2 } = p;
  const L = ink(p.ink || 'blu', 0.3, 0.6), T = ink('toner', 0.3, 0.7), F = ink('fluo', 1, 0), w = new THREE.Group(), ls = [];
  for (let i = 0; i < leaves; i++) {
    const u = leaves === 1 ? 0.5 : i / (leaves - 1), a = lerp(-1.25, 1.25, u);
    const piv = new THREE.Group(); piv.rotation.set(ctx.rng.range(-0.3, 0.3), 0, a);
    const ll = len * (1 - Math.abs(u - 0.5) * 0.6);
    const leaf = sph(0.5, L, 0, ll * 0.5, 0, 0.32, ll, 0.06, 20); piv.add(leaf);
    piv.add(limb([0, 0, 0.03], [0, ll * 0.95, 0.03], 0.012, T));
    w.add(piv); ls.push({ piv, a, i });
  }
  for (let i = 0; i < buds; i++) {
    const k = buds === 1 ? 0 : (i ? 1 : -1), top = [k * 0.75, len * 1.05, 0.05];
    const pts = []; for (let j = 0; j <= 16; j++) { const u = j / 16; pts.push(new THREE.Vector3(top[0] * Math.sin(u * Math.PI / 2), top[1] * u, 0.05)); }
    w.add(sweep(pts, pts.map(() => 0.025), T, 6));
    const bud = new THREE.Group(); bud.position.set(...top); bud.add(sph(0.13, F, 0, 0, 0, 1, 0.9, 1));
    for (let j = 0; j < 5; j++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 5), F); const a = j / 5 * TAU; c.position.set(Math.cos(a) * 0.08, 0.12, Math.sin(a) * 0.08); bud.add(c); }
    w.add(bud);
  }
  w.position.copy(ctx.anchors.apex).add(new THREE.Vector3(0, -0.03, 0));
  return { obj: w, up: (t) => ls.forEach(o => { o.piv.rotation.z = o.a + Math.sin(t * 1.4 + o.i) * 0.07; }) };
}

export function roots(p, ctx) {
  const { count = 6, len = 1.2, curl = 0.35 } = p;
  const T = ink('toner', 0.35, 0.65), w = new THREE.Group(), rs = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + ctx.rng.range(-0.2, 0.2), ph = ctx.rng.range(0, TAU), L = len * ctx.rng.range(0.7, 1.15);
    const pts = [], radii = [];
    for (let j = 0; j <= 24; j++) {
      const u = j / 24;
      pts.push(new THREE.Vector3(Math.cos(a) * (0.3 + u * 0.55) + Math.sin(u * 7 + ph) * curl * u * 0.3, -0.55 - u * L, 0.2 + Math.sin(a) * (0.25 + u * 0.4) + Math.cos(u * 6 + ph) * curl * u * 0.3));
      radii.push(lerp(0.075, 0.006, Math.pow(u, 0.8)));
    }
    const m = sweep(pts, radii, T, 8); w.add(m); rs.push(m);
  }
  return { obj: w, up: (t) => rs.forEach((m, i) => { m.rotation.y = Math.sin(t * 0.7 + i) * 0.03; }) };
}

// Clione, the "sea angel": two swimming lobes instead of feathered wings
export function parapodia(p) {
  const { size = 1, y = -0.25 } = p;
  const m = ink(p.ink || 'blu', 0.18, 0.5), w = new THREE.Group(), lobes = [];
  [-1, 1].forEach(k => {
    const piv = new THREE.Group(); piv.position.set(k * 0.55, y, 0.15);
    const lobe = sph(0.5 * size, m, k * 0.5 * size, 0.1, 0, 1.05, 0.55, 0.08, 28); piv.add(lobe);
    piv.add(limb([0, 0, 0.04], [k * 0.9 * size, 0.18, 0.04], 0.01, ink('toner', 0.85, 0.15)));
    w.add(piv); lobes.push({ piv, k });
  });
  return { obj: w, up: (t) => lobes.forEach(({ piv, k }) => { piv.rotation.z = k * Math.sin(t * 3.2) * 0.55; piv.rotation.x = Math.cos(t * 3.2) * 0.2; }) };
}

// Monstrance / reliquary: the figure becomes an object on an altar (toy-on-a-base, mascot.pdf)
export function monstrance(p) {
  const { r = 1.55, rays = 40, stem = 1.3 } = p;
  const F = ink('fluo', 1, 0), T = ink('toner', 0.45, 0.55), K = ink('toner', 0.85, 0.15), w = new THREE.Group();
  const lun = new THREE.Mesh(new THREE.TorusGeometry(r, 0.09, 12, 120), T); lun.position.z = -0.1; w.add(lun);
  w.add(new THREE.Mesh(new THREE.TorusGeometry(r + 0.16, 0.025, 6, 120), K).translateZ(-0.1));
  for (let i = 0; i < rays; i++) {
    const a = i / rays * TAU; if (Math.abs(a - Math.PI * 1.5) < 0.35) continue;
    const L = i % 2 ? 0.55 : 1.05, R = r + 0.22;
    const ray = new THREE.Mesh(new THREE.ConeGeometry(i % 2 ? 0.04 : 0.07, L, 4), i % 2 ? K : F);
    ray.position.set(Math.cos(a) * (R + L / 2), Math.sin(a) * (R + L / 2), -0.12); ray.rotation.z = a - Math.PI / 2; w.add(ray);
  }
  const base = new THREE.Group(); base.position.y = -r - 0.1;
  base.add(limb([0, 0, -0.1], [0, -stem, -0.1], 0.07, T));
  base.add(sph(0.18, F, 0, -stem * 0.45, -0.1, 1, 0.7, 1));
  base.add(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.75, 0.25, 48), T).translateY(-stem - 0.1).translateZ(-0.1));
  base.add(new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.85, 0.08, 48), K).translateY(-stem - 0.26).translateZ(-0.1));
  w.add(base);
  return { obj: w, up: (t) => { lun.rotation.z = t * 0.1; } };
}

export function plinth(p, ctx) {
  const { r = 0.9, h = 0.18 } = p;
  const w = new THREE.Group();
  w.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.04, h, 64), ink('toner', 0.12, 0.4)));
  w.add(new THREE.Mesh(new THREE.TorusGeometry(r * 1.02, 0.02, 6, 80), ink('fluo', 1, 0)).rotateX(Math.PI / 2).translateZ(-h * 0.3));
  w.position.copy(ctx.anchors.feet).add(new THREE.Vector3(0, -h / 2 - 0.02, -0.1));
  return { obj: w };
}

// Spring Draw: fluo seeds dropping from above
export function seeds(p, ctx) {
  const { count = 7, h = 2.4, spread = 1.6 } = p;
  const w = new THREE.Group(), list = [];
  for (let i = 0; i < count; i++) {
    const s = sph(0.08, ink('fluo', 1, 0)); w.add(s);
    list.push({ s, x: ctx.rng.range(-spread, spread), z: ctx.rng.range(-0.5, 0.6), off: ctx.rng.range(0, 5) });
  }
  return { obj: w, up: (t) => list.forEach(o => { const k = ((t + o.off) % 5) / 5; o.s.position.set(o.x + Math.sin(t + o.off) * 0.15, h - k * h * 1.6, o.z); o.s.scale.setScalar(1 - k * 0.5); }) };
}

export const PARTS = { halo, wings, rings, mandorla, eyecloud, double, crown, mandrake, roots, parapodia, monstrance, plinth, seeds };
