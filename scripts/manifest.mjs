// Rebuild characters/index.json from the spec files in characters/<series>/ (drafts/ is skipped).
// Entries are "<series>/<id>"; stable order: existing entries first, then new ones sorted.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './serve.mjs';

const DIR = path.join(ROOT, 'characters');
const SKIP = new Set(['drafts']);

export function manifest() {
  const index = path.join(DIR, 'index.json');
  const prev = fs.existsSync(index) ? JSON.parse(fs.readFileSync(index)) : [];
  const entries = fs.readdirSync(DIR, { withFileTypes: true }).filter(d => d.isDirectory() && !SKIP.has(d.name))
    .flatMap(d => fs.readdirSync(path.join(DIR, d.name)).filter(f => f.endsWith('.json')).map(f => `${d.name}/${f.slice(0, -5)}`));
  const order = [...prev.filter(e => entries.includes(e)), ...entries.filter(e => !prev.includes(e)).sort()];
  fs.writeFileSync(index, JSON.stringify(order, null, 2) + '\n');
  return order;
}

// id -> characters/<series>/<id>.json, via the index
export const specFile = (id) => {
  const entry = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'))).find(e => e.split('/').pop() === id);
  if (!entry) throw new Error(`no character "${id}" in characters/index.json`);
  return path.join(DIR, `${entry}.json`);
};
export const ids = () => JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'))).map(e => e.split('/').pop());

if (import.meta.url === `file://${process.argv[1]}`) console.log(manifest().join('\n'));
