// Brand style tokens (brand/tokens.json): one file that modulates the whole cast.
// Pure JS (no three.js): shared by the viewer, the brand style sheet and the node pipeline.
//   proportion / motion: multipliers on every spec (1 = the spec as written)
//   y2k: materials and backdrop of the Y2K look (the inks reinterpreted as 90s pre-rendered CGI)
// The defaults reproduce the renders as they were before tokens existed.

export const DEFAULT_TOKENS = {
  name: 'Time Bank Spirit',
  version: '0.1',
  axes: { kawaii: 0.5, gloss: 0.5, sky: 0.5 },
  proportion: { eyes: 1, stalk: 1, body: 1, bumps: 1, claws: 1 },
  motion: { float: 1, sway: 1 },
  y2k: {
    chrome: { roughness: 0.16, env: 1.2 },
    plastic: { roughness: 0.12, clearcoat: 1, iridescence: 0.35, sheen: 0.6 },
    gel: { glow: 0.22 },
    sky: { top: '#9fc4ff', mid: '#eef4ff', bottom: '#ffffff', horizon: 0.55 },
  },
};

// Macro dials. Each one moves several tokens at once: 0 -> `lo`, 0.5 -> DEFAULT_TOKENS, 1 -> `hi`.
export const AXES = {
  kawaii: {
    label: 'Kawaii', lo: 'Esoteric', hi: 'Toy',
    note: 'From reliquary to 90s toy: eyes grow, stalks shorten, the carapace smooths, the float bounces.',
    paths: {
      'proportion.eyes': [0.8, 1.55], 'proportion.stalk': [1.35, 0.45], 'proportion.body': [0.95, 1.12],
      'proportion.bumps': [1.6, 0.15], 'proportion.claws': [1.1, 0.8], 'motion.float': [0.6, 1.8], 'motion.sway': [0.7, 1.4],
    },
  },
  gloss: {
    label: 'Gloss', lo: 'Vinyl', hi: 'Chrome',
    note: 'From a matte vinyl figure to pre-rendered chrome, candy plastic and glowing gel.',
    paths: {
      'y2k.chrome.roughness': [0.5, 0.03], 'y2k.chrome.env': [0.7, 1.7], 'y2k.plastic.roughness': [0.55, 0.03],
      'y2k.plastic.clearcoat': [0.15, 1], 'y2k.plastic.iridescence': [0, 0.85], 'y2k.plastic.sheen': [0.1, 1], 'y2k.gel.glow': [0.04, 0.42],
    },
  },
  sky: {
    label: 'Sky', lo: 'Paper', hi: 'Box art',
    note: 'From the paper plate to the cold gradient of PS1 and N64 box art.',
    paths: {
      'y2k.sky.top': ['#f4f4f2', '#3f73ff'], 'y2k.sky.mid': ['#f4f4f2', '#cfe0ff'],
      'y2k.sky.bottom': ['#f4f4f2', '#ffffff'], 'y2k.sky.horizon': [0.5, 0.64],
    },
  },
};

const get = (o, p) => p.split('.').reduce((a, k) => a?.[k], o);
const set = (o, p, v) => { const ks = p.split('.'), last = ks.pop(); ks.reduce((a, k) => (a[k] ||= {}), o)[last] = v; };
const hex = (s) => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16));
const toHex = (c) => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
const lerp = (a, b, t) => typeof a === 'string' ? toHex(hex(a).map((v, i) => v + (hex(b)[i] - v) * t)) : +(a + (b - a) * t).toFixed(3);

// tokens with every value filled in (missing keys fall back to the defaults)
export function withDefaults(t = {}) {
  const out = JSON.parse(JSON.stringify(DEFAULT_TOKENS));
  (function fill(dst, src) {
    for (const [k, v] of Object.entries(src || {})) {
      if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object') fill(dst[k], v); else dst[k] = v;
    }
  })(out, t);
  return out;
}

// Turn one dial: returns new tokens with that axis' paths moved to position v (0..1).
export function setAxis(tokens, axis, v) {
  const out = withDefaults(tokens);
  out.axes[axis] = v;
  for (const [p, [lo, hi]] of Object.entries(AXES[axis].paths)) {
    const mid = get(DEFAULT_TOKENS, p);
    set(out, p, v < 0.5 ? lerp(lo, mid, v / 0.5) : lerp(mid, hi, (v - 0.5) / 0.5));
  }
  return out;
}

// spec + tokens -> the spec as the brand currently draws it
export function applyStyle(spec, tokens) {
  const t = withDefaults(tokens), P = t.proportion, M = t.motion;
  const s = JSON.parse(JSON.stringify(spec));
  const h = s.host ||= {};
  h.eyes = { ...h.eyes, size: (h.eyes?.size ?? 1) * P.eyes, stalk: (h.eyes?.stalk ?? 0.55) * P.stalk };
  h.body = { ...h.body, size: (h.body?.size ?? 1) * P.body, bumps: Math.round((h.body?.bumps ?? 9) * P.bumps) };
  h.claws = { ...h.claws, size: (h.claws?.size ?? 1) * P.claws };
  s.pose = { ...s.pose, float: (s.pose?.float ?? 0) * M.float, sway: (s.pose?.sway ?? 0.3) * M.sway };
  return s;
}
