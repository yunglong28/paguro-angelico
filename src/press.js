// Print stage: the scene is rendered into an offscreen "separation" buffer
// (R = toner coverage, G = fluo flat ink, B = blu coverage), then a press pass
// screens it as toner at 15° and blu at 75° slightly off register on cold paper.
import * as THREE from '../vendor/three.module.js';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';

export const PALETTE = {
  paper: [0.957, 0.957, 0.949],
  toner: [0.078, 0.078, 0.063],
  blu:   [0.0, 0.118, 0.969],
  fluo:  [0.91, 1.0, 0.0],
  rosso: [0.89, 0.13, 0.1],   // constructivist red, spot ink of the Collettivo series
};

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
const cache = new Map();
// ink('toner', base, shade): base = minimum coverage, shade = extra coverage in shadow.
export function ink(name, base = 0.3, shade = 0.7) {
  const key = `${name}|${base}|${shade}`;
  if (cache.has(key)) return cache.get(key);
  const m = new THREE.ShaderMaterial({
    vertexShader: VS, fragmentShader: FS, side: THREE.DoubleSide,
    uniforms: { ch: { value: new THREE.Vector3(...CH[name]) }, base: { value: base }, shade: { value: shade } },
  });
  m.userData.ink = { name, base, shade };
  cache.set(key, m);
  return m;
}

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

// Lit, full-colour stand-in for an ink material: the same coverage, as a real 3D surface colour.
const colorCache = new Map();
const srgb = (a) => new THREE.Color().setRGB(a[0], a[1], a[2], THREE.SRGBColorSpace);
export function colorOf(m) {
  const k = m.userData.ink; if (!k) return m;
  const key = `${k.name}|${k.base}|${k.shade}`;
  if (colorCache.has(key)) return colorCache.get(key);
  const paper = srgb(PALETTE.paper);
  const spot = k.name === 'fluo' || k.name === 'rosso';
  const c = k.name === 'paper' ? paper : spot ? srgb(PALETTE[k.name])
    : paper.clone().lerp(srgb(PALETTE[k.name]), Math.min(1, (k.name === 'blu' ? 0.6 : 0.35) + k.base + k.shade * 0.35));
  const mat = new THREE.MeshPhysicalMaterial({ color: c, roughness: spot ? 0.3 : k.name === 'paper' ? 0.15 : 0.5, metalness: k.name === 'fluo' ? 0.3 : 0,
    clearcoat: k.name === 'paper' ? 0.6 : 0.25, clearcoatRoughness: 0.4, envMapIntensity: 0.55,
    emissive: k.name === 'fluo' ? srgb(PALETTE.fluo).multiplyScalar(0.18) : 0x000000, side: THREE.DoubleSide });
  mat.name = k.name;
  colorCache.set(key, mat); return mat;
}
// Swap every ink material in a subtree to colour (or back).
export function setLook(obj, look) {
  obj.traverse(o => {
    if (o.userData.ground) { o.visible = look === 'color'; return; }
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = look === 'color';
    o.userData.inkMat ||= o.material;
    o.material = look === 'color' ? colorOf(o.userData.inkMat) : o.userData.inkMat;
  });
}

export function createStage(canvas, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: !!opts.preserve });
  renderer.autoClear = false;
  const scene = new THREE.Scene();
  // lights only affect the colour look; ink shaders compute their own shading
  renderer.toneMapping = THREE.NoToneMapping; // keep the inks exact (ACES washes blu out)
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

  // views: [{x,y,w,h (0..1, origin bottom-left), yaw, tilt, dist, before()}]
  const paperColor = srgb(PALETTE.paper);
  function place(v, vw, vh) {
    camera.aspect = vw / vh;
    const d = v.dist * (v.fit && camera.aspect < 0.8 ? 0.8 / Math.max(camera.aspect, 0.45) : 1);
    camera.position.set(Math.sin(v.yaw) * Math.cos(v.tilt) * d, Math.sin(v.tilt) * d + (v.lift || 0), Math.cos(v.yaw) * Math.cos(v.tilt) * d);
    camera.lookAt(0, v.lift || 0, 0); camera.updateProjectionMatrix();
  }
  // look: 'print' (halftone press) or 'color' (lit 3D straight to screen)
  function render(views, look = 'print') {
    scene.environment = look === 'color' ? env : null;
    if (look === 'color') {
      renderer.setRenderTarget(null); renderer.setScissorTest(false);
      renderer.setClearColor(paperColor, 1); renderer.clear();
      renderer.setScissorTest(true);
      for (const v of views) {
        const vx = v.x * size.w, vy = v.y * size.h, vw = v.w * size.w, vh = v.h * size.h;
        renderer.setViewport(vx, vy, vw, vh); renderer.setScissor(vx, vy, vw, vh);
        v.before && v.before(); place(v, vw, vh); renderer.render(scene, camera);
      }
      renderer.setScissorTest(false); renderer.setViewport(0, 0, size.w, size.h);
      return;
    }
    renderer.setClearColor(0x000000, 1);
    const W = rt.width, H = rt.height;
    // viewport/scissor live on the target itself so they stay in buffer pixels
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
