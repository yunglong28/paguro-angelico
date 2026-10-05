// Materials and stages.
// Parts paint with ink(name, base, shade): a role (see engine/palette.js) plus how much of it.
// setLook(obj, look, palette) swaps every ink for a real material of the character's palette:
//   studio  physical materials with the palette's finishes, paper backdrop
//   y2k     the same, glossier, on the box-art sky (90s pre-rendered CGI)
//   toon    cel-shaded, three tones
//   print   the scene goes to an offscreen separation buffer (R toner, G spot fluo/rosso, B blu)
//           and a press pass screens toner at 15° and blu at 75°; each role prints with its palette ink
import * as THREE from '../vendor/three.module.js';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';
import { CLASSIC, withPalette, roleOf, mixHex } from './palette.js';

export const PALETTE = {
  paper: [0.957, 0.957, 0.949],
  toner: [0.078, 0.078, 0.063],
  blu:   [0.0, 0.118, 0.969],
  fluo:  [0.91, 1.0, 0.0],
  rosso: [0.89, 0.13, 0.1],
};
export const LOOKS = ['studio', 'y2k', 'toon', 'print'];
export const normLook = (l) => (l === 'color' ? 'studio' : LOOKS.includes(l) ? l : 'studio');

// Stage settings shared by every character (brand/brand.json "stage")
export const DEFAULT_STAGE = { sky: { top: '#9fc4ff', mid: '#eef4ff', bottom: '#ffffff', horizon: 0.55 }, paper: '#f4f4f2', gloss: 0.6 };
let STAGE = DEFAULT_STAGE, stageRev = 0;
export function setStage(s = {}) {
  STAGE = { ...DEFAULT_STAGE, ...s, sky: { ...DEFAULT_STAGE.sky, ...(s.sky || {}) } };
  stageRev++; matCache.forEach(m => m.dispose()); matCache.clear();
}

// ---------- ink: the tag every part paints with (and its print material) ----------
const VS = `varying vec3 vN;
void main(){ vN = normalize(normalMatrix*normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
const FS = `uniform vec3 ch; uniform float base; uniform float shade; varying vec3 vN;
void main(){
  vec3 n = normalize(gl_FrontFacing ? vN : -vN);
  float l = max(dot(n, normalize(vec3(-.45,.75,.55))), 0.);
  float rim = pow(1. - abs(n.z), 3.) * .25;
  float c = clamp(base + shade*(1.-l) + rim*shade, 0., 1.);
  gl_FragColor = vec4(ch*c, 1.);
}`;
// separation channels: R toner, B blu, G flat spot inks (1 = fluo, 0.5 = rosso)
const CH = { toner: [1, 0, 0], fluo: [0, 1, 0], rosso: [0, 0.5, 0], blu: [0, 0, 1], paper: [0, 0, 0] };
const SPOT = new Set(['fluo', 'rosso']);
function printMat(inkName, base, shade) {
  // a spot ink is flat; a screened ink keeps the part's coverage
  const flat = SPOT.has(inkName);
  return new THREE.ShaderMaterial({
    vertexShader: VS, fragmentShader: FS, side: THREE.DoubleSide,
    uniforms: { ch: { value: new THREE.Vector3(...CH[inkName]) }, base: { value: flat ? 1 : base }, shade: { value: flat ? 0 : shade } },
  });
}
const tagCache = new Map();
// ink('toner', base, shade): base = minimum coverage, shade = extra coverage in shadow.
export function ink(name, base = 0.3, shade = 0.7) {
  const key = `${name}|${base}|${shade}`;
  if (tagCache.has(key)) return tagCache.get(key);
  const m = printMat(name, base, shade);
  m.userData.ink = { name, base, shade, role: roleOf(name, base) };
  tagCache.set(key, m);
  return m;
}

// ---------- materials from a palette ----------
const matCache = new Map();
const srgb = (hex) => new THREE.Color().setStyle(hex, THREE.SRGBColorSpace);
let toonRamp = null;
function ramp() {
  if (toonRamp) return toonRamp;
  toonRamp = new THREE.DataTexture(new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]), 3, 1);
  toonRamp.minFilter = toonRamp.magFilter = THREE.NearestFilter; toonRamp.needsUpdate = true;
  return toonRamp;
}
// coverage → how much of the role colour (light parts of a role read paler, as on the press)
function tint(k, P) {
  const R = P[k.role];
  if (k.role === 'primary' || k.role === 'dark') {
    const amt = Math.min(1, (k.role === 'primary' ? 0.6 : 0.35) + k.base + k.shade * 0.35);
    return mixHex(P.light.color, R.color, amt);
  }
  return R.color;
}
export function finishMaterial(hex, finish, look = 'studio') {
  const c = srgb(hex), gl = look === 'y2k' ? 1 - STAGE.gloss * 0.6 : 1; // y2k: glossier
  const side = THREE.DoubleSide;
  if (look === 'toon') return new THREE.MeshToonMaterial({ color: c, gradientMap: ramp(), side, emissive: finish === 'gel' ? c.clone().multiplyScalar(0.25) : 0x000000 });
  const M = (o) => new THREE.MeshPhysicalMaterial({ color: c, side, envMapIntensity: look === 'y2k' ? 1.25 : 0.9, ...o });
  switch (finish) {
    case 'matte': return M({ roughness: 0.82 * gl, clearcoat: 0 });
    case 'chrome': return M({ metalness: 1, roughness: 0.14 * gl, envMapIntensity: 1.3 });
    case 'metal': return M({ metalness: 1, roughness: 0.42 * gl });
    case 'candy': return M({ roughness: 0.12 * gl, clearcoat: 1, clearcoatRoughness: 0.05, sheen: 0.5, sheenColor: srgb('#dfe9ff') });
    case 'gel': return M({ roughness: 0.1 * gl, clearcoat: 1, clearcoatRoughness: 0.05, emissive: c.clone().multiplyScalar(0.22) });
    case 'iridescent': return M({ roughness: 0.16 * gl, clearcoat: 1, iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [200, 600] });
    case 'pearl': return M({ roughness: 0.3 * gl, clearcoat: 0.7, sheen: 1, sheenColor: srgb('#ffffff'), iridescence: 0.3 });
    default: return M({ roughness: 0.38 * gl, clearcoat: 0.35, clearcoatRoughness: 0.4 }); // plastic
  }
}
// Cached by what the material actually is (look + finish + final colour, or print ink + coverage),
// least-recently-used and capped, because live colour editing creates a new colour every frame.
const MAT_CAP = 600;
export function materialFor(m, look, palette) {
  const k = m.userData.ink; if (!k) return m;
  const P = palette || withPalette(CLASSIC), R = P[k.role];
  const hex = look === 'print' ? '' : tint(k, P);
  const key = look === 'print' ? `print|${R.print}|${k.base}|${k.shade}` : `${look}|${R.finish}|${hex}`;
  let mat = matCache.get(key);
  if (mat) { matCache.delete(key); matCache.set(key, mat); return mat; }
  mat = look === 'print' ? printMat(R.print, k.base, k.shade) : finishMaterial(hex, R.finish, look);
  mat.name = k.role;
  matCache.set(key, mat);
  if (matCache.size > MAT_CAP) { const [old, om] = matCache.entries().next().value; matCache.delete(old); om.dispose(); }
  return mat;
}
// kept for older callers
export const colorOf = (m, look = 'studio', palette) => materialFor(m, normLook(look), palette);

// Swap every ink in a subtree to the look, with the palette stored on the character (or the one given).
export function setLook(obj, look, palette) {
  look = normLook(look);
  const P = withPalette(palette || obj.userData.palette);
  obj.traverse(o => {
    if (o.userData.ground) { o.visible = look !== 'print'; return; }
    if (o.userData.helper || !o.isMesh) return;
    o.castShadow = o.receiveShadow = look !== 'print';
    o.userData.inkMat ||= o.material;
    o.material = materialFor(o.userData.inkMat, look, P);
  });
}

// ---------- the stage ----------
const PRESS_FS = `uniform sampler2D tex; uniform vec2 res; uniform float pitch; uniform vec2 slip;
uniform vec3 cPaper, cToner, cBlu, cFluo, cRosso;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float dotAt(vec2 p, float ang, int chn){
  float c = cos(ang), s = sin(ang); mat2 R = mat2(c,-s,s,c), Ri = mat2(c,s,-s,c);
  vec2 q = R*p; vec2 cell = (floor(q/pitch)+.5)*pitch; vec2 ctr = Ri*cell;
  vec4 t = texture2D(tex, clamp(ctr/res, 0., 1.));
  float cov = chn==0 ? t.r : t.b;
  cov = cov < .02 ? 0. : clamp(cov*1.12 + (h(cell)-.5)*.08, 0., 1.);
  float r = pitch*sqrt(cov/3.14159)*1.18;
  return 1. - smoothstep(r-.7, r+.7, length(q-cell));
}
void main(){
  vec2 p = gl_FragCoord.xy;
  vec3 col = cPaper;
  float spot = texture2D(tex, p/res).g;
  if (spot > .75) col = cFluo; else if (spot > .3) col = cRosso;
  col = mix(col, cBlu, step(.9993, h(floor(p/1.5)))*.35);
  col = mix(col, cToner, dotAt(p, radians(15.), 0));
  col = mix(col, cBlu, dotAt(p + slip, radians(75.), 1));
  gl_FragColor = vec4(col, 1.);
}`;

export function createStage(canvas, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !!opts.antialias, preserveDrawingBuffer: !!opts.preserve });
  renderer.autoClear = false;
  const scene = new THREE.Scene();
  renderer.toneMapping = THREE.NoToneMapping; // keep colours exact
  renderer.shadowMap.enabled = !opts.noShadow; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = opts.noEnv ? null : pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a80, 0.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.9); sun.position.set(-3, 6, 4);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.radius = 6; sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
  Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.5, far: 20 });
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  const rt = new THREE.WebGLRenderTarget(2, 2);
  const v3 = (a) => new THREE.Vector3(...a);
  const press = new THREE.ShaderMaterial({
    uniforms: {
      tex: { value: rt.texture }, res: { value: new THREE.Vector2(1, 1) }, pitch: { value: 6 },
      slip: { value: new THREE.Vector2(2.5, -2) },
      cPaper: { value: v3(PALETTE.paper) }, cToner: { value: v3(PALETTE.toner) },
      cBlu: { value: v3(PALETTE.blu) }, cFluo: { value: v3(PALETTE.fluo) }, cRosso: { value: v3(PALETTE.rosso) },
    },
    vertexShader: `void main(){ gl_Position = vec4(position.xy, 0., 1.); }`,
    fragmentShader: PRESS_FS, depthTest: false, depthWrite: false,
  });
  const quad = new THREE.Scene();
  quad.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), press));
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const size = { w: 1, h: 1, dpr: 1 };

  function resize(w, h, dpr = Math.min(devicePixelRatio || 1, 2)) {
    Object.assign(size, { w, h, dpr });
    renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
    const W = Math.floor(w * dpr), H = Math.floor(h * dpr);
    rt.setSize(W, H); press.uniforms.res.value.set(W, H);
    press.uniforms.pitch.value = (opts.pitch || 5.2) * dpr;
    press.uniforms.slip.value.set(2.5 * dpr / 1.5, -2 * dpr / 1.5);
  }

  // backdrops: paper, or the box-art sky (repainted when the stage settings change)
  const bgCanvas = document.createElement('canvas'); bgCanvas.width = 2; bgCanvas.height = 256;
  const bgTex = new THREE.CanvasTexture(bgCanvas); bgTex.colorSpace = THREE.SRGBColorSpace;
  let bgRev = -1;
  function paintSky() {
    const g = bgCanvas.getContext('2d'), L = g.createLinearGradient(0, 0, 0, 256), k = STAGE.sky;
    L.addColorStop(0, k.top); L.addColorStop(k.horizon, k.mid); L.addColorStop(1, k.bottom); g.fillStyle = L; g.fillRect(0, 0, 2, 256);
    bgTex.needsUpdate = true; bgRev = stageRev;
  }
  const bgQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: bgTex, depthTest: false, depthWrite: false }));
  const bgScene = new THREE.Scene(); bgScene.add(bgQuad);

  // views: [{x,y,w,h (0..1, origin bottom-left), yaw, tilt, dist, lift, fit, before()}]
  function place(v, vw, vh) {
    camera.aspect = vw / vh;
    const d = v.dist * (v.fit && camera.aspect < 0.8 ? 0.8 / Math.max(camera.aspect, 0.45) : 1);
    camera.position.set(Math.sin(v.yaw) * Math.cos(v.tilt) * d, Math.sin(v.tilt) * d + (v.lift || 0), Math.cos(v.yaw) * Math.cos(v.tilt) * d);
    camera.lookAt(0, v.lift || 0, 0); camera.updateProjectionMatrix();
  }
  function render(views, look = 'studio') {
    look = normLook(look);
    scene.environment = look === 'print' ? null : env;
    if (look !== 'print') {
      renderer.setRenderTarget(null); renderer.setScissorTest(false);
      renderer.setClearColor(srgb(STAGE.paper), 1); renderer.clear();
      if (look === 'y2k') { if (bgRev !== stageRev) paintSky(); renderer.render(bgScene, quadCam); renderer.clearDepth(); }
      renderer.setScissorTest(true);
      for (const v of views) {
        const vx = v.x * size.w, vy = v.y * size.h, vw = v.w * size.w, vh = v.h * size.h;
        renderer.setViewport(vx, vy, vw, vh); renderer.setScissor(vx, vy, vw, vh);
        v.before && v.before(); place(v, vw, vh); renderer.render(scene, camera);
      }
      renderer.setScissorTest(false); renderer.setViewport(0, 0, size.w, size.h);
      return;
    }
    const W = rt.width, H = rt.height;
    rt.viewport.set(0, 0, W, H); rt.scissorTest = false;
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 1); renderer.clear();
    for (const v of views) {
      const vx = Math.round(v.x * W), vy = Math.round(v.y * H), vw = Math.round(v.w * W), vh = Math.round(v.h * H);
      rt.viewport.set(vx, vy, vw, vh); rt.scissor.set(vx, vy, vw, vh); rt.scissorTest = true;
      renderer.setRenderTarget(rt);
      v.before && v.before(); place(v, vw, vh);
      renderer.render(scene, camera);
    }
    rt.scissorTest = false;
    renderer.setRenderTarget(null);
    renderer.render(quad, quadCam);
  }

  return { THREE, renderer, scene, camera, resize, render, size };
}
