// Screenshot any viewer state(s) to PNG; several queries are stacked side by side.
//   node pipeline/shot.mjs out/x.png "c=serafino&look=color" "c=torre&mode=sheet" [--size=600x750]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { serve, ROOT } from './serve.mjs';

const run = promisify(execFile);
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const args = process.argv.slice(2);
const size = (args.find(a => a.startsWith('--size=')) || '--size=600x750').slice(7).split('x');
const [out, ...queries] = args.filter(a => !a.startsWith('--'));
const PORT = 5100 + Math.floor(Math.random() * 800);
const server = await serve(PORT);

export async function shoot(query, file, w, h, port) {
  const P = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-'));
  try {
    await run(CHROME, ['--headless=new', `--user-data-dir=${P}`, '--no-first-run', '--hide-scrollbars', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      `--window-size=${w},${h}`, '--virtual-time-budget=5000', `--screenshot=${file}`, `http://127.0.0.1:${port}/viewer/?export&${query}`], { timeout: 120000 });
  } finally { fs.rmSync(P, { recursive: true, force: true }); }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-shots-'));
const files = queries.map((q, i) => path.join(tmp, `s${i}.png`));
// two at a time: SwiftShader starves when too many Chromes share the CPU
for (let i = 0; i < queries.length; i += 2) await Promise.all(queries.slice(i, i + 2).map((q, j) => shoot(q, files[i + j], +size[0], +size[1], PORT)));
server.close();
const dest = path.resolve(ROOT, out);
fs.mkdirSync(path.dirname(dest), { recursive: true });
if (files.length === 1) fs.copyFileSync(files[0], dest);
else await run('ffmpeg', ['-y', '-loglevel', 'error', ...files.flatMap(f => ['-i', f]), '-filter_complex', `hstack=inputs=${files.length}`, dest]);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(out);
