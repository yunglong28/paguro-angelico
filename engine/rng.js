// Seeded RNG (mulberry32): same seed, same character. Pure JS, shared with Node.
export function rng(seed = 1) {
  let a = (seed >>> 0) || 1;
  const next = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { next, range: (lo, hi) => lo + next() * (hi - lo), int: (lo, hi) => Math.floor(lo + next() * (hi - lo + 1)), pick: (arr) => arr[Math.floor(next() * arr.length)] };
}
