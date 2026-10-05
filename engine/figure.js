// The modular body plan: spirits, Y2K blobs, chibi humanoids, object-spirits.
// figure(P, ctx) -> { obj, anchors, mounts, mouth, up }: the host() contract, plus `mounts`, the moving hand
// nodes that held items attach to (so they follow the arm's swing).
// P = spec.figure: body, head, eyes, mouth, ears, arms, legs, house, belly. Every module is optional
// and sculpted as SDF, so any combination stays one coherent, smooth object.
import * as THREE from '../vendor/three.module.js';
import { ink } from './press.js';
import { sculpt, blend, sphere, ellipsoid, cone, rbox } from './sdf.js';
import { eye, mouthSet, sph, limb, sweep, spiralShell } from './parts.js';
import { rng } from './rng.js';

const TAU = Math.PI * 2;
const FEET = -1.05;
const o = (x) => (x && typeof x === 'object' ? x : {});
const r3 = (v) => Math.round(v * 1000) / 1000;

// merge many small transformed copies of one geometry into a single mesh (fur, straw, leaves)
function merged(base, matrices) {
  const b = base.index ? base.toNonIndexed() : base, pos = b.attributes.position.array, nor = b.attributes.normal.array;
  const P = new Float32Array(pos.length * matrices.length), N = new Float32Array(nor.length * matrices.length);
  const v = new THREE.Vector3(), nm = new THREE.Matrix3();
  matrices.forEach((m, k) => {
    nm.getNormalMatrix(m);
    for (let i = 0; i < pos.length; i += 3) {
      v.set(pos[i], pos[i + 1], pos[i + 2]).applyMatrix4(m); P.set([v.x, v.y, v.z], k * pos.length + i);
      v.set(nor[i], nor[i + 1], nor[i + 2]).applyMatrix3(nm).normalize(); N.set([v.x, v.y, v.z], k * nor.length + i);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  return g;
}
// matrix that puts a +y-pointing piece at `at`, pointing along `dir`, scaled
const UPV = new THREE.Vector3(0, 1, 0);
const place = (at, dir, sx = 1, sy = 1, sz = 1, spin = 0) => new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromUnitVectors(UPV, dir.clone().normalize()).multiply(new THREE.Quaternion().setFromAxisAngle(UPV, spin)), new THREE.Vector3(sx, sy, sz));

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
    // sea slug: long and low along z, a rounded head end in front, tapering tail behind
    case 'slug': return [ellipsoid(c, [W * 0.78, H * 0.5, W * 1.6]), sphere([x, y + H * 0.08, z + W * 1.15], W * 0.58), cone([x, y - H * 0.12, z - W * 1.1], [x, y - H * 0.28, z - W * 2.1], W * 0.45, W * 0.08)];
    // Olympic cyclops / Duke: a tall rounded triangle
    case 'cone': return [cone([x, y - H * 0.75, z], [x, y + H * 0.85, z], W, W * 0.14), ellipsoid([x, y - H * 0.78, z], [W * 1.02, H * 0.22, W * 0.9])];
    // sun / star: a round core with rays in the plane of the face
    case 'star': {
      const rays = Math.max(5, Math.round(10 * (W / 0.5))), L = H * 0.75, out = [sphere(c, W)];
      for (let i = 0; i < rays; i++) { const a = i / rays * TAU + Math.PI / 2; out.push(cone([x + Math.cos(a) * W * 0.7, y + Math.sin(a) * W * 0.7, z], [x + Math.cos(a) * (W + L), y + Math.sin(a) * (W + L), z], W * 0.26, 0.015)); }
      return out;
    }
    default: return [ellipsoid(c, [W, H, D])]; // egg
  }
}
// how far the torso reaches above and below its centre (for stacking head and legs)
const EXTENT = { slug: (W, H) => H * 0.5, star: (W, H) => W + H * 0.75, cone: (W, H) => H * 0.88 };
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
  const ext = EXTENT[shape] ? EXTENT[shape](W, H) : H;
  const bodyY = FEET + legLen + ext * (legKind === 'wisp' ? 0.6 : 0.92);
  const headShape = Hd.shape || 'sphere', hasHead = headShape !== 'none';
  const R = 0.42 * (Hd.size ?? 1);
  const headY = hasHead ? bodyY + ext + R * 0.72 : bodyY + ext * 0.3;

  const w = new THREE.Group(), ups = [];
  const body = new THREE.Group(); body.userData.sel = 'body'; w.add(body);

  // body (and the head too when they share an ink: one blended surface)
  const bodyKey = `fig-body|${shape}|${r3(W)}|${r3(H)}|${r3(bodyY)}`;
  const headParts = () => headSDF(headShape, [0, headY, 0], R);
  const fused = hasHead && headM === bodyM;
  body.add(new THREE.Mesh(sculpt(fused ? `${bodyKey}|head|${headShape}|${r3(R)}|${r3(headY)}` : bodyKey,
    () => blend(fused ? [...torso(shape, [0, bodyY, 0], W, H), ...headParts()] : torso(shape, [0, bodyY, 0], W, H), 0.14), 0.03), bodyM));
  // the head turns about the neck: pivot group at the neck, contents in figure space
  const neckY = hasHead ? headY - R * 0.8 : bodyY + H * 0.3;
  const headPivot = new THREE.Group(); headPivot.position.y = neckY; w.add(headPivot);
  const head = new THREE.Group(); head.userData.sel = 'head'; head.position.y = -neckY; headPivot.add(head);
  if (hasHead && !fused) head.add(new THREE.Mesh(sculpt(`fig-head|${headShape}|${r3(R)}|${r3(headY)}`, () => blend(headParts(), 0.08), 0.025), headM));

  // face: where the eyes sit (front surface of the head, or the upper body)
  // where a headless body wears its face: [height, depth of the front surface, face radius]
  const FACE = { drop: [bodyY - H * 0.3, W * 0.92, W * 0.85], hourglass: [bodyY + H * 0.55, W * 0.7, W * 0.6], bell: [bodyY + H * 0.42, W * 0.5, W * 0.45],
    capsule: [bodyY + H * 0.3, W * 0.85, W * 0.8], slug: [bodyY + H * 0.2, W * 1.68, W * 0.5], cone: [bodyY + H * 0.12, W * 0.5, W * 0.42], star: [bodyY, W * 0.92, W * 0.75], coin: [bodyY + W * 0.1, W * 0.32, W * 0.8], box: [bodyY + H * 0.25, W * 0.88, Math.min(W, H) * 0.8], house: [bodyY - H * 0.1, W * 0.88, W * 0.75] };
  const [fy, fz, fr] = FACE[shape] || [bodyY + H * 0.3, W * 0.82, Math.min(W, H) * 0.9];
  const faceR = hasHead ? R : fr;
  const faceY = (hasHead ? headY : fy) + (E.y ?? 0) * faceR, faceZ = hasHead ? (headShape === 'box' ? R * 0.85 : R * 0.9) : fz;
  const flatFace = !hasHead && ['box', 'house', 'coin'].includes(shape) || headShape === 'box';
  const face = new THREE.Group(); face.userData.sel = 'face'; (hasHead ? head : body).add(face);
  const Mk = o(P.mask), mk = Mk.kind || 'none';
  const covers = ['noh', 'longface', 'helmet', 'veil'].includes(mk); // masks that hide the face (with their own features, or none)
  const n = E.count ?? 2, es = (E.size ?? 1) * faceR / 0.42, gap = (E.gap ?? 1) * Math.max(faceR * 0.42, 0.24 * es);
  const style = E.style || 'round';
  for (let i = 0; i < (covers || mk === 'goggles' ? 0 : n); i++) {
    const k = n === 1 ? 0 : (i - (n - 1) / 2), x = k * gap * (n > 3 ? 0.8 : 1), y = faceY + (n > 2 ? (i % 2 ? -0.22 : 0.12) * Math.min(faceR, 0.3 * es) : 0);
    const z = flatFace ? faceZ : Math.sqrt(Math.max(0.01, faceZ * faceZ - x * x * 0.6)) - 0.02;
    if (style === 'button') { face.add(sph(0.075 * es, T, x, y, z + 0.02, 1, 1.25, 0.6)); face.add(sph(0.022 * es, ink('paper', 0, 0), x + 0.025 * es, y + 0.035 * es, z + 0.06, 1, 1, 0.5)); continue; }
    if (style === 'visor') continue;
    if (style === 'lens') {
      const r = 0.2 * es, g = new THREE.Group(); g.position.set(x, y, z - r * 0.25);
      g.add(new THREE.Mesh(new THREE.TorusGeometry(r * 1.05, r * 0.22, 12, 40), ink('toner', 0.45, 0.55)));
      g.add(sph(r, ink('paper', 0, 0), 0, 0, 0, 1, 1, 0.55, 28));
      g.add(sph(r * 0.62, ink('blu', 0.5, 0.5), 0, 0, r * 0.32, 1, 1, 0.4, 24));
      g.add(sph(r * 0.3, T, 0, 0, r * 0.45, 1, 1, 0.4, 16));
      g.add(sph(r * 0.12, ink('paper', 0, 0), r * 0.25, r * 0.28, r * 0.55, 1, 1, 0.4, 10));
      face.add(g); continue;
    }
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
  if (mstyle !== 'none' && !covers) {
    const my = faceY - faceR * (style === 'visor' ? 0.5 : 0.42), mz = Math.sqrt(Math.max(0.01, faceZ * faceZ - (my - faceY) ** 2 * 0.5)) + 0.005;
    mouth = mouthSet(face, 0, my, mz, 0.8 * ms * faceR / 0.42, T);
    const fs = ms * faceR / 0.42;
    if (mstyle === 'fangs') [-1, 1].forEach(s => { const c = new THREE.Mesh(new THREE.ConeGeometry(0.03 * fs, 0.09 * fs, 6), ink('paper', 0, 0)); c.rotation.x = Math.PI; c.position.set(s * 0.05 * fs, my - 0.06 * fs, mz); face.add(c); });
  }

  // mask: Noh plate, long carved face, great helm, VR goggles, a veil of fringe (briefs/costume-archetypes.md)
  const maskG = new THREE.Group(); maskG.userData.sel = 'mask'; face.add(maskG);
  if (mk !== 'none') {
    const r = faceR, cz = faceZ - r * 0.15, mInk = (Mk.ink && Mk.ink !== 'auto' ? Mk.ink : null) || ({ noh: 'paper', longface: 'toner', helmet: 'toner', goggles: 'paper', veil: 'fluo' })[mk];
    const MM = ink(mInk, mInk === 'paper' ? 0 : 0.3, mInk === 'paper' ? 0 : 0.6), DARK = ink('toner', 0.97, 0.03);
    // a point on the front of an ellipsoid plate (rx, ry, rz) centred at (0, cy, cz)
    const front = (x, y, rx, ry, rz, cy) => cz + rz * Math.sqrt(Math.max(0.02, 1 - (x / rx) ** 2 - ((y - cy) / ry) ** 2));
    if (mk === 'noh') {
      const rx = r * 0.86, ry = r * 1.08, rz = r * 0.42, cy = faceY - r * 0.05;
      maskG.add(sph(1, MM, 0, cy, cz, rx, ry, rz, 40));
      [-1, 1].forEach(s => {
        const ex = s * r * 0.3, ey = cy + r * 0.12;
        const eyeSlit = sph(1, DARK, ex, ey, front(ex, ey, rx, ry, rz, cy), r * 0.11, r * 0.035, r * 0.03, 16); eyeSlit.rotation.z = -s * 0.12; maskG.add(eyeSlit);
        maskG.add(sph(1, DARK, s * r * 0.3, cy + r * 0.48, front(s * r * 0.3, cy + r * 0.48, rx, ry, rz, cy), r * 0.07, r * 0.045, r * 0.03, 12)); // high painted brows
      });
      maskG.add(sph(1, ink('rosso', 1, 0), 0, cy - r * 0.52, front(0, cy - r * 0.52, rx, ry, rz, cy), r * 0.07, r * 0.04, r * 0.03, 12));
    }
    if (mk === 'longface') {
      const rx = r * 0.66, ry = r * 1.55, rz = r * 0.38, cy = faceY - r * 0.3;
      maskG.add(sph(1, MM, 0, cy, cz, rx, ry, rz, 40));
      [-1, 1].forEach(s => { const ex = s * r * 0.24, ey = cy + r * 0.45; maskG.add(sph(1, DARK, ex, ey, front(ex, ey, rx, ry, rz, cy), r * 0.13, r * 0.025, r * 0.03, 12)); });
      maskG.add(limb([0, cy + r * 0.38, front(0, cy + r * 0.38, rx, ry, rz, cy)], [0, cy - r * 0.35, front(0, cy - r * 0.35, rx, ry, rz, cy) + r * 0.05], r * 0.05, MM, r * 0.09)); // nose ridge
      maskG.add(sph(1, DARK, 0, cy - r * 0.85, front(0, cy - r * 0.85, rx, ry, rz, cy), r * 0.1, r * 0.04, r * 0.03, 12));
      for (let j = 0; j < 5; j++) { const y = cy + r * (1.2 - j * 0.12); maskG.add(sph(1, ink('paper', 0, 0), 0, y, front(0, y, rx, ry, rz, cy) - 0.005, r * 0.42, r * 0.012, r * 0.02, 12)); } // carved forehead bands
    }
    if (mk === 'helmet') {
      const hc = hasHead ? headY : faceY;
      maskG.add(new THREE.Mesh(sculpt(`helm|${r3(r)}|${r3(hc)}`, () => blend([rbox([0, hc - r * 0.05, 0], [r * 1.02, r * 1.12, r * 1.02], r * 0.45), cone([0, hc + r * 0.4, r * 0.95], [0, hc - r * 0.95, r * 1.08], r * 0.06, r * 0.06)], 0.05), 0.025), MM));
      maskG.add(new THREE.Mesh(new THREE.BoxGeometry(r * 1.3, r * 0.08, r * 0.2), DARK).translateY(faceY + r * 0.08).translateZ(r * 1.02)); // eye slit
      for (let j = -3; j <= 3; j++) if (j) maskG.add(sph(r * 0.035, DARK, j * r * 0.14, faceY - r * 0.42, r * 1.05, 1, 1, 0.5, 8)); // breaths
    }
    if (mk === 'goggles') {
      const gy = faceY + r * 0.05, gz = faceZ + r * 0.05;
      maskG.add(new THREE.Mesh(sculpt(`goggles|${r3(r)}`, () => rbox([0, 0, 0], [r * 0.82, r * 0.34, r * 0.3], r * 0.16), 0.02), MM).translateY(gy).translateZ(gz));
      maskG.add(new THREE.Mesh(new THREE.BoxGeometry(r * 1.3, r * 0.34, r * 0.03), ink('fluo', 1, 0)).translateY(gy).translateZ(gz + r * 0.3)); // lit front
      const strap = new THREE.Mesh(new THREE.TorusGeometry(r * 1.02, r * 0.07, 8, 40), DARK); strap.rotation.x = Math.PI / 2; strap.position.y = gy; maskG.add(strap);
    }
    if (mk === 'veil') {
      // a fringe hanging from a band across the brow, long enough to hide the face
      const ry = hasHead ? headY : faceY, band = faceY + r * 0.6, len = r * 1.9, mats = [];
      const RV = rng(53);
      for (let j = 0; j < 70; j++) {
        const a = (j / 69 - 0.5) * 2.9 + (RV.next() - 0.5) * 0.04, rr = r * (1.06 + RV.next() * 0.05), l = len * (0.8 + RV.next() * 0.4);
        const at = new THREE.Vector3(Math.sin(a) * rr, band, Math.cos(a) * rr);
        // each strand falls slightly outward, so the fringe flares instead of making a tube
        mats.push(place(at.clone().add(new THREE.Vector3(Math.sin(a) * 0.06, -l / 2, Math.cos(a) * 0.06)), new THREE.Vector3(Math.sin(a) * 0.08, 1, Math.cos(a) * 0.08), 1, l, 1));
      }
      maskG.add(new THREE.Mesh(merged(new THREE.CylinderGeometry(0.014, 0.014, 1, 5), mats), MM));
      const b = new THREE.Mesh(new THREE.TorusGeometry(r * 1.05, r * 0.06, 8, 40, Math.PI * 0.85), DARK); b.rotation.set(Math.PI / 2, 0, Math.PI * 0.075); b.position.y = band; maskG.add(b);
    }
  }

  // ears / horns / antennae
  const ears = new THREE.Group(); ears.userData.sel = 'ears'; (hasHead ? head : body).add(ears);
  // where the top of a headless body is: [height, depth, radius]
  const TOP = { slug: [bodyY + H * 0.38, W * 1.2, W * 0.42], star: [bodyY + W * 0.62, 0, W * 0.6], cone: [bodyY + ext * 0.82, 0, W * 0.22] };
  const [ty, tz, tr] = TOP[shape] || [bodyY + ext * 0.6, 0, W * 0.7];
  const ek = Ea.kind || 'none', esz = Ea.size ?? 1, topY = hasHead ? headY : ty, topR = hasHead ? R : tr, topZ = hasHead ? 0 : tz;
  const earM = Ea.ink ? ink(Ea.ink, 0.36, 0.64) : headM, earPivots = [];
  if (ek !== 'none') [-1, 1].forEach(s => {
    if ((ek === 'sprout' || ek === 'peak') && s < 0) return; // one, in the middle
    const piv = new THREE.Group(); piv.position.set(s * topR * 0.55, topY + topR * 0.7, topZ); ears.add(piv); earPivots.push({ piv, s, base: 0 });
    if (ek === 'cat') piv.add(new THREE.Mesh(new THREE.ConeGeometry(0.13 * esz, 0.32 * esz, 4), earM).translateY(0.1 * esz).rotateZ(-s * 0.3));
    if (ek === 'bunny') piv.add(sph(0.5, earM, s * 0.04, 0.32 * esz, 0, 0.16 * esz, 0.75 * esz, 0.08 * esz, 18));
    if (ek === 'fins') { piv.position.set(s * topR * 0.98, topY, 0); piv.add(sph(0.5, earM, s * 0.12 * esz, 0, 0, 0.36 * esz, 0.42 * esz, 0.06 * esz, 18)); }
    if (ek === 'horns') {
      const pts = []; for (let j = 0; j <= 14; j++) { const u = j / 14; pts.push(new THREE.Vector3(s * (0.05 + u * 0.25 * esz), u * 0.42 * esz, -u * u * 0.18 * esz)); }
      piv.add(sweep(pts, pts.map((_, j) => 0.075 * esz * (1 - j / 15)), ink('toner', 0.4, 0.6), 10));
    }
    if (ek === 'floppy') { // long drooping ears (Cinnamoroll, plush rabbits)
      piv.position.set(s * topR * 0.78, topY + topR * 0.35, topZ);
      piv.add(sph(0.5, earM, 0, -0.42 * esz, 0, 0.26 * esz, 0.95 * esz, 0.1 * esz, 20));
      piv.rotation.z = s * 1.15; earPivots.at(-1).base = s * 1.15;
    }
    if (ek === 'sprout') { // Pikmin: a stem and a leaf
      piv.position.set(0, topY + topR * 0.85, topZ);
      const pts = []; for (let j = 0; j <= 12; j++) { const u = j / 12; pts.push(new THREE.Vector3(Math.sin(u * 2) * 0.05 * esz, u * 0.42 * esz, 0)); }
      piv.add(sweep(pts, pts.map(() => 0.016), T, 6));
      const leaf = sph(0.5, ink('fluo', 1, 0), 0.1 * esz, 0.5 * esz, 0, 0.16 * esz, 0.3 * esz, 0.03 * esz, 18); leaf.rotation.z = -0.9; piv.add(leaf);
    }
    if (ek === 'feelers') { // sea-slug rhinophores: two soft clubs
      piv.position.set(s * topR * 0.5, topY + topR * 0.25, topZ);
      piv.add(new THREE.Mesh(sculpt(`feeler|${r3(esz)}`, () => blend([cone([0, 0, 0], [0.05 * esz, 0.32 * esz, 0], 0.05 * esz, 0.04 * esz), ellipsoid([0.06 * esz, 0.38 * esz, 0], [0.065 * esz, 0.12 * esz, 0.065 * esz])], 0.04), 0.012), earM));
      piv.rotation.z = -s * 0.25; earPivots.at(-1).base = -s * 0.25;
    }
    if (ek === 'antlers') { // a beam and three tines, like the Wilder Mann
      piv.position.set(s * topR * 0.5, topY + topR * 0.6, topZ);
      const beam = []; for (let j = 0; j <= 14; j++) { const u = j / 14; beam.push(new THREE.Vector3(s * u * 0.45 * esz, u * 0.75 * esz, -u * u * 0.15 * esz)); }
      piv.add(sweep(beam, beam.map((_, j) => 0.05 * esz * (1 - j / 17)), earM, 8));
      [0.35, 0.6, 0.85].forEach((u, j) => { const b = beam[Math.round(u * 14)]; piv.add(limb([b.x, b.y, b.z], [b.x + s * (0.02 + j * 0.03) * esz, b.y + (0.28 - j * 0.04) * esz, b.z + 0.06 * esz], 0.028 * esz, earM, 0.012 * esz)); });
    }
    if (ek === 'peak') { // a tall pointed hat (Schlemmer, the Schellerlaufen, the capirote)
      piv.position.set(0, topY + topR * 0.55, topZ);
      piv.add(new THREE.Mesh(new THREE.ConeGeometry(topR * 0.85, 1.1 * esz, 32), earM).translateY(0.55 * esz));
      piv.add(new THREE.Mesh(new THREE.TorusGeometry(topR * 0.84, 0.03, 8, 32), ink('toner', 0.9, 0.1)).rotateX(Math.PI / 2));
    }
    if (ek === 'antenna') { piv.position.x = s * topR * 0.35; piv.add(limb([0, 0, 0], [s * 0.12 * esz, 0.42 * esz, 0], 0.016, T)); piv.add(sph(0.065 * esz, ink('fluo', 1, 0), s * 0.12 * esz, 0.45 * esz, 0)); }
  });

  // arms
  const arms = new THREE.Group(); arms.userData.sel = 'arms'; body.add(arms);
  const ak = A.kind || 'stub', al = A.len ?? 1, armPivots = [], hands = {}, mounts = {};
  if (ak !== 'none') [-1, 1].forEach(s => {
    const ARM = { hourglass: 0.55, cone: 0.62, slug: 0.72, star: 0.95 };
    const sx = s * W * (ARM[shape] ?? 0.92), sy = bodyY + H * (shape === 'drop' ? -0.15 : shape === 'cone' ? -0.1 : 0.2);
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
    const side = s > 0 ? 'clawR' : 'clawL', hand = new THREE.Object3D();
    hand.position.set(...tip); piv.add(hand); mounts[side] = hand;
    hands[side] = new THREE.Vector3(sx + tip[0], sy + tip[1], 0.05 + tip[2]);
  });

  // legs
  const legs = new THREE.Group(); legs.userData.sel = 'legs'; w.add(legs);
  const legParts = [], hipY = bodyY - ext * 0.85, fs = L.foot ?? 1;
  if (legKind === 'stub' || legKind === 'legs' || legKind === 'long') [-1, 1].forEach(s => {
    const hx = s * W * 0.45, piv = new THREE.Group(); piv.position.set(hx, hipY, 0); legs.add(piv);
    const len = hipY - FEET, foot = [s * 0.02, -len + 0.06, 0.08];
    const footR = [0.13 * fs, 0.07 * Math.sqrt(fs), 0.17 * fs]; foot[2] += 0.04 * (fs - 1);
    piv.add(new THREE.Mesh(sculpt(`leg-${legKind}|${s}|${r3(len)}|${r3(fs)}`, () => blend([sphere([0, 0, 0], legKind === 'long' ? 0.08 : 0.12), cone([0, 0, 0], [0, -len + 0.1, 0], legKind === 'long' ? 0.07 : 0.11, legKind === 'long' ? 0.06 : 0.1), ellipsoid(foot, footR)], 0.06), 0.02), legM));
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

  // body surface approximated as an ellipsoid, for things that grow out of it (frills, spots)
  const SURF = { slug: [W * 0.78, H * 0.5, W * 1.6], star: [W, W, W], cone: [W * 0.7, ext, W * 0.6] };
  const [sx0, sy0, sz0] = SURF[shape] || [W, ext, W * 0.85];
  const onSurface = (u, v) => new THREE.Vector3(Math.cos(v) * Math.sin(u) * sx0, Math.cos(u) * sy0, Math.sin(v) * Math.sin(u) * sz0).add(new THREE.Vector3(0, bodyY, 0));
  const normalAt = (p) => new THREE.Vector3(p.x / (sx0 * sx0), (p.y - bodyY) / (sy0 * sy0), p.z / (sz0 * sz0)).normalize();

  // back: frills / gills (nudibranch cerata), bat wings, dorsal spines
  const Bk = o(P.back), backKind = Bk.kind || 'none', bsz = Bk.size ?? 1, backM = ink(Bk.ink || 'fluo', Bk.ink && Bk.ink !== 'fluo' ? 0.36 : 1, Bk.ink && Bk.ink !== 'fluo' ? 0.64 : 0);
  const backG = new THREE.Group(); backG.userData.sel = 'back'; body.add(backG);
  const backParts = [];
  if (backKind === 'frills') {
    const n = Bk.count ?? 14, R2 = rng(n * 31 + 7);
    for (let i = 0; i < n; i++) {
      let at;
      if (shape === 'slug') { // two rows along the back, like the cerata of a nudibranch
        const row = i % 2 ? 1 : -1, k = Math.floor(i / 2) / Math.max(1, Math.ceil(n / 2) - 1);
        const z = sz0 * (0.55 - k * 1.35), x = row * sx0 * 0.5 * Math.sqrt(Math.max(0, 1 - (z / sz0) ** 2));
        at = new THREE.Vector3(x, bodyY + sy0 * Math.sqrt(Math.max(0.02, 1 - (x / sx0) ** 2 - (z / sz0) ** 2)), z);
      } else at = onSurface(0.3 + R2.next() * 0.8, -Math.PI / 2 + (R2.next() - 0.5) * 2.2); // a crest on the back half (-z)
      const out = normalAt(at).add(new THREE.Vector3(0, 0.6, 0)).normalize();
      const len = (shape === 'slug' ? 0.22 + R2.next() * 0.12 : 0.14 + R2.next() * 0.1) * bsz, g = new THREE.Group(); g.position.copy(at); g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), out);
      g.add(new THREE.Mesh(sculpt(`cera|${r3(len)}`, () => blend([cone([0, 0, 0], [0, len, 0], 0.045 * bsz, 0.02 * bsz), sphere([0, len, 0], 0.03 * bsz)], 0.03), 0.01), backM));
      g.add(sph(0.022 * bsz, ink('paper', 0, 0), 0, len + 0.02 * bsz, 0, 1, 1, 1, 8));
      backG.add(g); backParts.push({ g, i, q: g.quaternion.clone() });
    }
  }
  if (backKind === 'batwings') [-1, 1].forEach(s => {
    const sh = new THREE.Shape(); const k = 0.5 * bsz;
    sh.moveTo(0, 0); sh.quadraticCurveTo(k * 0.6, k * 1.0, k * 1.6, k * 1.1); // leading edge to the tip
    for (let j = 0; j < 3; j++) { const x0 = k * (1.6 - j * 0.5), x1 = k * (1.1 - j * 0.5); sh.quadraticCurveTo((x0 + x1) / 2, k * (0.45 - j * 0.08), x1, k * (0.75 - j * 0.15)); } // scalloped trailing edge
    sh.quadraticCurveTo(k * 0.15, k * 0.2, 0, 0);
    const m = new THREE.Mesh(new THREE.ShapeGeometry(sh, 12), Bk.ink ? backM : ink('toner', 0.3, 0.7)); m.scale.x = s;
    const piv = new THREE.Group(); piv.position.set(s * W * 0.35, bodyY + ext * 0.25, -sz0 * 0.75); piv.rotation.y = s * 0.35; piv.add(m);
    backG.add(piv); backParts.push({ piv, s, wing: true });
  });
  if (backKind === 'spines') {
    const n = Bk.count ?? 7;
    for (let i = 0; i < n; i++) {
      const u = 0.15 + (i / Math.max(1, n - 1)) * 0.85, at = onSurface(u, -Math.PI / 2 - 0 * u).setZ(-Math.sin(u) * sz0), h = (0.12 + 0.1 * Math.sin(u * Math.PI)) * bsz;
      const out = at.clone().sub(new THREE.Vector3(0, bodyY, 0)).normalize();
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.06 * bsz, h, 8), backM); c.position.copy(at).addScaledVector(out, h * 0.35); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), out);
      backG.add(c);
    }
  }
  // tail: devil, curl, puff
  const Tl = o(P.tail), tailKind = Tl.kind || 'none', tl = Tl.len ?? 1, tailM = Tl.ink ? ink(Tl.ink, 0.36, 0.64) : bodyM;
  const tailG = new THREE.Group(); tailG.userData.sel = 'tail'; tailG.position.set(0, bodyY - ext * 0.55, -sz0 * 0.92); body.add(tailG);
  if (tailKind === 'devil' || tailKind === 'curl') {
    const pts = [];
    for (let j = 0; j <= 30; j++) {
      const u = j / 30;
      pts.push(tailKind === 'devil'
        ? new THREE.Vector3(Math.sin(u * 2.2) * 0.25 * tl, -0.1 * tl + u * u * 0.75 * tl, -u * 0.55 * tl)
        : new THREE.Vector3(Math.cos(u * TAU * 1.6) * 0.12 * (1 - u * 0.5) * tl, Math.sin(u * TAU * 1.6) * 0.12 * (1 - u * 0.5) * tl + u * 0.15 * tl, -0.05 - u * 0.25 * tl));
    }
    tailG.add(sweep(pts, pts.map((_, j) => (tailKind === 'devil' ? 0.035 : 0.045) * (1 - j / 40)), tailM, 8));
    if (tailKind === 'devil') { const tip = new THREE.Mesh(new THREE.ConeGeometry(0.09 * tl, 0.16 * tl, 3), tailM); tip.position.copy(pts.at(-1)); tip.lookAt(pts.at(-1).clone().multiplyScalar(2).sub(pts.at(-4))); tip.rotateX(Math.PI / 2); tailG.add(tip); }
  }
  if (tailKind === 'puff') tailG.add(sph(0.16 * tl, Tl.ink ? tailM : ink('paper', 0, 0), 0, 0.05, -0.04, 1, 1, 1, 18));

  // coat: what covers the whole body (Soundsuits, Wilder Mann, Jack-in-the-green, robes, Schlemmer's hoops)
  const Cv = o(P.coat), ck = Cv.kind || 'none', cl = Cv.len ?? 1, dens = Cv.density ?? 1;
  const coatM = ink((Cv.ink && Cv.ink !== 'auto' ? Cv.ink : null) || ({ fur: 'blu', straw: 'rosso', leaves: 'fluo', cloak: 'toner', hoops: 'fluo' })[ck] || 'blu', 0.36, 0.64);
  const coat = new THREE.Group(); coat.userData.sel = 'coat'; body.add(coat);
  const R4 = rng(4049);
  const overHead = (fn) => { if (!hasHead) return; for (let i = 0; i < 60 * dens; i++) { const u = R4.next() * 1.9, v = R4.next() * TAU, n = new THREE.Vector3(Math.cos(v) * Math.sin(u), Math.cos(u), Math.sin(v) * Math.sin(u)); fn(new THREE.Vector3(0, headY, 0).addScaledVector(n, R * 0.98), n); } };
  if (ck === 'fur' || ck === 'leaves') {
    const mats = [], leaf = ck === 'leaves';
    const add = (at, n) => {
      const droop = leaf ? 0.75 : 0.8, dir = n.clone().multiplyScalar(1 - droop).add(new THREE.Vector3(0, -droop, 0)); // hang under their weight
      const L = (leaf ? 0.26 : 0.38 + R4.next() * 0.2) * cl;
      // fur: thick at the root, many and long; leaves: broad and flat, tilted out from the body
      mats.push(place(at.clone().addScaledVector(dir.clone().normalize(), L * (leaf ? 0.35 : 0.45)), dir, leaf ? L * 0.85 : 1.6, L, leaf ? L * 0.12 : 1.6, leaf ? R4.next() * 0.6 : R4.next() * TAU));
    };
    for (let i = 0; i < (leaf ? 220 : 520) * dens; i++) { const u = 0.08 + R4.next() * 2.9, v = R4.next() * TAU, at = onSurface(u, v); add(at, normalAt(at)); }
    overHead(add);
    coat.add(new THREE.Mesh(merged(leaf ? new THREE.SphereGeometry(0.5, 10, 6) : new THREE.ConeGeometry(0.035, 1, 5), mats), coatM));
  }
  if (ck === 'straw') {
    // tiers of hanging strands from the shoulders to the ground; each tier overlaps the next
    const top = hasHead ? neckY + 0.02 : bodyY + ext * 0.85, tiers = 5, mats = [];
    for (let t = 0; t < tiers; t++) {
      const y = top - (top - FEET) * (t / tiers), rad = Math.max(W, sx0) * (0.75 + t * 0.12) + 0.04, len = (top - FEET) / tiers * 1.55 * cl;
      for (let j = 0; j < 54 * dens; j++) {
        const a = (j + R4.next() * 0.6) / (54 * dens) * TAU, out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
        const dir = new THREE.Vector3(0, -1, 0).addScaledVector(out, 0.18);
        mats.push(place(new THREE.Vector3(Math.cos(a) * rad, y, Math.sin(a) * rad).addScaledVector(dir.clone().normalize(), len * 0.5), dir.negate(), 1, len, 1, R4.next()));
      }
    }
    coat.add(new THREE.Mesh(merged(new THREE.ConeGeometry(0.03, 1, 4), mats), coatM));
  }
  if (ck === 'cloak') {
    // a robe flaring to the ground and, on a head, a hood open at the front
    const top = hasHead ? neckY + 0.04 : bodyY + ext * 0.7, prof = [];
    for (let j = 0; j <= 12; j++) { const u = j / 12; prof.push(new THREE.Vector2(Math.max(W, sx0) * (0.85 + Math.sqrt(u) * 0.6 * cl), top - (top - FEET - 0.02) * u)); } // shoulders, then the fall
    const robe = new THREE.Mesh(new THREE.LatheGeometry(prof, 40), coatM); coat.add(robe);
    if (hasHead) {
      // a deep hood, open at the front, peaked at the back; the face sits back inside it
      const hood = new THREE.Group(); hood.position.y = headY; hood.userData.sel = 'coat'; head.add(hood);
      // a cowl: wider than the head, falling to the shoulders, open only at the front
      hood.add(new THREE.Mesh(new THREE.SphereGeometry(R * 1.34, 40, 24, Math.PI * 0.78, Math.PI * 1.44, 0, Math.PI * 0.93), coatM));
      const tip = new THREE.Mesh(new THREE.ConeGeometry(R * 0.6, R * 1.25, 24), coatM); tip.position.set(0, R * 1.1, -R * 0.55); tip.rotation.x = -0.6; hood.add(tip);
    }
  }
  if (ck === 'hoops') {
    // Schlemmer: rings around the body, widest at the hips, with a disc skirt
    const n = Math.round(4 * dens) + 1;
    for (let j = 0; j < n; j++) {
      const u = j / Math.max(1, n - 1), y = bodyY - ext * 0.7 + u * ext * 1.3, rad = Math.max(W, sx0) * (1.55 - u * 0.5) * cl;
      const t = new THREE.Mesh(new THREE.TorusGeometry(rad, 0.035, 8, 56), j % 2 ? coatM : ink('toner', 0.9, 0.1)); t.rotation.x = Math.PI / 2; t.position.y = y; coat.add(t);
    }
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(W, sx0) * 1.6 * cl, Math.max(W, sx0) * 1.6 * cl, 0.03, 48), coatM); skirt.position.y = bodyY - ext * 0.8; coat.add(skirt);
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
    // on a star the face is in the middle, so the mark goes below it, smaller
    const bz = shape === 'box' || shape === 'house' ? W * 0.85 : shape === 'coin' ? W * 0.3 : shape === 'star' ? W * 0.75 : W * 0.8;
    const by = shape === 'star' ? bodyY - W * 0.58 : bodyY - H * 0.05, bs = shape === 'star' ? W * 0.3 : Math.min(W, H) * 0.55;
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
    if (bk === 'spots') { // dots over the whole body, nudibranch-style
      body.remove(g); const R3 = rng(97);
      for (let i = 0; i < 22; i++) {
        const u = 0.3 + R3.next() * 1.6, v = R3.next() * TAU, at = onSurface(u, v), n = normalAt(at); // the upper body, where they show
        const d = sph(0.04 + R3.next() * 0.04, ink('rosso', 1, 0), 0, 0, 0, 1, 1, 0.3, 12); d.position.copy(at).addScaledVector(n, 0.004); d.lookAt(at.clone().add(n)); body.add(d);
      }
    }
    if (bk === 'heart') { const h = new THREE.Mesh(sculpt(`heart|${r3(bs)}`, () => blend([sphere([-bs * 0.28, bs * 0.15, 0], bs * 0.32), sphere([bs * 0.28, bs * 0.15, 0], bs * 0.32), cone([0, -bs * 0.45, 0], [0, bs * 0.05, 0], 0.03, bs * 0.4)], 0.06), 0.02), ink('rosso', 1, 0)); h.scale.z = 0.35; g.add(h); }
  }

  const anchors = {
    face: new THREE.Vector3(0, faceY, faceZ),
    head: new THREE.Vector3(0, hasHead ? headY + R : bodyY + H, 0.1),
    back: new THREE.Vector3(0, bodyY, -W * 0.9),
    feet: new THREE.Vector3(0, FEET, 0.05),
    clawR: hands.clawR || new THREE.Vector3(W, bodyY, 0.3),
    clawL: hands.clawL || new THREE.Vector3(-W, bodyY, 0.3),
    apex,
  };
  const floats = legKind === 'wisp' || legKind === 'none' && shape === 'drop';
  return {
    obj: w, anchors, mounts, mouth,
    up(t) {
      const bob = floats ? Math.sin(t * 1.4) * 0.08 : Math.abs(Math.sin(t * 2.6)) * 0.035;
      body.position.y = bob; headPivot.position.y = neckY + bob;
      if (hk !== 'none') house.position.y = houseY + bob;
      if (floats) legs.position.y = bob;
      if (!fused) headPivot.rotation.z = Math.sin(t * 0.9) * 0.06;
      armPivots.forEach(({ piv, s }) => { piv.rotation.z = s * (0.15 + Math.sin(t * 2 + (s > 0 ? 0 : Math.PI)) * 0.18); });
      earPivots.forEach(({ piv, s, base }, i) => { piv.rotation.z = base + Math.sin(t * 3 + i) * 0.08 * s; });
      legParts.forEach(l => {
        if (l.wisp) { l.piv.rotation.x = Math.sin(t * 1.4) * 0.12; l.piv.rotation.z = Math.sin(t * 1.1) * 0.15; }
        else if (l.tentacle) l.piv.rotation.z = Math.sin(t * 2 + l.i) * 0.12;
        else l.piv.rotation.x = Math.sin(t * 2.6 + (l.s > 0 ? 0 : Math.PI)) * 0.12;
      });
      backParts.forEach(b => {
        if (b.wing) b.piv.rotation.y = b.s * (0.35 + Math.sin(t * 5) * 0.35);
        else b.g.quaternion.copy(b.q).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(t * 2 + b.i) * 0.12, 0, Math.cos(t * 1.7 + b.i) * 0.12)));
      });
      tailG.rotation.y = Math.sin(t * 2.4) * 0.3;
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
// (overall size is the common `size` gene, applied by build.js)
export function prop(p, ctx) {
  const { item = 'hourglass', at = 'clawR' } = p;
  const m = propMesh(item, 1.25), w = new THREE.Group(); w.add(m);
  const floating = at === 'head';
  // in a hand that moves: ride on it; otherwise sit at the static anchor
  const mount = !floating && ctx.mounts?.[at] ? at : null;
  if (!mount) { w.position.copy(ctx.anchors[at] || ctx.anchors.clawR || ctx.anchors.head); if (floating) w.position.y += 0.35; }
  return { obj: w, mount, up: (t) => { m.rotation.y = floating ? t * 0.8 : Math.sin(t * 1.3) * 0.25; if (floating) m.position.y = Math.sin(t * 1.6) * 0.06; } };
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
