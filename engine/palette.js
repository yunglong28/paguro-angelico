// Colour: per-character palettes of six roles, each a colour + a finish, generated in OKLCH.
// Pure JS (no three.js): shared by the studio, the generators and the node pipeline.
//
// Parts never name colours. They paint with a role through ink(name, base, shade) (engine/press.js):
//   blu → primary (body), toner → dark (shell, metal) or line (pupils, mouths, rims: base ≥ 0.8),
//   fluo → accent, rosso → secondary, paper → light (eye whites).
// `print` is the press ink a role is screened with in the Print look.

export const ROLES = ['primary', 'dark', 'line', 'accent', 'secondary', 'light'];
export const ROLE_LABEL = { primary: 'Primary · body', dark: 'Shell · metal', line: 'Line · pupils', accent: 'Accent · glow', secondary: 'Secondary', light: 'Light · eye whites' };
export const FINISHES = ['matte', 'plastic', 'candy', 'chrome', 'metal', 'gel', 'iridescent', 'pearl'];
export const PRINT_INKS = ['toner', 'blu', 'fluo', 'rosso', 'paper'];
export const INK_HEX = { toner: '#141410', blu: '#001ef7', fluo: '#e8ff00', rosso: '#e3211a', paper: '#f4f4f2' };

// which role an ink() call paints with
export function roleOf(name, base = 0) {
  if (name === 'toner') return base >= 0.8 ? 'line' : 'dark';
  return { blu: 'primary', fluo: 'accent', rosso: 'secondary', paper: 'light' }[name] || 'primary';
}

// ---------- OKLab / OKLCH (Björn Ottosson) ----------
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGam = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
export function hexToRgb(h) { return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255); }
export function rgbToHex(c) { return '#' + c.map(v => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join(''); }
export function rgbToOklab([r, g, b]) {
  [r, g, b] = [r, g, b].map(toLin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
export function oklabToRgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map(toGam);
}
const inGamut = (c) => c.every(v => v >= -0.001 && v <= 1.001);
// OKLCH (L 0..1, C 0..0.37, h degrees) -> hex, reducing chroma until it fits sRGB
export function oklch(L, C, h) {
  const r = h * Math.PI / 180;
  for (let c = C; c >= 0; c -= 0.005) { const rgb = oklabToRgb([L, c * Math.cos(r), c * Math.sin(r)]); if (inGamut(rgb)) return rgbToHex(rgb); }
  return rgbToHex(oklabToRgb([L, 0, 0]));
}
// the lightest colour at or below Lmax that still holds chroma C at hue h (vivid accents in every hue)
// (searches a little darker first, then gives up chroma rather than going muddy)
export function vivid(Lmax, C, h) {
  const r = h * Math.PI / 180;
  for (let L = Lmax; L >= Lmax - 0.14; L -= 0.01) { const rgb = oklabToRgb([L, C * Math.cos(r), C * Math.sin(r)]); if (inGamut(rgb)) return rgbToHex(rgb); }
  return oklch(Lmax - 0.07, C, h);
}
export function toOklch(hex) { const [L, a, b] = rgbToOklab(hexToRgb(hex)); return [L, Math.hypot(a, b), (Math.atan2(b, a) * 180 / Math.PI + 360) % 360]; }
export function mixHex(a, b, t) { const A = rgbToOklab(hexToRgb(a)), B = rgbToOklab(hexToRgb(b)); return rgbToHex(oklabToRgb(A.map((v, i) => v + (B[i] - v) * t))); }
export const labDist = (a, b) => { const A = rgbToOklab(hexToRgb(a)), B = rgbToOklab(hexToRgb(b)); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
export const nearestInk = (hex, from = PRINT_INKS) => from.reduce((best, k) => (labDist(hex, INK_HEX[k]) < labDist(hex, INK_HEX[best]) ? k : best), from[0]);

// ---------- palettes ----------
// The five-ink look the project started from, as a palette.
export const CLASSIC = {
  primary: { color: '#3d5cff', finish: 'candy', print: 'blu' },
  dark: { color: '#c7ccdb', finish: 'chrome', print: 'toner' },
  line: { color: '#141410', finish: 'plastic', print: 'toner' },
  accent: { color: '#e8ff00', finish: 'gel', print: 'fluo' },
  secondary: { color: '#e3211a', finish: 'gel', print: 'rosso' },
  light: { color: '#ffffff', finish: 'candy', print: 'paper' },
};
export function withPalette(p) {
  const out = {};
  for (const r of ROLES) out[r] = { ...CLASSIC[r], ...(p?.[r] || {}) };
  return out;
}

// Harmony schemes: hue offsets (degrees) for primary, secondary, accent.
export const SCHEMES = {
  analogous: [0, 30, -35], complementary: [0, 180, 20], split: [0, 150, 210], triadic: [0, 120, 240],
  tetradic: [0, 90, 180], monochrome: [0, 0, 0],
};
// Styles: lightness / chroma per role, and the finishes that go with them.
export const STYLES = {
  candy: { L: [0.62, 0.66, 0.85], C: [0.22, 0.2, 0.2], dark: [0.82, 0.02], finish: ['candy', 'chrome', 'gel'] },
  pastel: { L: [0.82, 0.86, 0.93], C: [0.09, 0.08, 0.12], dark: [0.55, 0.04], finish: ['pearl', 'plastic', 'candy'] },
  neon: { L: [0.7, 0.72, 0.92], C: [0.3, 0.28, 0.24], dark: [0.25, 0.02], finish: ['gel', 'metal', 'gel'] },
  earth: { L: [0.55, 0.62, 0.78], C: [0.08, 0.1, 0.12], dark: [0.35, 0.03], finish: ['matte', 'matte', 'plastic'] },
  noir: { L: [0.35, 0.5, 0.85], C: [0.06, 0.12, 0.2], dark: [0.2, 0.01], finish: ['metal', 'chrome', 'gel'] },
};
// harmony(hue, scheme, style) -> palette
export function harmony(hue = 260, scheme = 'triadic', style = 'candy') {
  const S = STYLES[style] || STYLES.candy, off = SCHEMES[scheme] || SCHEMES.triadic;
  const hs = off.map(o => (hue + o + 360) % 360);
  const mono = scheme === 'monochrome';
  const primary = vivid(S.L[0], S.C[0], hs[0]);
  const secondary = vivid(mono ? S.L[0] - 0.18 : S.L[1], S.C[1], hs[1]);
  const accent = vivid(S.L[2], S.C[2], hs[2]);
  const p = {
    primary: { color: primary, finish: S.finish[0] },
    dark: { color: oklch(S.dark[0], S.dark[1], hs[0]), finish: S.finish[1] },
    line: { color: oklch(0.18, 0.02, hs[0]), finish: 'plastic' },
    accent: { color: accent, finish: S.finish[2] },
    secondary: { color: secondary, finish: S.finish[0] },
    light: { color: oklch(0.97, 0.01, hs[0]), finish: 'candy' },
  };
  // print: chromatic roles go to the nearest chromatic ink, the rest keep their role ink
  for (const r of ['primary', 'accent', 'secondary']) p[r].print = nearestInk(p[r].color, ['blu', 'fluo', 'rosso']);
  p.dark.print = 'toner'; p.line.print = 'toner'; p.light.print = 'paper';
  return p;
}
