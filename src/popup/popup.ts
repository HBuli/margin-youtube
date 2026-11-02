import { loadSettings, saveSettings, type Settings, type Theme } from '../shared/settings';

const $ = <T extends HTMLElement>(s: string) => document.querySelector(s) as T;

function paint(s: Settings): void {
  $('#enabled').setAttribute('aria-checked', String(s.enabled));
  $('#watch').setAttribute('aria-checked', String(s.watch));
  document.querySelectorAll<HTMLButtonElement>('#theme button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === s.theme)));
}

(async () => {
  $('#ver').textContent = chrome.runtime.getManifest().version;
  let s = await loadSettings();
  paint(s);
  $('#enabled').addEventListener('click', async () => { s = await saveSettings({ enabled: !s.enabled }); paint(s); });
  $('#watch').addEventListener('click', async () => { s = await saveSettings({ watch: !s.watch }); paint(s); });
  $('#theme').addEventListener('click', async (e) => {
    const v = (e.target as HTMLElement).closest('button')?.dataset.v as Theme | undefined;
    if (!v) return;
    s = await saveSettings({ theme: v });
    paint(s);
  });
})();

// 手动安装（zip 解压）不会自动更新：没有 update_url 时，向 GitHub Releases 查询最新版本并提示。
// 从 Edge 加载项商店安装的版本带 update_url，由浏览器自动更新，不显示提示。
void (async () => {
  const mf = chrome.runtime.getManifest() as chrome.runtime.Manifest & { update_url?: string };
  if (mf.update_url) return;
  // 这是本地自用改造，没有发布渠道，不再向上游查更新。
})();
