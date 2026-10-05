// Zero-dependency dev server: static files (ES modules need http, not file://) plus the studio's API.
//   GET  /api/ping                    → { ok: true }: the studio is running locally and can save
//   PUT  /api/character               { spec, to: 'drafts' | '<series>' } → writes characters/<to>/<id>.json (+ manifest)
//   PUT  /api/brand                   { brand } → writes brand/brand.json
//   POST /api/generate                { prompt, base? } → a character written by Claude (scripts/generate.mjs)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.mp4': 'video/mp4', '.md': 'text/markdown', '.css': 'text/css', '.svg': 'image/svg+xml' };

const body = (req) => new Promise((ok, ko) => { let s = ''; req.on('data', d => { s += d; if (s.length > 2e6) ko(new Error('too large')); }); req.on('end', () => { try { ok(JSON.parse(s || '{}')); } catch (e) { ko(e); } }); });
const send = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); };

async function api(req, res, p) {
  if (p === '/api/ping') return send(res, 200, { ok: true });
  if (p === '/api/character' && req.method === 'PUT') {
    const { validate } = await import('../engine/schema.js');
    const { spec, to = 'drafts' } = await body(req);
    if (!/^[a-z0-9-]+$/.test(to)) return send(res, 400, { error: 'bad folder' });
    const s = validate(spec);
    const dir = path.join(ROOT, 'characters', to); fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${s.id}.json`);
    fs.writeFileSync(file, JSON.stringify(s, null, 2) + '\n');
    if (to !== 'drafts') (await import('./manifest.mjs')).manifest();
    return send(res, 200, { ok: true, path: path.relative(ROOT, file), spec: s });
  }
  if (p === '/api/brand' && req.method === 'PUT') {
    const { brand } = await body(req);
    fs.writeFileSync(path.join(ROOT, 'brand', 'brand.json'), JSON.stringify(brand, null, 2) + '\n');
    return send(res, 200, { ok: true });
  }
  if (p === '/api/generate' && req.method === 'POST') {
    const { prompt, base } = await body(req);
    if (!prompt || typeof prompt !== 'string') return send(res, 400, { error: 'describe the character' });
    try { return send(res, 200, { spec: await (await import('./generate.mjs')).generate(prompt.slice(0, 2000), base) }); }
    catch (e) {
      const auth = e?.constructor?.name === 'AuthenticationError' || /authentication method|api key/i.test(e.message);
      return send(res, auth ? 401 : 500, { error: auth ? 'No valid Anthropic credentials: set ANTHROPIC_API_KEY or run `ant auth login`, then restart npm run dev.' : e.message });
    }
  }
  return send(res, 404, { error: 'unknown endpoint' });
}

export function serve(port = 5173) {
  const server = http.createServer(async (req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.startsWith('/api/')) { try { await api(req, res, p); } catch (e) { send(res, 500, { error: e.message }); } return; }
    if (p === '/') { res.writeHead(302, { location: '/studio/' }); return res.end(); }
    let f = path.join(ROOT, p);
    const rel = path.relative(ROOT, f);
    if (rel.startsWith('..') || path.isAbsolute(rel)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    fs.readFile(f, (err, buf) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(buf);
    });
  });
  return new Promise(ok => server.listen(port, '127.0.0.1', () => ok(server)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = +(process.env.PORT || 5173);
  await serve(port);
  console.log(`studio → http://127.0.0.1:${port}/studio/`);
}
