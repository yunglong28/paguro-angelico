// Signed-distance sculpting: primitives are blended with smooth unions and polygonised
// with surface nets into one watertight mesh with gradient normals.
// Every primitive is a function (x,y,z) => distance, carrying its bounding box in .box.
import * as THREE from '../vendor/three.module.js';

const box = (f, min, max) => Object.assign(f, { box: [min, max] });

export function sphere(c, r) {
  return box((x, y, z) => Math.hypot(x - c[0], y - c[1], z - c[2]) - r,
    [c[0] - r, c[1] - r, c[2] - r], [c[0] + r, c[1] + r, c[2] + r]);
}
export function ellipsoid(c, r) {
  return box((x, y, z) => {
    const X = (x - c[0]) / r[0], Y = (y - c[1]) / r[1], Z = (z - c[2]) / r[2];
    const k0 = Math.hypot(X, Y, Z), k1 = Math.hypot(X / r[0], Y / r[1], Z / r[2]);
    return k1 < 1e-9 ? -Math.min(...r) : k0 * (k0 - 1) / k1;
  }, c.map((v, i) => v - r[i]), c.map((v, i) => v + r[i]));
}
// tapered capsule from a (radius ra) to b (radius rb)
export function cone(a, b, ra, rb = ra) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L2 = d[0] ** 2 + d[1] ** 2 + d[2] ** 2 || 1e-9, R = Math.max(ra, rb);
  return box((x, y, z) => {
    const px = x - a[0], py = y - a[1], pz = z - a[2];
    const t = Math.max(0, Math.min(1, (px * d[0] + py * d[1] + pz * d[2]) / L2));
    return Math.hypot(px - d[0] * t, py - d[1] * t, pz - d[2] * t) - (ra + (rb - ra) * t);
  }, [0, 1, 2].map(i => Math.min(a[i], b[i]) - R), [0, 1, 2].map(i => Math.max(a[i], b[i]) + R));
}
export function rbox(c, h, round = 0.02) {
  return box((x, y, z) => {
    const qx = Math.abs(x - c[0]) - h[0] + round, qy = Math.abs(y - c[1]) - h[1] + round, qz = Math.abs(z - c[2]) - h[2] + round;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - round;
  }, c.map((v, i) => v - h[i]), c.map((v, i) => v + h[i]));
}

const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
export function blend(list, k = 0.08) {
  const f = (x, y, z) => { let d = list[0](x, y, z); for (let i = 1; i < list.length; i++) d = smin(d, list[i](x, y, z), k); return d; };
  const min = [0, 1, 2].map(i => Math.min(...list.map(p => p.box[0][i])) - k);
  const max = [0, 1, 2].map(i => Math.max(...list.map(p => p.box[1][i])) + k);
  return box(f, min, max);
}
// carve b out of a with a soft edge
export function carve(a, b, k = 0.03) {
  return box((x, y, z) => -smin(-a(x, y, z), b(x, y, z), k), a.box[0], a.box[1]);
}

// Surface nets polygoniser. cell = edge length of the sampling grid.
export function mesh(f, cell = 0.03) {
  const pad = cell * 2;
  const min = f.box[0].map(v => v - pad), max = f.box[1].map(v => v + pad);
  const nx = Math.ceil((max[0] - min[0]) / cell) + 1, ny = Math.ceil((max[1] - min[1]) / cell) + 1, nz = Math.ceil((max[2] - min[2]) / cell) + 1;
  const V = new Float32Array(nx * ny * nz);
  for (let k = 0, n = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++, n++)
    V[n] = f(min[0] + i * cell, min[1] + j * cell, min[2] + k * cell);
  const at = (i, j, k) => V[i + nx * (j + ny * k)];
  const cx = nx - 1, cy = ny - 1, cz = nz - 1;
  const cellV = new Int32Array(cx * cy * cz).fill(-1);
  const ci = (i, j, k) => i + cx * (j + cy * k);
  const C = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const pos = [], v8 = new Float32Array(8);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    let neg = 0;
    for (let c = 0; c < 8; c++) { v8[c] = at(i + C[c][0], j + C[c][1], k + C[c][2]); if (v8[c] < 0) neg++; }
    if (neg === 0 || neg === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of E) {
      if ((v8[a] < 0) === (v8[b] < 0)) continue;
      const t = v8[a] / (v8[a] - v8[b]);
      sx += C[a][0] + (C[b][0] - C[a][0]) * t; sy += C[a][1] + (C[b][1] - C[a][1]) * t; sz += C[a][2] + (C[b][2] - C[a][2]) * t; n++;
    }
    cellV[ci(i, j, k)] = pos.length / 3;
    pos.push(min[0] + (i + sx / n) * cell, min[1] + (j + sy / n) * cell, min[2] + (k + sz / n) * cell);
  }
  const idx = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, d, c, a, c, b); else idx.push(a, b, c, a, c, d);
  };
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const v0 = at(i, j, k), in0 = v0 < 0;
    if (i < cx && j > 0 && k > 0 && j < cy && k < cz && in0 !== (at(i + 1, j, k) < 0))
      quad(cellV[ci(i, j - 1, k - 1)], cellV[ci(i, j, k - 1)], cellV[ci(i, j, k)], cellV[ci(i, j - 1, k)], !in0);
    if (j < cy && i > 0 && k > 0 && i < cx && k < cz && in0 !== (at(i, j + 1, k) < 0))
      quad(cellV[ci(i - 1, j, k - 1)], cellV[ci(i - 1, j, k)], cellV[ci(i, j, k)], cellV[ci(i, j, k - 1)], !in0);
    if (k < cz && i > 0 && j > 0 && i < cx && j < cy && in0 !== (at(i, j, k + 1) < 0))
      quad(cellV[ci(i - 1, j - 1, k)], cellV[ci(i, j - 1, k)], cellV[ci(i, j, k)], cellV[ci(i - 1, j, k)], !in0);
  }
  // normals from the field gradient: smooth without averaging faces
  const nor = new Float32Array(pos.length), e = cell * 0.5;
  for (let p = 0; p < pos.length; p += 3) {
    const x = pos[p], y = pos[p + 1], z = pos[p + 2];
    const gx = f(x + e, y, z) - f(x - e, y, z), gy = f(x, y + e, z) - f(x, y - e, z), gz = f(x, y, z + e) - f(x, y, z - e);
    const L = Math.hypot(gx, gy, gz) || 1;
    nor[p] = gx / L; nor[p + 1] = gy / L; nor[p + 2] = gz / L;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(idx);
  g.userData.sculpted = true; // shared through the cache below; only the cache disposes it
  return g;
}

// Memoised sculpt: same recipe key -> same geometry (characters share limbs and bodies).
// Least-recently-used, capped: dragging a slider in the studio makes a new recipe on every step.
const cache = new Map(), CAP = 400;
export function sculpt(key, make, cell) {
  let g = cache.get(key);
  if (g) { cache.delete(key); cache.set(key, g); return g; } // mark as recently used
  g = mesh(make(), cell);
  cache.set(key, g);
  if (cache.size > CAP) { const [old, og] = cache.entries().next().value; cache.delete(old); og.dispose(); }
  return g;
}
