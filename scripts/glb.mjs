// Export every character (or the ids given) as a real 3D model with its idle animation: output/models/<id>.glb
// Runs three.js + GLTFExporter in Node; no browser needed.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './serve.mjs';
import { specFile, ids as allIds } from './manifest.mjs';

// GLTFExporter reads Blobs through FileReader, which Node lacks.
globalThis.FileReader = class {
  readAsArrayBuffer(b) { b.arrayBuffer().then(r => { this.result = r; this.onloadend?.(); }); }
  readAsDataURL(b) { b.arrayBuffer().then(r => { this.result = `data:${b.type || 'application/octet-stream'};base64,${Buffer.from(r).toString('base64')}`; this.onloadend?.(); }); }
};

const { build } = await import('../engine/build.js');
const { setLook } = await import('../engine/press.js');
const { GLTFExporter } = await import('../vendor/GLTFExporter.js');
const { bakeIdle } = await import('../engine/bake.js');
const { applyStyle } = await import('../engine/style.js');
const tokens = JSON.parse(fs.readFileSync(path.join(ROOT, 'brand/tokens.json')));

const ids = process.argv.slice(2).length ? process.argv.slice(2) : allIds();
const OUT = path.join(ROOT, 'output', 'models');
fs.mkdirSync(OUT, { recursive: true });
for (const id of ids) {
  const spec = JSON.parse(fs.readFileSync(specFile(id)));
  const ch = build(applyStyle(spec, tokens)); ch.still(true);
  setLook(ch.obj, 'color'); ch.obj.name = spec.name;
  const clip = bakeIdle(ch);   // the idle loop travels with the model
  const buf = await new GLTFExporter().parseAsync(ch.obj, { binary: true, animations: [clip] });
  fs.writeFileSync(path.join(OUT, `${id}.glb`), Buffer.from(buf));
  console.log(`output/models/${id}.glb  ${(buf.byteLength / 1024).toFixed(0)} KB, ${clip.tracks.length} animated tracks`);
}
