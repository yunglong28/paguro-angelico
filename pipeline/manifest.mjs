// Rebuild characters/index.json from the spec files (stable order: originals first, then variants).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './serve.mjs';

export function manifest() {
  const dir = path.join(ROOT, 'characters');
  const prev = fs.existsSync(path.join(dir, 'index.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'index.json'))) : [];
  const ids = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'index.json').map(f => f.slice(0, -5));
  const order = [...prev.filter(id => ids.includes(id)), ...ids.filter(id => !prev.includes(id)).sort()];
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(order, null, 2) + '\n');
  return order;
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(manifest().join('\n'));
