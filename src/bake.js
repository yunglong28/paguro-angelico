// Bake a character's procedural motion (up(t)) into a glTF animation clip:
// every node that moves gets position / quaternion / scale keyframes, so the exported
// .glb plays its idle loop in Blender, game engines or any glTF viewer.
import * as THREE from '../vendor/three.module.js';

export function bakeIdle(ch, { seconds = 8, fps = 15, name = 'idle' } = {}) {
  const nodes = [];
  ch.obj.traverse(o => { if (o !== ch.obj && !o.userData.ground) nodes.push(o); });
  nodes.forEach((o, i) => { if (!o.name) o.name = `n${i}`; });
  const n = Math.round(seconds * fps), times = new Float32Array(n + 1);
  const P = nodes.map(() => new Float32Array((n + 1) * 3)), Qs = nodes.map(() => new Float32Array((n + 1) * 4)), S = nodes.map(() => new Float32Array((n + 1) * 3));
  for (let f = 0; f <= n; f++) {
    const t = f / fps; times[f] = t; ch.up(t);
    nodes.forEach((o, i) => { o.position.toArray(P[i], f * 3); o.quaternion.toArray(Qs[i], f * 4); o.scale.toArray(S[i], f * 3); });
  }
  const moves = (arr, k) => { for (let f = 1; f <= n; f++) for (let c = 0; c < k; c++) if (Math.abs(arr[f * k + c] - arr[c]) > 1e-4) return true; return false; };
  const tracks = [];
  nodes.forEach((o, i) => {
    if (moves(P[i], 3)) tracks.push(new THREE.VectorKeyframeTrack(`${o.name}.position`, times, P[i]));
    if (moves(Qs[i], 4)) tracks.push(new THREE.QuaternionKeyframeTrack(`${o.name}.quaternion`, times, Qs[i]));
    if (moves(S[i], 3)) tracks.push(new THREE.VectorKeyframeTrack(`${o.name}.scale`, times, S[i]));
  });
  ch.up(2.5);
  return new THREE.AnimationClip(name, seconds, tracks);
}
