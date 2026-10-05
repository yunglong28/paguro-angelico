// Screenshot any studio state(s) to PNG; several queries are stacked side by side.
//   node scripts/shot.mjs output/renders/x.png "c=serafino&look=y2k" "c=torre&mode=sheet" [--size=600x750]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { serve, ROOT } from './serve.mjs';
import { launch, pool } from './chrome.mjs';

const run = promisify(execFile);
const args = process.argv.slice(2);
const [w, h] = (args.find(a => a.startsWith('--size=')) || '--size=600x750').slice(7).split('x').map(Number);
const [out, ...queries] = args.filter(a => !a.startsWith('--'));
if (!out || !queries.length) { console.error('usage: node scripts/shot.mjs <out.png> "<query>" ["<query>" …] [--size=WxH]'); process.exit(1); }

const port = 5100 + Math.floor(Math.random() * 800);
const server = await serve(port), chrome = await launch();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tbs-shots-'));
const files = queries.map((q, i) => path.join(tmp, `s${i}.png`));
try {
  await pool(queries, 2, (q, i) => chrome.shot(`http://127.0.0.1:${port}/studio/?export&${q}`, files[i], w, h));
  const dest = path.resolve(ROOT, out);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (files.length === 1) fs.copyFileSync(files[0], dest);
  else await run('ffmpeg', ['-y', '-loglevel', 'error', ...files.flatMap(f => ['-i', f]), '-filter_complex', `hstack=inputs=${files.length}`, dest]);
  console.log(out);
} finally { await chrome.close(); server.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
