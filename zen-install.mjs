const ws = new WebSocket('ws://127.0.0.1:9223/session');
let id = 0; const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
await new Promise((r) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', () => r()); });
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); setTimeout(() => { if (pending.has(i)) { pending.delete(i); res({ error: 'timeout ' + m }); } }, 60000); });
const s = await send('session.new', { capabilities: { alwaysMatch: { browserName: 'firefox' } } });
if (s.error) { console.log('SESSION FAIL', JSON.stringify(s.error).slice(0, 300)); process.exit(1); }
console.log('session ok');
try {
  const r = await send('webExtension.install', { extensionData: { type: 'path', path: '/tmp/margin-ff.xpi' } });
  console.log('install:', JSON.stringify(r.result ?? r.error).slice(0, 400));
  const t = await send('browsingContext.getTree', { maxDepth: 1 });
  console.log('contexts:', t.result?.contexts?.length, t.result?.contexts?.[0]?.url?.slice(0, 60));
} finally { await send('session.end', {}); ws.close(); setTimeout(() => process.exit(0), 300); }
