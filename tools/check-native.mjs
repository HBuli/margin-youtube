const ws = new WebSocket('ws://127.0.0.1:9223/session');
let id = 0; const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
await new Promise((r) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', () => r()); });
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); setTimeout(() => { if (pending.has(i)) { pending.delete(i); res({ error: 'timeout ' + m }); } }, 60000); });
const s = await send('session.new', { capabilities: { alwaysMatch: { browserName: 'firefox' } } });
if (s.error) { console.log('FAIL', JSON.stringify(s.error)); process.exit(1); }
const evalIn = async (ctx, expr) => {
  const r = await send('script.evaluate', { expression: expr, target: { context: ctx }, awaitPromise: true, resultOwnership: 'none' });
  return r.result?.result?.value ?? JSON.stringify(r).slice(0, 300);
};
try {
  const tree = await send('browsingContext.getTree', {});
  const tab = (tree.result?.contexts ?? []).find((c) => c.url && c.url.includes('youtube.com'));
  console.log('tab', tab?.url);
  const r = await evalIn(tab.context, `(async () => {
    const root = document.getElementById('margin-root');
    if (!root) return 'no-root';
    const sr = root.shadowRoot;
    const gear = [...sr.querySelectorAll('button,a')].find((b) => (b.getAttribute('aria-label') || b.title || '').includes('设置'));
    if (!gear) return 'no-gear:' + [...sr.querySelectorAll('button')].map(b=>b.getAttribute('aria-label')||b.textContent.trim()).slice(0,12).join('|');
    gear.click();
    await new Promise((r) => setTimeout(r, 2500));
    const tips = [...sr.querySelectorAll('.sd-hint')].map((e) => e.textContent.trim());
    return JSON.stringify({ tips, sheets: sr.querySelectorAll('.sheet').length });
  })()`);
  console.log(r);
} finally { await send('session.end', {}); ws.close(); setTimeout(() => process.exit(0), 300); }
