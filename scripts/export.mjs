// Render plates, model sheets and variant grids to PNG with headless Chrome (+ optional mp4 loop).
//   npm run export                      all characters, plate + sheet
//   npm run export -- serafino --loop   one character, plus a 4s turntable mp4
//   npm run export -- --variants        also the 3x3 variant grid
//   npm run export -- --plate           plates only (fast)
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { serve, ROOT } from './serve.mjs';
import { launch, pool } from './chrome.mjs';
import { ids as allIds } from './manifest.mjs';

const argv = process.argv.slice(2);
const flags = new Set(argv.filter(a => a.startsWith('--')));
const ids = argv.filter(a => !a.startsWith('--')).length ? argv.filter(a => !a.startsWith('--')) : allIds();
const port = 5199;
const JOBS = +(process.env.JOBS || 2);
const server = await serve(port);

const run = promisify(execFile);
const chrome = await launch();
const shot = (url, file, w, h) => chrome.shot(url, file, w, h);
const U = (q) => `http://127.0.0.1:${port}/studio/?export&${q}`;

async function one(id) {
  const dir = path.join(ROOT, 'output', 'renders', id);
  await shot(U(`c=${id}&mode=plate`), path.join(dir, 'plate.png'), 1200, 1500);
  if (!flags.has('--plate')) await shot(U(`c=${id}&mode=sheet`), path.join(dir, 'sheet.png'), 1800, 1100);
  if (flags.has('--variants')) await shot(U(`c=${id}&mode=breed`), path.join(dir, 'variants.png'), 1500, 1500);
  if (flags.has('--loop')) {
    const tmp = path.join(dir, 'frames'); fs.mkdirSync(tmp, { recursive: true });
    const N = 48;
    for (let i = 0; i < N; i++) await shot(U(`c=${id}&mode=plate&t=${(i / N * 4).toFixed(3)}&yaw=${(i / N * Math.PI * 2).toFixed(4)}`), path.join(tmp, `f${String(i).padStart(3, '0')}.png`), 800, 1000);
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '12', '-i', path.join(tmp, 'f%03d.png'), '-pix_fmt', 'yuv420p', '-vf', 'scale=800:-2', path.join(dir, 'loop.mp4')]);
    fs.rmSync(tmp, { recursive: true });
  }
  console.log(`output/renders/${id}/`);
}

try { await pool(ids, JOBS, one); } finally { await chrome.close(); server.close(); }
