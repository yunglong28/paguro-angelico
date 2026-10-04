// Export every character (or the ids given) as a real 3D model: models/<id>.glb
// Runs three.js + GLTFExporter in Node; no browser needed.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './serve.mjs';

// GLTFExporter reads Blobs through FileReader, which Node lacks.
globalThis.FileReader = class {
  readAsArrayBuffer(b) { b.arrayBuffer().then(r => { this.result = r; this.onloadend?.(); }); }
  readAsDataURL(b) { b.arrayBuffer().then(r => { this.result = `data:${b.type || 'application/octet-stream'};base64,${Buffer.from(r).toString('base64')}`; this.onloadend?.(); }); }
};

const { build } = await import('../src/build.js');
const { setLook } = await import('../src/press.js');
const { GLTFExporter } = await import('../vendor/GLTFExporter.js');

const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'characters/index.json')));
const ids = process.argv.slice(2).length ? process.argv.slice(2) : index;
fs.mkdirSync(path.join(ROOT, 'models'), { recursive: true });
for (const id of ids) {
  const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'characters', `${id}.json`)));
  const ch = build(spec); ch.still(true); ch.up(2.5); ch.obj.children[0].rotation.y = 0;
  setLook(ch.obj, 'color'); ch.obj.name = spec.name;
  const buf = await new GLTFExporter().parseAsync(ch.obj, { binary: true });
  fs.writeFileSync(path.join(ROOT, 'models', `${id}.glb`), Buffer.from(buf));
  console.log(`models/${id}.glb  ${(buf.byteLength / 1024).toFixed(0)} KB`);
}
