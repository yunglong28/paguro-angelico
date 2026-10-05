// Quick turnaround of one spec file (draft or character) into a single strip, for iterating on a design.
//   node scripts/turn.mjs characters/drafts/test.json output/renders/_turn.png [studio|y2k|toon|print]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { serve, ROOT } from './serve.mjs';
import { launch, pool } from './chrome.mjs';

const [spec, outFile = 'output/renders/_turn.png', look = 'studio'] = process.argv.slice(2);
if (!spec) { console.error('usage: node scripts/turn.mjs <spec.json> [out.png] [look]'); process.exit(1); }
const run = promisify(execFile);
const port = +(process.env.PORT || 5198);
const server = await serve(port), chrome = await launch();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tbs-turn-'));
const yaws = [0, 0.8, 1.57, 3.14], frames = yaws.map((_, i) => path.join(tmp, `t${i}.png`));
try {
  await pool(yaws, 2, (yaw, i) => chrome.shot(`http://127.0.0.1:${port}/studio/?export&spec=${spec}&mode=edit&look=${look}&yaw=${yaw}`, frames[i], 600, 750));
  fs.mkdirSync(path.dirname(path.resolve(ROOT, outFile)), { recursive: true });
  await run('ffmpeg', ['-y', '-loglevel', 'error', ...frames.flatMap(f => ['-i', f]), '-filter_complex', `hstack=inputs=${frames.length}`, path.resolve(ROOT, outFile)]);
  console.log(outFile);
} finally { await chrome.close(); server.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
