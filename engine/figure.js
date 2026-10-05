// The modular body plan: spirits, Y2K blobs, chibi humanoids, object-spirits.
// figure(P, ctx) -> { obj, anchors, mouth, up } (same contract as the hermit crab's host()).
// P = spec.figure: body, head, eyes, mouth, ears, arms, legs, house, belly. Every module is optional
// and sculpted as SDF, so any combination stays one coherent, smooth object.
import * as THREE from '../vendor/three.module.js';
import { ink } from './press.js';
import { sculpt, blend, sphere, ellipsoid, cone, rbox } from './sdf.js';
import { eye, mouthSet, sph, limb, sweep, spiralShell } from './parts.js';

const TAU = Math.PI * 2;
const FEET = -1.05;
const o = (x) => (x && typeof x === 'object' ? x : {});
const r3 = (v) => Math.round(v * 1000) / 1000;

// leg length (hip height above the ground) per kind
const LEG = { none: 0, stub: 0.2, legs: 0.5, long: 0.95, tentacles: 0.32, wisp: 0.75 };

// rounded disc (a coin) facing +z: radius r, half-thickness h, edge rounding k
function disc(c, r, h, k) {
  const f = (x, y, z) => {
    const dx = Math.hypot(x - c[0], y - c[1]) - r + k, dz = Math.abs(z - c[2]) - h + k;
    return Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0) - k;
  };
  f.box = [[c[0] - r, c[1] - r, c[2] - h], [c[0] + r, c[1] + r, c[2] + h]];
  return f;
}
// torso as SDF primitives, centred at c, half-width W, half-height H
function torso(shape, c, W, H) {
  const [x, y, z] = c, D = W * 0.85;
  switch (shape) {
    case 'capsule': return [cone([x, y - H + W * 0.9, z], [x, y + H - W * 0.9, z], W * 0.9)];
    case 'box': return [rbox(c, [W, H, D * 0.9], Math.min(W, H) * 0.35)];
    case 'bell': return [cone([x, y - H * 0.55, z], [x, y + H * 0.45, z], W, W * 0.5), sphere([x, y + H * 0.45, z], W * 0.52), ellipsoid([x, y - H * 0.7, z], [W * 1.08, H * 0.3, D * 1.05])];
    case 'drop': return [sphere([x, y - H * 0.35, z], W), cone([x, y - H * 0.35, z], [x, y + H, z], W * 0.92, W * 0.12)];
    case 'coin': return [disc(c, W, W * 0.32, W * 0.2)];
    case 'hourglass': return [cone([x, y - H, z], [x, y, z], W, W * 0.22), cone([x, y, z], [x, y + H, z], W * 0.22, W)];
    case 'house': return [rbox([x, y - H * 0.2, z], [W, H * 0.8, D], 0.06), cone([x - W * 1.05, y + H * 0.55, z], [x, y + H * 1.05, z], 0.1), cone([x + W * 1.05, y + H * 0.55, z], [x, y + H * 1.05, z], 0.1), rbox([x, y + H * 0.6, z], [W * 0.7, H * 0.3, D * 0.9], 0.08)];
    default: return [ellipsoid(c, [W, H, D])]; // egg
  }
}
// head as SDF, centred at c with radius R
function headSDF(shape, c, R) {
  const [x, y, z] = c;
  switch (shape) {
    case 'egg': return [ellipsoid(c, [R * 0.92, R * 1.12, R * 0.92])];
    case 'box': return [rbox(c, [R, R * 0.85, R * 0.85], R * 0.3)];
    case 'cat': return [ellipsoid(c, [R * 1.08, R * 0.9, R * 0.92]), cone([x - R * 0.62, y + R * 0.55, z], [x - R * 0.72, y + R * 1.15, z], R * 0.3, 0.02), cone([x + R * 0.62, y + R * 0.55, z], [x + R * 0.72, y + R * 1.15, z], R * 0.3, 0.02)];
    default: return [sphere(c, R)];
  }
}

export function figure(P = {}, ctx) {
  const B = o(P.body), Hd = o(P.head), E = o(P.eyes), M = o(P.mouth), Ea = o(P.ears), A = o(P.arms), L = o(P.legs), Ho = o(P.house), Be = o(P.belly);
  const bodyM = ink(B.ink || 'blu', 0.36, 0.64);
  const headM = Hd.ink && Hd.ink !== (B.ink || 'blu') ? ink(Hd.ink, 0.36, 0.64) : bodyM;
  const limbM = A.ink ? ink(A.ink, 0.36, 0.64) : bodyM;
  const legM = L.ink ? ink(L.ink, 0.36, 0.64) : bodyM;
  const T = ink('toner', 0.92, 0.08);

  const shape = B.shape || 'egg', W = 0.5 * (B.w ?? 1), H = 0.55 * (B.h ?? 1);
  const legKind = L.kind || 'stub', legLen = (LEG[legKind] ?? 0.2) * (L.len ?? 1);
  const bodyY = FEET + legLen + H * (legKind === 'wisp' ? 0.6 : 0.92);
  const headShape = Hd.shape || 'sphere', hasHead = headShape !== 'none';
  const R = 0.42 * (Hd.size ?? 1);
  const headY = hasHead ? bodyY + H + R * 0.72 : bodyY + H * 0.3;

  const w = new THREE.Group(), ups = [];
  const body = new THREE.Group(); body.userData.sel = 'body'; w.add(body);

  // body (and the head too when they share an ink: one blended surface)
  const bodyKey = `fig-body|${shape}|${r3(W)}|${r3(H)}|${r3(bodyY)}`;
  const headParts = () => headSDF(headShape, [0, headY, 0], R);
  const fused = hasHead && headM === bodyM;
  body.add(new THREE.Mesh(sculpt(fused ? `${bodyKey}|head|${headShape}|${r3(R)}|${r3(headY)}` : bodyKey,
    () => blend(fused ? [...torso(shape, [0, bodyY, 0], W, H), ...headParts()] : torso(shape, [0, bodyY, 0], W, H), 0.14), 0.03), bodyM));
  const head = new THREE.Group(); head.userData.sel = 'head'; w.add(head);
  if (hasHead && !fused) head.add(new THREE.Mesh(sculpt(`fig-head|${headShape}|${r3(R)}|${r3(headY)}`, () => blend(headParts(), 0.08), 0.025), headM));

  // face: where the eyes sit (front surface of the head, or the upper body)
  // where a headless body wears its face: [height, depth of the front surface, face radius]
  const FACE = { drop: [bodyY - H * 0.3, W * 0.92, W * 0.85], hourglass: [bodyY + H * 0.55, W * 0.7, W * 0.6], bell: [bodyY + H * 0.42, W * 0.5, W * 0.45],
    capsule: [bodyY + H * 0.3, W * 0.85, W * 0.8], coin: [bodyY + W * 0.1, W * 0.32, W * 0.8], box: [bodyY + H * 0.25, W * 0.88, Math.min(W, H) * 0.8], house: [bodyY - H * 0.1, W * 0.88, W * 0.75] };
  const [fy, fz, fr] = FACE[shape] || [bodyY + H * 0.3, W * 0.82, Math.min(W, H) * 0.9];
  const faceR = hasHead ? R : fr;
  const faceY = (hasHead ? headY : fy) + (E.y ?? 0) * faceR, faceZ = hasHead ? (headShape === 'box' ? R * 0.85 : R * 0.9) : fz;
  const flatFace = !hasHead && ['box', 'house', 'coin'].includes(shape) || headShape === 'box';
  const face = new THREE.Group(); face.userData.sel = 'face'; (hasHead ? head : body).add(face);
  const n = E.count ?? 2, es = (E.size ?? 1) * faceR / 0.42, gap = (E.gap ?? 1) * Math.max(faceR * 0.42, 0.24 * es);
  const style = E.style || 'round';
  for (let i = 0; i < n; i++) {
    const k = n === 1 ? 0 : (i - (n - 1) / 2), x = k * gap * (n > 3 ? 0.8 : 1), y = faceY + (n > 2 ? (i % 2 ? -0.22 : 0.12) * Math.min(faceR, 0.3 * es) : 0);
    const z = flatFace ? faceZ : Math.sqrt(Math.max(0.01, faceZ * faceZ - x * x * 0.6)) - 0.02;
    if (style === 'button') { face.add(sph(0.075 * es, T, x, y, z + 0.02, 1, 1.25, 0.6)); face.add(sph(0.022 * es, ink('paper', 0, 0), x + 0.025 * es, y + 0.035 * es, z + 0.06, 1, 1, 0.5)); continue; }
    if (style === 'visor') continue;
    const e = eye(0.95 * es, headM, Math.sign(k));
    e.position.set(x, y, z - 0.06 * es);
    if (style === 'void') { // dark sockets with a pin of light: not cute on purpose
      e.userData.ball.children[0].material = ink('toner', 0.97, 0.03);
      e.userData.pupil.material = ink('fluo', 1, 0);
    }
    face.add(e); ctx.eyes.push(e);
  }
  if (style === 'visor' && flatFace) { // a straight lit bar on a flat face
    const len = faceR * 1.5, t = 0.09 * (E.size ?? 1);
    const bar = (r, m, dz) => { const c = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 16), m); c.rotation.z = Math.PI / 2; c.position.set(0, faceY, faceZ + dz); c.scale.z = 0.5; face.add(c); };
    bar(t + 0.03, T, 0); bar(t, ink('fluo', 1, 0), 0.02);
  } else if (style === 'visor') { // a wraparound band across the face, lit from inside
    const band = (arc, tube, m) => { const g = new THREE.TorusGeometry(faceZ * 0.97, tube, 10, 48, arc); g.rotateZ(Math.PI / 2 - arc / 2); g.rotateX(Math.PI / 2); const v = new THREE.Mesh(g, m); v.position.y = faceY; face.add(v); };
    band(Math.PI * 0.74, 0.11 * (E.size ?? 1), T); band(Math.PI * 0.7, 0.085 * (E.size ?? 1) + 0.02, ink('fluo', 1, 0));
  }
  // mouth
  let mouth = () => {};
  const ms = M.size ?? 1, mstyle = M.style || 'normal';
  if (mstyle !== 'none') {
    const my = faceY - faceR * (style === 'visor' ? 0.5 : 0.42), mz = Math.sqrt(Math.max(0.01, faceZ * faceZ - (my - faceY) ** 2 * 0.5)) + 0.005;
    mouth = mouthSet(face, 0, my, mz, 0.8 * ms * faceR / 0.42, T);
    if (mstyle === 'fangs') [-1, 1].forEach(s => { const c = new THREE.Mesh(new THREE.ConeGeometry(0.03 * ms, 0.09 * ms, 6), ink('paper', 0, 0)); c.rotation.x = Math.PI; c.position.set(s * 0.05 * ms, my - 0.06 * ms, mz); face.add(c); });
  }

  // ears / horns / antennae
  const ears = new THREE.Group(); ears.userData.sel = 'ears'; (hasHead ? head : body).add(ears);
  const ek = Ea.kind || 'none', esz = Ea.size ?? 1, topY = hasHead ? headY : bodyY + H * 0.6, topR = hasHead ? R : W * 0.7;
  const earM = Ea.ink ? ink(Ea.ink, 0.36, 0.64) : headM, earPivots = [];
  if (ek !== 'none') [-1, 1].forEach(s => {
    const piv = new THREE.Group(); piv.position.set(s * topR * 0.55, topY + topR * 0.7, 0); ears.add(piv); earPivots.push({ piv, s });
    if (ek === 'cat') piv.add(new THREE.Mesh(new THREE.ConeGeometry(0.13 * esz, 0.32 * esz, 4), earM).translateY(0.1 * esz).rotateZ(-s * 0.3));
    if (ek === 'bunny') piv.add(sph(0.5, earM, s * 0.04, 0.32 * esz, 0, 0.16 * esz, 0.75 * esz, 0.08 * esz, 18));
    if (ek === 'fins') { piv.position.set(s * topR * 0.98, topY, 0); piv.add(sph(0.5, earM, s * 0.12 * esz, 0, 0, 0.36 * esz, 0.42 * esz, 0.06 * esz, 18)); }
    if (ek === 'horns') {
      const pts = []; for (let j = 0; j <= 14; j++) { const u = j / 14; pts.push(new THREE.Vector3(s * (0.05 + u * 0.25 * esz), u * 0.42 * esz, -u * u * 0.18 * esz)); }
      piv.add(sweep(pts, pts.map((_, j) => 0.075 * esz * (1 - j / 15)), ink('toner', 0.4, 0.6), 10));
    }
    if (ek === 'antenna') { piv.position.x = s * topR * 0.35; piv.add(limb([0, 0, 0], [s * 0.12 * esz, 0.42 * esz, 0], 0.016, T)); piv.add(sph(0.065 * esz, ink('fluo', 1, 0), s * 0.12 * esz, 0.45 * esz, 0)); }
  });

  // arms
  const arms = new THREE.Group(); arms.userData.sel = 'arms'; body.add(arms);
  const ak = A.kind || 'stub', al = A.len ?? 1, armPivots = [], hands = {};
  if (ak !== 'none') [-1, 1].forEach(s => {
    const sx = s * W * (shape === 'hourglass' ? 0.55 : 0.92), sy = bodyY + H * (shape === 'drop' ? -0.15 : 0.2);
    const piv = new THREE.Group(); piv.position.set(sx, sy, 0.05); arms.add(piv);
    let tip;
    if (ak === 'stub') { tip = [s * 0.2 * al, -0.12 * al, 0.06]; piv.add(new THREE.Mesh(sculpt(`arm-stub|${s}|${r3(al)}`, () => blend([sphere([0, 0, 0], 0.11), ellipsoid(tip, [0.12, 0.1, 0.1])], 0.08), 0.02), limbM)); }
    else if (ak === 'noodle') {
      tip = [s * 0.32 * al, -0.6 * al, 0.12];
      const pts = []; for (let j = 0; j <= 16; j++) { const u = j / 16; pts.push(new THREE.Vector3(s * (0.32 * al * Math.sin(u * 1.6)), -0.6 * al * u, 0.12 * u)); }
      piv.add(sweep(pts, pts.map(() => 0.045), limbM, 10)); piv.add(sph(0.07, limbM, ...tip));
    } else { // long
      const el = [s * 0.18 * al, -0.42 * al, 0.05]; tip = [s * 0.22 * al, -0.85 * al, 0.14];
      piv.add(new THREE.Mesh(sculpt(`arm-long|${s}|${r3(al)}`, () => blend([sphere([0, 0, 0], 0.08), cone([0, 0, 0], el, 0.075, 0.06), cone(el, tip, 0.06, 0.05), ellipsoid(tip, [0.085, 0.1, 0.07])], 0.05), 0.018), limbM));
    }
    armPivots.push({ piv, s });
    hands[s > 0 ? 'clawR' : 'clawL'] = new THREE.Vector3(sx + tip[0], sy + tip[1], 0.05 + tip[2]);
  });

  // legs
  const legs = new THREE.Group(); legs.userData.sel = 'legs'; w.add(legs);
  const legParts = [], hipY = bodyY - H * 0.85;
  if (legKind === 'stub' || legKind === 'legs' || legKind === 'long') [-1, 1].forEach(s => {
    const hx = s * W * 0.45, piv = new THREE.Group(); piv.position.set(hx, hipY, 0); legs.add(piv);
    const len = hipY - FEET, foot = [s * 0.02, -len + 0.06, 0.08];
    piv.add(new THREE.Mesh(sculpt(`leg-${legKind}|${s}|${r3(len)}`, () => blend([sphere([0, 0, 0], legKind === 'long' ? 0.08 : 0.12), cone([0, 0, 0], [0, -len + 0.1, 0], legKind === 'long' ? 0.07 : 0.11, legKind === 'long' ? 0.06 : 0.1), ellipsoid(foot, [0.13, 0.07, 0.17])], 0.06), 0.02), legM));
    legParts.push({ piv, s });
  });
  if (legKind === 'tentacles') {
    const nt = L.count ?? 6;
    for (let i = 0; i < nt; i++) {
      const a = i / nt * TAU + 0.3, piv = new THREE.Group(); piv.position.set(Math.cos(a) * W * 0.45, hipY + 0.06, Math.sin(a) * W * 0.45); legs.add(piv);
      const pts = [], len = (hipY - FEET) + 0.35 * (L.len ?? 1);
      for (let j = 0; j <= 18; j++) { const u = j / 18; pts.push(new THREE.Vector3(Math.cos(a) * u * len * 0.8, -Math.min(u * 1.6, 1) * (hipY - FEET - 0.04) + Math.sin(u * 5) * 0.03, Math.sin(a) * u * len * 0.8)); }
      piv.add(sweep(pts, pts.map((_, j) => 0.085 * (1 - j / 20)), legM, 10)); legParts.push({ piv, s: i % 2 ? 1 : -1, tentacle: true, i });
    }
  }
  if (legKind === 'wisp') {
    const piv = new THREE.Group(); piv.position.set(0, hipY + 0.1, 0); legs.add(piv);
    const pts = [], len = 0.9 * (L.len ?? 1);
    for (let j = 0; j <= 24; j++) { const u = j / 24; pts.push(new THREE.Vector3(Math.sin(u * 3) * 0.18 * u, -u * len, -u * u * 0.35)); }
    piv.add(sweep(pts, pts.map((_, j) => W * 0.75 * (1 - j / 25) ** 1.4 + 0.01), legM, 16)); legParts.push({ piv, wisp: true });
  }

  // the borrowed house on the back (optional)
  const house = new THREE.Group(); house.userData.sel = 'house'; w.add(house);
  const hk = Ho.kind || 'none', hs = Ho.size ?? 1, houseY = bodyY + H * 0.2;
  let apex = new THREE.Vector3(0, (hasHead ? headY + R : bodyY + H) + 0.05, 0);
  if (hk !== 'none') {
    const back = -W * 0.85, hy = houseY, HM = ink(Ho.ink || 'toner', 0.25, 0.75);
    house.position.set(0, hy, back);
    if (hk === 'shell') { const sh = spiralShell({ size: 0.9 * hs, turns: 4.5, ink: Ho.ink || 'toner' }); sh.obj.rotation.set(-0.5, 0.6, 0); house.add(sh.obj); apex = sh.apex.clone().applyEuler(sh.obj.rotation).add(house.position); }
    if (hk === 'clock') {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.55 * hs, 0.55 * hs, 0.22 * hs, 48), HM); c.rotation.x = Math.PI / 2; house.add(c);
      house.add(sph(0.5 * hs, ink('paper', 0, 0), 0, 0, -0.1 * hs, 1, 1, 0.05, 40));
      const hand = (len, a) => { const g = new THREE.Group(); g.position.z = -0.14 * hs; g.add(limb([0, 0, 0], [0, len * hs, 0], 0.02, T)); g.rotation.z = a; house.add(g); return g; };
      const hh = hand(0.25, 1), mh = hand(0.4, -0.5); ups.push(t => { mh.rotation.z = -t * 0.6; hh.rotation.z = -t * 0.05; });
      house.rotation.y = Math.PI; apex = new THREE.Vector3(0, hy + 0.55 * hs, back);
    }
    if (hk === 'cottage') {
      house.add(new THREE.Mesh(sculpt(`cottage|${r3(hs)}`, () => blend([rbox([0, 0, 0], [0.45 * hs, 0.38 * hs, 0.35 * hs], 0.05), cone([-0.5 * hs, 0.32 * hs, 0], [0, 0.72 * hs, 0], 0.09), cone([0.5 * hs, 0.32 * hs, 0], [0, 0.72 * hs, 0], 0.09)], 0.06), 0.025), HM));
      house.add(sph(0.12 * hs, ink('fluo', 1, 0), 0, 0, -0.35 * hs, 1, 1.2, 0.3));
      apex = new THREE.Vector3(0, hy + 0.75 * hs, back);
    }
    if (hk === 'lantern') {
      house.add(new THREE.Mesh(new THREE.CylinderGeometry(0.28 * hs, 0.34 * hs, 0.62 * hs, 6, 1, true), HM));
      house.add(sph(0.2 * hs, ink('fluo', 1, 0), 0, 0, 0));
      house.add(new THREE.Mesh(new THREE.ConeGeometry(0.4 * hs, 0.28 * hs, 6), HM).translateY(0.44 * hs));
      apex = new THREE.Vector3(0, hy + 0.6 * hs, back);
    }
  }

  // belly motif: the time bank's marks
  const bk = Be.kind || 'none';
  if (bk !== 'none') {
    const bz = shape === 'box' || shape === 'house' ? W * 0.85 : shape === 'coin' ? W * 0.3 : W * 0.8, by = bodyY - H * 0.05, bs = Math.min(W, H) * 0.55;
    const g = new THREE.Group(); g.position.set(0, by, bz); body.add(g);
    if (bk === 'clock') {
      g.add(sph(bs, ink('paper', 0, 0), 0, 0, 0, 1, 1, 0.08, 32));
      g.add(new THREE.Mesh(new THREE.TorusGeometry(bs, 0.025, 8, 48), T));
      for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; g.add(sph(0.018, T, Math.cos(a) * bs * 0.82, Math.sin(a) * bs * 0.82, 0.03, 1, 1, 1, 6)); }
      const mh = new THREE.Group(); mh.position.z = 0.04; mh.add(limb([0, 0, 0], [0, bs * 0.7, 0], 0.016, T)); g.add(mh);
      g.add(limb([0, 0, 0.04], [bs * 0.4, bs * 0.15, 0.04], 0.018, T));
      ups.push(t => { mh.rotation.z = -t * 0.8; });
    }
    if (bk === 'spiral') { const pts = []; for (let j = 0; j <= 60; j++) { const u = j / 60, a = u * TAU * 2.2; pts.push(new THREE.Vector3(Math.cos(a) * bs * u, Math.sin(a) * bs * u, 0.02)); } g.add(sweep(pts, pts.map(() => 0.02), ink('fluo', 1, 0), 6)); }
    if (bk === 'buttons') [0.35, -0.05, -0.45].forEach(y => g.add(sph(0.06, T, 0, y * bs * 1.6, 0.02, 1, 1, 0.5, 12)));
    if (bk === 'heart') { const h = new THREE.Mesh(sculpt(`heart|${r3(bs)}`, () => blend([sphere([-bs * 0.28, bs * 0.15, 0], bs * 0.32), sphere([bs * 0.28, bs * 0.15, 0], bs * 0.32), cone([0, -bs * 0.45, 0], [0, bs * 0.05, 0], 0.03, bs * 0.4)], 0.06), 0.02), ink('rosso', 1, 0)); h.scale.z = 0.35; g.add(h); }
  }

  const anchors = {
    head: new THREE.Vector3(0, hasHead ? headY + R : bodyY + H, 0.1),
    back: new THREE.Vector3(0, bodyY, -W * 0.9),
    feet: new THREE.Vector3(0, FEET, 0.05),
    clawR: hands.clawR || new THREE.Vector3(W, bodyY, 0.3),
    clawL: hands.clawL || new THREE.Vector3(-W, bodyY, 0.3),
    apex,
  };
  const floats = legKind === 'wisp' || legKind === 'none' && shape === 'drop';
  return {
    obj: w, anchors, mouth,
    up(t) {
      const bob = floats ? Math.sin(t * 1.4) * 0.08 : Math.abs(Math.sin(t * 2.6)) * 0.035;
      body.position.y = head.position.y = bob;
      if (hk !== 'none') house.position.y = houseY + bob;
      if (floats) legs.position.y = bob;
      head.rotation.z = Math.sin(t * 0.9) * 0.05;
      armPivots.forEach(({ piv, s }) => { piv.rotation.z = s * (0.15 + Math.sin(t * 2 + (s > 0 ? 0 : Math.PI)) * 0.18); });
      earPivots.forEach(({ piv, s }, i) => { piv.rotation.z = Math.sin(t * 3 + i) * 0.08 * s; });
      legParts.forEach(l => {
        if (l.wisp) { l.piv.rotation.x = Math.sin(t * 1.4) * 0.12; l.piv.rotation.z = Math.sin(t * 1.1) * 0.15; }
        else if (l.tentacle) l.piv.rotation.z = Math.sin(t * 2 + l.i) * 0.12;
        else l.piv.rotation.x = Math.sin(t * 2.6 + (l.s > 0 ? 0 : Math.PI)) * 0.12;
      });
      ups.forEach(f => f(t));
    },
  };
}

// ---------- props: what each spirit gives to the time bank ----------
export function propMesh(item, s = 1) {
  const g = new THREE.Group(), T = ink('toner', 0.5, 0.5), K = ink('toner', 0.9, 0.1), F = ink('fluo', 1, 0), B = ink('blu', 0.36, 0.64), P = ink('paper', 0, 0), Rr = ink('rosso', 1, 0);
  const add = (m) => { g.add(m); return m; };
  switch (item) {
    case 'hourglass':
      add(new THREE.Mesh(sculpt('prop-hg', () => blend([cone([0, -0.2, 0], [0, 0, 0], 0.13, 0.025), cone([0, 0, 0], [0, 0.2, 0], 0.025, 0.13)], 0.03), 0.012), P));
      add(sph(0.08, F, 0, -0.13, 0, 1, 0.6, 1)); add(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.035, 24), K)).position.y = 0.23; add(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.035, 24), K)).position.y = -0.23;
      [-1, 1].forEach(x => add(limb([x * 0.14, -0.23, 0], [x * 0.14, 0.23, 0], 0.012, K))); break;
    case 'clock':
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 32), B)).rotation.x = Math.PI / 2; add(sph(0.17, P, 0, 0, 0.04, 1, 1, 0.08, 24));
      add(limb([0, 0, 0.06], [0, 0.12, 0.06], 0.012, K)); add(limb([0, 0, 0.06], [0.08, 0.02, 0.06], 0.014, K)); add(sph(0.04, F, 0, 0.24, 0)); break;
    case 'book': add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.07), Rr)); add(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.24, 0.075), P)).position.x = 0.012; break;
    case 'wrench': add(limb([0, -0.25, 0], [0, 0.15, 0], 0.035, T)); add(new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.035, 8, 16, Math.PI * 1.5), T)).position.y = 0.22; break;
    case 'ladle': add(limb([0, -0.05, 0], [0, 0.35, 0], 0.02, T)); add(new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 8, 0, TAU, Math.PI / 2, Math.PI / 2), T)).position.y = -0.05; break;
    case 'can': add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.24, 20), B)); add(limb([0.1, -0.05, 0], [0.3, 0.12, 0], 0.025, B)); add(sph(0.045, F, 0.31, 0.13, 0)); add(new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.018, 6, 16, Math.PI), B)).position.set(-0.05, 0.12, 0); break;
    case 'key': add(new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.025, 8, 20), F)).position.y = 0.2; add(limb([0, 0.12, 0], [0, -0.22, 0], 0.022, F)); add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.03), F)).position.set(0.04, -0.18, 0); break;
    case 'lantern': add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.24, 6, 1, true), K)); add(sph(0.08, F)); add(new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.1, 6), K)).position.y = 0.17; add(new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.01, 6, 12), K)).position.y = 0.25; break;
    case 'scissors': [-1, 1].forEach(sd => { const b = new THREE.Group(); b.rotation.z = sd * 0.25; b.add(limb([0, 0, 0], [0, 0.32, 0], 0.016, K)); b.add(new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.015, 6, 14), Rr).translateY(-0.06).translateX(sd * 0.04)); add(b); }); break;
    case 'coin': add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 28), F)).rotation.x = Math.PI / 2; add(new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.012, 6, 24), K)).position.z = 0.025; break;
    case 'broom': add(limb([0, -0.1, 0], [0, 0.6, 0], 0.02, T)); add(new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.3, 10), F)).position.y = -0.22; break;
    default: add(sph(0.12, F)); // heart / generic gift
  }
  g.scale.setScalar(s);
  return g;
}
// part: an item held in a hand (or claw), floating over the head, or carried on the back
export function prop(p, ctx) {
  const { item = 'hourglass', at = 'clawR' } = p, size = 1; // overall size: the common `size` gene (build.js)
  const m = propMesh(item, 1.25);
  const w = new THREE.Group(); w.add(m);
  const a = ctx.anchors[at] || ctx.anchors.clawR || ctx.anchors.head;
  w.position.copy(a); if (at === 'head') w.position.y += 0.35 * size;
  return { obj: w, up: (t) => { m.rotation.y = at === 'head' ? t * 0.8 : Math.sin(t * 1.3) * 0.25; if (at === 'head') m.position.y = Math.sin(t * 1.6) * 0.06; } };
}
// part: items orbiting the figure (hours, coins, keys): the economy of time made visible
export function orbit(p, ctx) {
  const { item = 'coin', count = 6, r = 1.6, speed = 0.4, tilt = 0.25, itemSize: size = 0.8 } = p;
  const w = new THREE.Group(), ring = new THREE.Group(); ring.rotation.x = tilt; w.add(ring);
  const list = [];
  for (let i = 0; i < count; i++) { const m = propMesh(item, size); const a = i / count * TAU; m.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); ring.add(m); list.push(m); }
  w.position.y = ctx.anchors.back ? ctx.anchors.back.y + 0.2 : 0;
  return { obj: w, up: (t) => { ring.rotation.y = t * speed; list.forEach((m, i) => { m.rotation.y = t * 1.5 + i; }); } };
}
export const TIME_PARTS = { prop, orbit };
