// Sync an Are.na channel into briefs/references/<slug>/ as reference material for the cast.
//   npm run refs -- https://www.are.na/<user>/<channel>      (or just the channel slug)
//   npm run refs -- mascot --no-sheets                       skip the contact sheets
// Writes img/<block id>.<ext> (medium size), index.json (title, source, author, notes and comments
// for every block) and sheets/sheet-NN.jpg (6×5 contact sheets, numbered like index.json).
// Re-running only downloads what is new. Private channels: set ARENA_TOKEN (a personal access token).
// The folder is git-ignored: references are private material, credited by their source, never published.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ROOT } from './serve.mjs';

const run = promisify(execFile);
const args = process.argv.slice(2);
const target = args.find(a => !a.startsWith('--'));
if (!target) { console.error('usage: npm run refs -- <are.na channel url or slug> [--no-sheets]'); process.exit(1); }
const slug = target.replace(/\/+$/, '').split('/').pop().split('?')[0];
const API = 'https://api.are.na/v3';
// ARENA_TOKEN from the environment, or from a git-ignored .env file (ARENA_TOKEN=...) in the project
if (!process.env.ARENA_TOKEN && fs.existsSync(path.join(ROOT, '.env'))) {
  const m = fs.readFileSync(path.join(ROOT, '.env'), 'utf8').match(/^\s*ARENA_TOKEN\s*=\s*["']?([^"'\s]+)/m);
  if (m) process.env.ARENA_TOKEN = m[1];
}
const headers = process.env.ARENA_TOKEN ? { authorization: `Bearer ${process.env.ARENA_TOKEN}` } : {};
const dir = path.join(ROOT, 'briefs', 'references', slug), imgDir = path.join(dir, 'img');
fs.mkdirSync(imgDir, { recursive: true });

async function get(url) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, { headers });
    if (r.status === 429 && attempt < 5) { await new Promise(s => setTimeout(s, 1500 * (attempt + 1))); continue; } // rate limited
    if (!r.ok) throw new Error(`${r.status} ${r.statusText} for ${url}${r.status === 401 || r.status === 403 || r.status === 404 ? ' (private channel? set ARENA_TOKEN)' : ''}`);
    return r.json();
  }
}
async function pool(items, n, fn) { const q = [...items]; await Promise.all(Array.from({ length: n }, async () => { while (q.length) await fn(q.shift()); })); }

// ---------- channel + every block ----------
const channel = await get(`${API}/channels/${slug}`);
console.log(`${channel.title} · ${channel.owner?.name || ''} · ${channel.counts?.contents ?? '?'} items`);
const blocks = [];
for (let page = 1; ; page++) {
  const r = await get(`${API}/channels/${slug}/contents?per=100&page=${page}`);
  blocks.push(...r.data);
  process.stdout.write(`\rreading ${blocks.length}/${r.meta.total_count}`);
  if (!r.meta.has_more_pages) break;
}
console.log('');

// ---------- images (incremental) + comments, which is where people write what matters ----------
// v3 returns rich text as { markdown, html, plain }
const plain = (x) => (x == null ? null : typeof x === 'string' ? x : x.plain ?? x.markdown ?? null);
const ext = (b) => ({ 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' })[b.image?.content_type] || 'jpg';
const pic = (b) => b.image?.medium?.src || b.image?.large?.src || b.image?.src;
let fresh = 0, failed = 0;
await pool(blocks.filter(b => pic(b)), 8, async (b) => {
  const file = path.join(imgDir, `${b.id}.${ext(b)}`);
  if (fs.existsSync(file)) return;
  try { const r = await fetch(pic(b)); if (!r.ok) throw new Error(r.status); fs.writeFileSync(file, Buffer.from(await r.arrayBuffer())); fresh++; }
  catch { failed++; }
});
const comments = {};
await pool(blocks.filter(b => b.comment_count > 0), 4, async (b) => {
  try { const r = await get(`${API}/blocks/${b.id}/comments?per=50`); comments[b.id] = r.data.map(c => ({ by: c.user?.name, text: plain(c.body) })); } catch {}
});

const index = blocks.map((b, i) => ({
  n: i + 1, id: b.id, type: b.type, title: b.title || null, description: plain(b.description),
  text: b.type === 'Text' ? plain(b.content) : undefined,
  source: b.source?.url || null, by: b.user?.name || null, added: b.connection?.connected_at || b.created_at,
  file: pic(b) ? `img/${b.id}.${ext(b)}` : null, comments: comments[b.id],
  channel: b.type === 'Channel' ? b.slug : undefined,
}));
fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify({
  channel: { title: channel.title, slug, owner: channel.owner?.name, url: `https://www.are.na/${channel.owner?.slug}/${slug}`, synced: new Date().toISOString() },
  blocks: index,
}, null, 2) + '\n');
const images = index.filter(b => b.file && fs.existsSync(path.join(dir, b.file)));
console.log(`${images.length} images (${fresh} new${failed ? `, ${failed} failed` : ''}) · ${Object.keys(comments).length} blocks with comments · ${index.filter(b => b.type === 'Channel').length} sub-channels`);

// ---------- contact sheets: 30 numbered images per sheet, to look at a whole channel at once ----------
if (!args.includes('--no-sheets')) {
  const sheets = path.join(dir, 'sheets'), frames = path.join(dir, '.frames');
  fs.rmSync(sheets, { recursive: true, force: true }); fs.rmSync(frames, { recursive: true, force: true });
  fs.mkdirSync(sheets, { recursive: true }); fs.mkdirSync(frames);
  const cell = 'format=rgb24,scale=240:240:force_original_aspect_ratio=decrease,pad=240:240:(ow-iw)/2:(oh-ih)/2:color=0xf4f4f2,format=yuvj420p';
  const made = [];
  await pool(images.map((b, k) => [b, k]), 6, async ([b, k]) => {
    const label = `drawtext=text='${b.n}':x=6:y=6:fontsize=16:fontcolor=white:box=1:boxcolor=0x141410@0.8:boxborderw=4`;
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(dir, b.file), '-frames:v', '1', '-vf', `${cell},${label}`, path.join(frames, `f${String(k).padStart(4, '0')}.jpg`)])
      .catch(() => run('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(dir, b.file), '-frames:v', '1', '-vf', cell, path.join(frames, `f${String(k).padStart(4, '0')}.jpg`)]).catch(() => {}));
    if (fs.existsSync(path.join(frames, `f${String(k).padStart(4, '0')}.jpg`))) made[k] = b.n;
  });
  // which block is where on each sheet (reading order), for ffmpeg builds without drawtext
  const order = made.filter(Boolean);
  for (let s = 0; s * 30 < order.length; s++) fs.writeFileSync(path.join(sheets, `sheet-${String(s + 1).padStart(2, '0')}.txt`),
    order.slice(s * 30, s * 30 + 30).map((n, i) => `${Math.floor(i / 6) + 1}.${(i % 6) + 1}  #${n}  ${(index[n - 1].title || '').slice(0, 70)}`).join('\n') + '\n');
  // fill gaps so the sequence is continuous, then tile
  const got = fs.readdirSync(frames).sort();
  got.forEach((f, k) => fs.renameSync(path.join(frames, f), path.join(frames, `g${String(k).padStart(4, '0')}.jpg`)));
  if (got.length) await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(frames, 'g%04d.jpg'), '-vf', 'tile=6x5:padding=4:margin=4:color=0x141410', '-q:v', '3', path.join(sheets, 'sheet-%02d.jpg')]);
  fs.rmSync(frames, { recursive: true, force: true });
  console.log(`${fs.readdirSync(sheets).filter(f => f.endsWith('.jpg')).length} contact sheets in ${path.relative(ROOT, sheets)}/`);
}
console.log(path.relative(ROOT, dir) + '/');
