// Collettivo series: justice, solidarity, the commons, Soviet constructivism.
// Same contract as parts.js: (params, ctx) => { obj, up?(t), hideHost?, hostAt? }
import * as THREE from '../vendor/three.module.js';
import { ink } from './press.js';
import { sph, limb, sweep, spiralShell } from './parts.js';
import { sculpt, blend, cone, rbox } from './sdf.js';

const TAU = Math.PI * 2;
const lerp = (a, b, u) => a + (b - a) * u;
const ease = (u) => u * u * (3 - 2 * u);

// A cloth banner on a pole. No lettering: the colour is the slogan.
export function banner(p, ctx) {
  const { w = 1.1, h = 0.6, pole = 1.6, inkName = 'rosso', at = 'apex' } = p;
  const g = new THREE.Group();
  g.add(limb([0, 0, 0], [0, pole, 0], 0.025, ink('toner', 0.8, 0.2)));
  g.add(sph(0.05, ink('toner', 0.8, 0.2), 0, pole + 0.03, 0));
  const geo = new THREE.PlaneGeometry(w, h, 24, 10); geo.translate(w / 2, pole - h / 2, 0);
  const cloth = new THREE.Mesh(geo, ink(inkName, 1, 0)); g.add(cloth);
  const base = geo.attributes.position.array.slice();
  const a = ctx.anchors[at] || ctx.anchors.apex;
  g.position.copy(a).add(new THREE.Vector3(...(p.offset || [0, -0.05, 0]))); g.rotation.z = p.tilt ?? -0.12;
  return {
    obj: g, up: (t) => {
      const pos = geo.attributes.position.array;
      for (let i = 0; i < pos.length; i += 3) {
        const u = base[i] / w;
        pos[i + 2] = Math.sin(u * 5 - t * 4.2) * 0.09 * u + Math.sin(u * 9 - t * 6) * 0.02 * u;
        pos[i + 1] = base[i + 1] - u * u * 0.05 * (1 + Math.sin(t * 2));
      }
      geo.attributes.position.needsUpdate = true; geo.computeVertexNormals();
    },
  };
}

// Tatlin's Monument to the Third International: two leaning spirals, a spine, three rotating halls.
// The crab has no borrowed shell: the house is a public monument.
export function tatlin(p, ctx) {
  const { h = 3.4, turns = 2.4, lean = 0.42, r0 = 1.25 } = p;
  const T = ink('toner', 0.55, 0.45), w = new THREE.Group(), tower = new THREE.Group();
  const axis = (u) => new THREE.Vector3(Math.sin(lean) * h * u, h * u, 0);
  const helix = (ph) => {
    const pts = [];
    for (let i = 0; i <= 160; i++) {
      const u = i / 160, a = u * turns * TAU + ph, r = r0 * (1 - u * 0.78);
      pts.push(axis(u).add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)));
    }
    return pts;
  };
  const A = helix(0), B = helix(Math.PI);
  tower.add(sweep(A, A.map(() => 0.035), T, 8), sweep(B, B.map(() => 0.035), T, 8));
  // the leaning spine and the lattice that ties the spirals to it
  tower.add(limb([0, 0, -0.1], axis(1.04).toArray(), 0.05, T));
  const legB = [-0.9, 0, -0.7]; tower.add(limb(legB, axis(0.42).toArray(), 0.035, T));
  for (let i = 4; i <= 160; i += 8) {
    const c = axis(i / 160);
    tower.add(limb(A[i].toArray(), c.toArray(), 0.012, T), limb(B[i].toArray(), c.toArray(), 0.012, T));
    if (i + 8 <= 160) tower.add(limb(A[i].toArray(), B[i + 8].toArray(), 0.01, T));
  }
  // halls: cube (legislature), pyramid (executive), cylinder (press), each turning at its own speed
  const halls = [
    { m: new THREE.Mesh(sculpt('hall-cube', () => rbox([0, 0, 0], [0.42, 0.36, 0.42], 0.04), 0.02), ink('rosso', 1, 0)), u: 0.2, s: 1 / 365 },
    { m: new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.62, 4), ink('blu', 0.35, 0.6)), u: 0.47, s: 1 / 30 },
    { m: new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.4, 40), ink('toner', 0.3, 0.6)), u: 0.68, s: 1 },
  ];
  halls.forEach(o => { o.m.position.copy(axis(o.u)); tower.add(o.m); });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 12, 0, TAU, 0, Math.PI / 2), ink('fluo', 1, 0)); dome.position.copy(axis(0.86)); tower.add(dome);
  tower.position.set(-0.2, -1.05, -0.35);
  w.add(tower);
  return {
    obj: w, hostAt: new THREE.Vector3(0.15, -0.05, 0.75),
    up: (t) => halls.forEach((o, i) => { o.m.rotation.y = t * (0.25 + i * 0.35); }),
  };
}

// El Lissitzky, "Beat the Whites with the Red Wedge" (1919): the crab rides the wedge.
export function wedge(p, ctx) {
  const { len = 2.6, disc = 1.05 } = p;
  const w = new THREE.Group(), R = ink('rosso', 1, 0), T = ink('toner', 0.25, 0.65);
  const tri = new THREE.Shape([new THREE.Vector2(0, -0.32), new THREE.Vector2(len, 0), new THREE.Vector2(0, 0.32)]);
  const wg = new THREE.Mesh(new THREE.ExtrudeGeometry(tri, { depth: 0.28, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 }), R);
  wg.position.set(-1.9, -1.1, -0.1); wg.rotation.z = 0.32; w.add(wg);
  const d = new THREE.Mesh(new THREE.CylinderGeometry(disc, disc, 0.3, 72), T);
  d.rotation.x = Math.PI / 2; d.position.set(1.15, 0.65, -0.75); w.add(d);
  // the debris of the broken circle and the small wedges of the composition
  const bits = [];
  for (let i = 0; i < 9; i++) {
    const b = new THREE.Mesh(i % 3 ? new THREE.BoxGeometry(ctx.rng.range(0.08, 0.3), ctx.rng.range(0.04, 0.12), 0.06) : new THREE.ConeGeometry(0.08, 0.3, 3), i % 4 ? T : R);
    const home = new THREE.Vector3(ctx.rng.range(0.2, 2.4), ctx.rng.range(-1.2, 1.6), ctx.rng.range(-0.8, 0.2));
    b.position.copy(home); b.rotation.set(ctx.rng.range(0, 3), ctx.rng.range(0, 3), ctx.rng.range(0, 3)); w.add(b); bits.push({ b, home, o: ctx.rng.range(0, 6) });
  }
  return {
    obj: w, hostAt: new THREE.Vector3(-0.35, -0.25, 0.25),
    up: (t) => { wg.position.x = -1.9 + Math.sin(t * 1.5) * 0.06; bits.forEach(({ b, home, o }) => { b.position.y = home.y + Math.sin(t + o) * 0.06; b.rotation.z += 0.004; }); },
  };
}

// Lissitzky's Lenin Tribune (1920–24): a leaning girder, a platform, a hanging screen.
export function tribune(p, ctx) {
  const { len = 3.2, ang = 0.85 } = p;
  const w = new THREE.Group(), T = ink('toner', 0.45, 0.5), R = ink('rosso', 1, 0);
  const base = new THREE.Mesh(sculpt('trib-base', () => rbox([0, 0, 0], [0.55, 0.32, 0.45], 0.03), 0.025), ink('toner', 0.25, 0.6));
  base.position.set(-1.1, -1.25, -0.2); w.add(base);
  const dir = new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0), o = new THREE.Vector3(-1.1, -0.95, -0.2);
  const rail = (dz) => { const a = o.clone().add(new THREE.Vector3(0, 0, dz)), b = a.clone().add(dir.clone().multiplyScalar(len)); w.add(limb(a.toArray(), b.toArray(), 0.04, T)); return [a, b]; };
  const [a1] = rail(-0.18), [a2] = rail(0.18);
  for (let i = 0; i <= 12; i++) {
    const u = i / 12, p1 = a1.clone().add(dir.clone().multiplyScalar(len * u)), p2 = a2.clone().add(dir.clone().multiplyScalar(len * Math.min(1, u + 1 / 12)));
    w.add(limb(p1.toArray(), p2.toArray(), 0.012, T));
    w.add(limb(p1.toArray(), p1.clone().setZ(0.18 - 0.2).toArray(), 0.01, T));
  }
  const top = o.clone().add(dir.clone().multiplyScalar(len));
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.55, 0.08, 40), T); deck.position.copy(top).add(new THREE.Vector3(0.1, 0, 0)); w.add(deck);
  // the screen hangs blank: no slogans
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.03), R);
  screen.position.copy(o.clone().add(dir.clone().multiplyScalar(len * 0.55))).add(new THREE.Vector3(0.55, -0.55, 0.25)); screen.rotation.z = -0.12; w.add(screen);
  w.add(limb(screen.position.clone().add(new THREE.Vector3(-0.3, 0.27, 0)).toArray(), o.clone().add(dir.clone().multiplyScalar(len * 0.55)).toArray(), 0.008, T));
  // megaphone in the raised big claw
  const mega = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.05, 0.55, 24, 1, true), ink('rosso', 1, 0));
  const hostPos = top.clone().add(new THREE.Vector3(0.1, 0.62, 0.1));
  return {
    obj: w, hostAt: hostPos, hostScale: 0.62,
    after: (hostWrap, anchors) => {
      const tip = anchors.clawR.clone().multiplyScalar(hostWrap.scale.x).add(hostWrap.position);
      mega.position.copy(tip).add(new THREE.Vector3(0.18, 0.1, 0.15)); mega.rotation.set(0.3, 0, -1.3); w.add(mega);
    },
    up: (t) => { screen.rotation.y = Math.sin(t * 0.8) * 0.15; mega.rotation.z = -1.3 + Math.sin(t * 2.6) * 0.08; },
  };
}

// Vacancy chain: hermit crabs queue by size; when a bigger shell arrives everyone moves up one house.
// (Lewis & Rotjan 2009: redistribution without property.)
export function chain(p, ctx) {
  const { n = 5, period = 3.2, s0 = 0.32, s1 = 0.78, gap = 1.25 } = p;
  const w = new THREE.Group(), crabs = [];
  const slot = (k) => ({ x: lerp(-gap * (n - 1) / 2, gap * (n - 1) / 2, k / (n - 1)), s: lerp(s0, s1, k / (n - 1)) });
  for (let j = 0; j < n; j++) { const h = ctx.buildHost({ legs: 3 }); const g = new THREE.Group(); g.add(h.obj); w.add(g); crabs.push({ g, h, j }); }
  // the new, bigger, empty shell waiting at the head of the queue
  const vacant = spiralShell({ size: 1.5 * s1 * 1.25, turns: 4.5, growth: 0.1, ribs: 0.5 });
  const vg = new THREE.Group(); vg.add(vacant.obj); vg.rotation.set(-0.3, -1.2, 0); w.add(vg);
  return {
    obj: w, hideHost: true,
    up: (t) => {
      const cyc = t / period, ph = cyc % 1, step = Math.floor(cyc), move = ease(Math.min(1, ph * 1.6));
      crabs.forEach(c => {
        c.h.up(t + c.j);
        const k = (c.j + step) % n, A = slot(k), B = slot(Math.min(n - 1, k + 1));
        const last = k === n - 1;
        const x = last ? A.x + move * gap * 0.8 : lerp(A.x, B.x, move), s = last ? A.s * (1 - move) : lerp(A.s, B.s, move);
        c.g.position.set(x, Math.sin(move * Math.PI) * 0.35 * s - 1.05 * (1 - s), 0);
        c.g.scale.setScalar(Math.max(0.001, k === 0 ? s * ease(Math.min(1, ph * 3)) : s));
        c.g.rotation.y = -0.5;
      });
      const head = slot(n - 1);
      vg.position.set(head.x + gap * 0.9 + (1 - ease(Math.min(1, ph * 2))) * 1.5, -0.9, 0.1);
      vg.scale.setScalar(ph < 0.62 ? 1 : 1 - ease((ph - 0.62) / 0.38));
    },
  };
}

// One huge communal shell (Narkomfin, the commune house): many tenants, one house.
export function commune(p, ctx) {
  const { tenants = 6, size = 3.2 } = p;
  const w = new THREE.Group();
  const sh = spiralShell({ size, turns: 4.2, growth: 0.11, ribs: 0.6, ink: 'toner', base: 0.18 });
  const root = new THREE.Group(); root.add(sh.obj); root.rotation.set(-0.2, -0.5, 0); w.add(root);
  // centre the house on the plate, resting on the ground line
  w.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(root), c0 = bb.getCenter(new THREE.Vector3());
  root.position.set(-c0.x, -1.1 - bb.min.y, -c0.z - 0.3);
  w.updateMatrixWorld(true);
  const crabs = [], n = sh.pts.length;
  const place = (idx, scale, i, hold) => {
    const c = sh.pts[idx], th = Math.atan2(c.z, c.x);
    const out = new THREE.Vector3(Math.cos(th), 0.25, Math.sin(th)).normalize();
    const wp = sh.g.localToWorld(c.clone().add(out.clone().multiplyScalar(sh.radii[idx] * 0.85)));
    const wo = sh.g.localToWorld(c.clone().add(out)).sub(sh.g.localToWorld(c.clone())).normalize();
    const h = ctx.buildHost({ shell: false, legs: 0, claws: { hold } });
    const g = new THREE.Group(); g.add(h.obj); g.position.copy(wp); g.scale.setScalar(scale);
    g.lookAt(wp.clone().add(wo).add(new THREE.Vector3(0, 0, 0.8))); // turn toward the viewer a little
    w.add(g); crabs.push({ g, h, i, base: scale });
  };
  // windows along the whorls, plus the biggest tenant at the front door
  for (let i = 0; i < tenants - 1; i++) place(Math.floor(lerp(n * 0.5, n * 0.9, i / Math.max(1, tenants - 2))), lerp(0.42, 0.6, i / tenants), i, i % 2 ? 'none' : 'rosso');
  const door = sh.g.localToWorld(sh.pts[n - 1].clone());
  const hd = ctx.buildHost({ shell: false, legs: 3, claws: { hold: 'rosso' } });
  const gd = new THREE.Group(); gd.add(hd.obj); gd.position.copy(door).add(new THREE.Vector3(0, 0.15, 0.3)); gd.scale.setScalar(0.85); w.add(gd);
  crabs.push({ g: gd, h: hd, i: tenants, base: 0.85 });
  const apex = sh.g.localToWorld(sh.pts[0].clone());
  const flag = banner({ w: 1.0, h: 0.55, pole: 1.1, offset: [0, -0.02, 0] }, { anchors: { apex } });
  w.add(flag.obj);
  return {
    obj: w, hideHost: true,
    up: (t) => { flag.up(t); crabs.forEach(c => { c.h.up(t + c.i * 0.7); c.g.scale.setScalar(c.base * (1 + Math.max(0, Math.sin(t * 1.3 + c.i * 1.1)) * 0.1)); }); },
  };
}

// Justice: the shell carries the scales; a seed (life) weighed against an empty shell (property).
export function scales(p, ctx) {
  const { beam = 2.6, post = 0.8 } = p;
  const T = ink('toner', 0.5, 0.5), w = new THREE.Group();
  const a = ctx.anchors.apex;
  w.position.copy(a);
  w.add(limb([0, 0, 0], [0, post, 0], 0.035, T), sph(0.08, ink('fluo', 1, 0), 0, post, 0));
  const arm = new THREE.Group(); arm.position.y = post; w.add(arm);
  arm.add(limb([-beam / 2, 0, 0], [beam / 2, 0, 0], 0.03, T));
  arm.add(new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 4), T).translateY(-0.12).rotateZ(Math.PI));
  const pans = [-1, 1].map(k => {
    const g = new THREE.Group(); g.position.x = k * beam / 2; arm.add(g);
    for (let c = 0; c < 3; c++) { const a2 = c / 3 * TAU; g.add(limb([0, 0, 0], [Math.cos(a2) * 0.32, -0.75, Math.sin(a2) * 0.32], 0.006, T)); }
    const pan = new THREE.Mesh(new THREE.SphereGeometry(0.36, 32, 8, 0, TAU, Math.PI * 0.62, Math.PI * 0.38), T);
    pan.position.y = -0.47; g.add(pan);
    if (k < 0) g.add(sph(0.19, ink('rosso', 1, 0), 0, -0.58, 0));
    else { const s = spiralShell({ size: 0.28, turns: 4, growth: 0.1 }); s.obj.position.set(0, -0.72, 0); s.obj.rotation.x = -1.2; g.add(s.obj); }
    return g;
  });
  return { obj: w, up: (t) => { const r = Math.sin(t * 0.9) * 0.07; arm.rotation.z = r; pans.forEach(g => { g.rotation.z = -r; }); } };
}

// Internationale: a ring of crabs, claw to claw, dancing round the earth (Matisse's La Danse, but crabs).
export function ring(p, ctx) {
  const { n = 6, r = 1.95, globe = 0.55, speed = 0.35 } = p;
  const w = new THREE.Group(), crabs = [];
  const earth = new THREE.Group(); earth.position.y = 0.05; w.add(earth);
  earth.add(new THREE.Mesh(sculpt(`globe|${globe}`, () => blend([cone([0, -globe * 0.02, 0], [0, globe * 0.02, 0], globe)], 0.01), 0.03), ink('blu', 0.3, 0.6)));
  for (let i = 1; i < 6; i++) { const lat = (i / 6 - 0.5) * Math.PI, rr = Math.cos(lat) * globe * 1.005; const m = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.008, 6, 80), ink('toner', 0.9, 0.1)); m.rotation.x = Math.PI / 2; m.position.y = Math.sin(lat) * globe; earth.add(m); }
  for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(new THREE.TorusGeometry(globe * 1.005, 0.008, 6, 80), ink('toner', 0.9, 0.1)); m.rotation.y = i / 4 * Math.PI; earth.add(m); }
  const dance = new THREE.Group(); w.add(dance);
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU, h = ctx.buildHost({ legs: 3, claws: { hold: 'none' } });
    const g = new THREE.Group(); g.add(h.obj); g.scale.setScalar(p.scale ?? 0.48);
    g.position.set(Math.sin(a) * r, -0.75, Math.cos(a) * r); g.rotation.y = a; dance.add(g); crabs.push({ g, h, i });
  }
  return {
    obj: w, hideHost: true,
    up: (t) => {
      dance.rotation.y = t * speed; earth.rotation.y = -t * 0.2;
      crabs.forEach(c => { c.h.up(t + c.i * 0.4); c.g.position.y = -0.75 + Math.abs(Math.sin(t * 2.4 + (c.i % 2) * Math.PI / 2)) * 0.18; });
    },
  };
}

export const COLLETTIVO = { banner, tatlin, wedge, tribune, chain, commune, scales, ring };
