// Promote a seeded variant to a new character spec.
//   npm run new -- --from serafino --seed 302 [--name "Serafino minore"] [--amount 0.55]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './serve.mjs';
import { manifest, specFile } from './manifest.mjs';
import { mutate } from '../engine/mutate.js';

const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map(s => { const [k, ...v] = s.trim().split(' '); return [k, v.join(' ')]; }));
if (!args.from || !args.seed) { console.error('usage: npm run new -- --from <id> --seed <n> [--name "..."] [--amount 0.55] [--id new-id]'); process.exit(1); }
const from = specFile(args.from);
const src = JSON.parse(fs.readFileSync(from));
const spec = mutate(src, +args.seed, args.amount ? +args.amount : undefined);
if (args.id) spec.id = args.id;
if (args.name) spec.name = args.name;
spec.concept = `Variant ${args.seed} of ${src.name}. ${src.concept || ''}`.trim();
const out = path.join(path.dirname(from), `${spec.id}.json`); // same series folder as the parent
fs.writeFileSync(out, JSON.stringify(spec, null, 2) + '\n');
manifest();
console.log(`wrote ${path.relative(ROOT, out)} (parent: ${src.id})`);
