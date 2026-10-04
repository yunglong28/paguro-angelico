// Pure JS (no three.js): shared by the viewer and the node pipeline.

export function rng(seed = 1) {
  let a = (seed >>> 0) || 1;
  const next = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { next, range: (lo, hi) => lo + next() * (hi - lo), int: (lo, hi) => Math.floor(lo + next() * (hi - lo + 1)), pick: (arr) => arr[Math.floor(next() * arr.length)] };
}

// Legal range per parameter name. Anything not listed is left alone.
export const RANGES = {
  turns: [3.5, 6], growth: [0.075, 0.14], knobs: [0, 0.7], ribs: [0, 1], tilt: [-0.7, -0.1],
  stalk: [0.35, 0.85], count: [1, 12], legs: [0, 5],
  pairs: [1, 4], feathers: [4, 11], len: [0.8, 1.8], spread: [0.8, 1.4], flap: [0.05, 0.3],
  r: [0.4, 1.8], punch: [16, 64], rays: [0, 64], r0: [1.2, 1.8], step: [0.2, 0.45], speed: [0.4, 1.8],
  aspect: [1.3, 1.9], points: [4, 9], arches: [0, 4], leaves: [2, 9], buds: [0, 3], curl: [0, 0.8],
  gap: [1.7, 2.5], strata: [3, 11], size: [0.7, 1.4], float: [0, 0.2], sway: [0, 0.5],
};
const INTS = new Set(['count', 'legs', 'pairs', 'feathers', 'punch', 'rays', 'points', 'arches', 'leaves', 'buds', 'strata', 'eyes', 'rings']);
const EXPRESSIONS = ['quiete', 'estasi', 'stupore', 'ira', 'pieta', 'sonno'];

// Attributes that can be grafted onto a character during mutation.
export const GRAFTS = [
  { type: 'halo', r: 0.7, y: 0.75, z: -0.85, punch: 36, rays: 0 },
  { type: 'halo', r: 0.55, y: 0.95, z: -0.7, punch: 28, rays: 24 },
  { type: 'wings', pairs: 1, feathers: 7, len: 1.2, eyes: 1 },
  { type: 'crown', on: 'apex', points: 6 },
  { type: 'mandrake', leaves: 5, buds: 2 },
  { type: 'eyecloud', count: 8, r: 2.1 },
  { type: 'seeds', count: 6 },
  { type: 'roots', count: 5, len: 1 },
];

function jitter(obj, R, amt) {
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'type' || k === 'id') continue;
    if (v && typeof v === 'object' && !Array.isArray(v)) { jitter(v, R, amt); continue; }
    if (typeof v !== 'number' || !RANGES[k]) continue;
    const [lo, hi] = RANGES[k];
    let n = v + R.range(-1, 1) * amt * (hi - lo);
    n = Math.min(hi, Math.max(lo, n));
    obj[k] = INTS.has(k) ? Math.round(n) : +n.toFixed(3);
  }
}

// mutate(spec, seed, amount 0..1) -> a new spec that remembers where it came from.
export function mutate(spec, seed, amount = 0.55) {
  const R = rng(seed * 7919 + 13);
  const out = JSON.parse(JSON.stringify(spec));
  jitter(out.host || {}, R, amount);
  (out.parts || []).forEach(p => jitter(p, R, amount));
  jitter(out.pose || {}, R, amount * 0.5);
  if (R.next() < amount * 0.6) out.expression = R.pick(EXPRESSIONS);
  if (R.next() < amount * 0.5) {
    const g = JSON.parse(JSON.stringify(R.pick(GRAFTS)));
    if (!out.parts.some(p => p.type === g.type)) out.parts.push(g);
  }
  if (out.parts.length > 2 && R.next() < amount * 0.25) {
    const i = R.int(0, out.parts.length - 1);
    if (!['double', 'monstrance'].includes(out.parts[i].type)) out.parts.splice(i, 1);
  }
  out.id = `${spec.id}-s${seed}`;
  out.name = `${spec.name} · ${seed}`;
  out.parent = spec.id;
  out.seed = seed;
  return out;
}
