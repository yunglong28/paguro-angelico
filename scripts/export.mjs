// Render plates, model sheets and variant grids to PNG with headless Chrome (+ optional mp4 loop).
//   npm run export                      all characters, plate + sheet
//   npm run export -- serafino --loop   one character, plus a 4s turntable mp4
//   npm run export -- --variants        also the 3x3 variant grid
//   npm run export -- --plate           plates only (fast)
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import { serve, ROOT } from './serve.mjs';
import { ids as allIds } from './manifest.mjs';

const CHROME = process.env.CHROME || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].find(p => fs.existsSync(p));
if (!CHROME) { console.error('Chrome not found; set CHROME=/path/to/chrome'); process.exit(1); }

const argv = process.argv.slice(2);
const flags = new Set(argv.filter(a => a.startsWith('--')));
const ids = argv.filter(a => !a.startsWith('--')).length ? argv.filter(a => !a.startsWith('--')) : allIds();
const port = 5199;
const JOBS = +(process.env.JOBS || 4);
const server = await serve(port);

const run = promisify(execFile);
// async on purpose: a sync spawn would block the in-process server Chrome is talking to
async function shot(url, file, w, h) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-chrome-')); // one profile per shot so shots can run in parallel
  await run(CHROME, ['--headless=new', `--user-data-dir=${PROFILE}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--force-device-scale-factor=1',
    `--window-size=${w},${h}`, '--virtual-time-budget=20000', `--screenshot=${file}`, url], { timeout: 90000 }).finally(() => fs.rmSync(PROFILE, { recursive: true, force: true }));
}
const U = (q) => `http://127.0.0.1:${port}/studio/?export&${q}`;

async function one(id) {
  const dir = path.join(ROOT, 'output', 'renders', id);
  await shot(U(`c=${id}&mode=plate`), path.join(dir, 'plate.png'), 1200, 1500);
  if (!flags.has('--plate')) await shot(U(`c=${id}&mode=sheet`), path.join(dir, 'sheet.png'), 1800, 1100);
  if (flags.has('--variants')) await shot(U(`c=${id}&mode=variants`), path.join(dir, 'variants.png'), 1500, 1500);
  if (flags.has('--loop')) {
    const tmp = path.join(dir, 'frames'); fs.mkdirSync(tmp, { recursive: true });
    const N = 48;
    for (let i = 0; i < N; i++) await shot(U(`c=${id}&mode=plate&t=${(i / N * 4).toFixed(3)}&yaw=${(i / N * Math.PI * 2).toFixed(4)}`), path.join(tmp, `f${String(i).padStart(3, '0')}.png`), 800, 1000);
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '12', '-i', path.join(tmp, 'f%03d.png'), '-pix_fmt', 'yuv420p', '-vf', 'scale=800:-2', path.join(dir, 'loop.mp4')]);
    fs.rmSync(tmp, { recursive: true });
  }
  console.log(`output/renders/${id}/`);
}

const queue = [...ids];
await Promise.all(Array.from({ length: Math.min(JOBS, ids.length) }, async () => { while (queue.length) await one(queue.shift()); }));
server.close();
