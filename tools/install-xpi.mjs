// 用 WebDriver BiDi 把一个 xpi 装进正在运行的 Zen（临时扩展，进程内有效）
import { readFileSync } from 'node:fs';
const xpi = process.argv[2];
if (!xpi) { console.error('用法: node tools/install-xpi.mjs <path.xpi>'); process.exit(2); }
const port = process.env.MARGIN_BIDI_PORT || 9223;
const ws = new WebSocket(`ws://127.0.0.1:${port}/session`);
let id = 0; const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const opened = await new Promise((r) => { ws.addEventListener('open', () => r(true), { once: true }); ws.addEventListener('error', () => r(false), { once: true }); });
if (!opened) { console.error('连不上 BiDi 端口', port); process.exit(1); }
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pending.has(i)) { pending.delete(i); res({ error: 'timeout' }); } }, 30000); });
try {
  const s = await send('session.new', { capabilities: { alwaysMatch: { browserName: 'firefox' } } });
  if (s.error) throw new Error(s.error);
  const r = await send('webExtension.install', { extensionData: { type: 'path', path: xpi } });
  if (r.error) throw new Error(JSON.stringify(r.error));
  let ext = '';
  try { ext = readFileSync(xpi, 'binary').includes('margin-youtube@hbuli.local') ? 'margin-youtube@hbuli.local' : ''; } catch { /* ignore */ }
  await send('session.end', {});
  console.log(JSON.stringify(r.result));
} finally { ws.close(); setTimeout(() => process.exit(0), 200); }
