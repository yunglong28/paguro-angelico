// One headless Chrome for a whole run, driven over the DevTools protocol (Node's built-in WebSocket).
// Each shot opens a tab, waits until the studio has actually drawn (window.tbs.frames), then captures.
// Waiting on the page, not on a timer, is what keeps slow software-rendered frames from coming out blank.
//   const chrome = await launch(); await chrome.shot(url, 'x.png', 1200, 1500); await chrome.close();
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = process.env.CHROME || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].find(p => fs.existsSync(p));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export async function launch() {
  if (!CHROME) throw new Error('Chrome not found; set CHROME=/path/to/chrome');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tbs-chrome-'));
  const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--force-device-scale-factor=1', 'about:blank'], { stdio: 'ignore' });
  // Chrome writes the port it picked into the profile
  let port;
  for (let i = 0; i < 100 && !port; i++) { try { port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch { await sleep(100); } }
  if (!port) throw new Error('Chrome did not start');
  const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const ws = new WebSocket(webSocketDebuggerUrl);
  await new Promise((ok, ko) => { ws.onopen = ok; ws.onerror = ko; });
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const { ok, ko } = pending.get(d.id); pending.delete(d.id); d.error ? ko(new Error(d.error.message)) : ok(d.result); } };
  const send = (method, params = {}, sessionId) => new Promise((ok, ko) => { const i = ++id; pending.set(i, { ok, ko }); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });

  async function shot(url, file, w, h, { timeout = 180000, frames = 4 } = {}) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const s = (m, p) => send(m, p, sessionId);
    try {
      await s('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
      await s('Page.navigate', { url });
      const t0 = Date.now();
      for (;;) {
        const r = await s('Runtime.evaluate', { expression: `!!(window.tbs && tbs.frames >= ${frames})`, returnByValue: true }).catch(() => null);
        if (r?.result?.value) break;
        if (Date.now() - t0 > timeout) throw new Error(`timed out rendering ${url}`);
        await sleep(250);
      }
      const { data } = await s('Page.captureScreenshot', { format: 'png' });
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(data, 'base64'));
    } finally { await send('Target.closeTarget', { targetId }).catch(() => {}); }
  }
  // wait for Chrome to exit before removing its profile (it keeps writing until then)
  async function close() {
    ws.close();
    await new Promise(r => { proc.once('exit', r); proc.kill(); setTimeout(r, 5000); });
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  return { shot, close };
}

// run async jobs with at most `n` at once (SwiftShader starves when too many tabs render together)
export async function pool(items, n, fn) {
  const queue = items.map((x, i) => [x, i]);
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (queue.length) { const [x, i] = queue.shift(); await fn(x, i); } }));
}
