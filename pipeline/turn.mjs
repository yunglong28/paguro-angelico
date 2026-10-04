// Quick turnaround of one spec file (draft or character) into a single strip, for iterating on a design.
//   node pipeline/turn.mjs drafts/test.json out/_turn.png
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { serve, ROOT } from './serve.mjs';

const [spec, outFile = 'out/_turn.png'] = process.argv.slice(2);
const run = promisify(execFile);
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const server = await serve(5198);
const yaws = [0, 0.8, 1.57, 3.14];
const frames = await Promise.all(yaws.map(async (yaw, i) => {
  const P = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-')), f = path.join(P, `t${i}.png`);
  await run(CHROME, ['--headless=new', `--user-data-dir=${P}`, '--no-first-run', '--hide-scrollbars', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--window-size=600,750', '--virtual-time-budget=3000', `--screenshot=${f}`, `http://127.0.0.1:5198/viewer/?export&spec=${spec}&mode=plate&yaw=${yaw}`], { timeout: 90000 });
  return f;
}));
server.close();
fs.mkdirSync(path.dirname(path.resolve(ROOT, outFile)), { recursive: true });
await run('ffmpeg', ['-y', '-loglevel', 'error', ...frames.flatMap(f => ['-i', f]), '-filter_complex', `hstack=inputs=${frames.length}`, path.resolve(ROOT, outFile)]);
frames.forEach(f => fs.rmSync(path.dirname(f), { recursive: true, force: true }));
console.log(outFile);
