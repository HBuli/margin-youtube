const ws = new WebSocket('ws://127.0.0.1:9223/session');
let id = 0; const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
await new Promise((r) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', () => r()); });
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); setTimeout(() => { if (pending.has(i)) { pending.delete(i); res({ error: 'timeout ' + m }); } }, 60000); });
const s = await send('session.new', { capabilities: { alwaysMatch: { browserName: 'firefox' } } });
if (s.error) { console.log('FAIL', JSON.stringify(s.error)); process.exit(1); }
try {
  let r = await send('webExtension.install', { extensionData: { type: 'path', path: '/tmp/margin-ff.xpi' } });
  if (r.error) {
    await send('webExtension.uninstall', { extension: 'margin-youtube@hbuli.local' });
    r = await send('webExtension.install', { extensionData: { type: 'path', path: '/tmp/margin-ff.xpi' } });
  }
  console.log('install:', JSON.stringify(r.result), r.error ? 'after-reinstall' : 'in-place');
  const tree = await send('browsingContext.getTree', {});
  const tabs = (tree.result?.contexts ?? []).filter((c) => c.url && c.url.includes('youtube.com'));
  console.log('youtube tabs:', tabs.map((c) => c.url.slice(0, 70)));
  for (const t of tabs) { await send('browsingContext.navigate', { context: t.context, url: t.url, wait: 'none' }); await new Promise((r) => setTimeout(r, 900)); }
  console.log('reloaded', tabs.length);
} finally { await send('session.end', {}); ws.close(); setTimeout(() => process.exit(0), 300); }
