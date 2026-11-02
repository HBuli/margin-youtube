/**
 * 入口脚本（document_start，只跑在 youtube.com）。
 *
 * 做法和 MARGIN 对 B 站一样：先把原版藏起来（防闪），再按路由动态 import 页面模块，
 * 用 Shadow DOM 画自己的界面。区别在藏的方式——这里用 visibility 而不是 display:none，
 * 原生页面保持正常文档流和滚动高度，YouTube 自己的 continuation（无限加载）才能继续工作，
 * 我们只是从它已经渲染出来的卡片里读数据。
 *
 * 播放页（/watch）走另一套：见 yt/watch.ts——播放器、评论区、关联视频保留原生节点，
 * 只隐藏原生顶栏与所有推广位。Shorts / 播放列表 / Live 仍是原版。
 */
import { loadSettings, onSettingsChange, type Settings } from '../shared/settings';
import { injectFonts } from './fonts';
import { YtApp, type PageKind } from './yt/home';
import { YtWatch } from './yt/watch';

export type { PageKind };

/**
 * 藏原版。三条约束：
 * 1. 不能 display:none / overflow:hidden —— 原生页会停止滚动，无限加载也就停了；
 * 2. 只隐藏 body 的直接子元素，我们的 #margin-root 挂在 <html> 上，不受影响；
 * 3. 给 html 一个底色，避免加载间隙露出白色。
 */
const HIDE_CSS = [
  // 底色跟随系统明暗，避免加载那一瞬间闪黑/闪白
  'html{background:#f5f4f1}',
  '@media (prefers-color-scheme: dark){html{background:#0f0f0f}}',
  'body{margin:0}',
  'body>*:not(script):not(style){visibility:hidden!important}',
].join('');

function hideOriginal(): void {
  if (document.getElementById('margin-hide')) return;
  const st = document.createElement('style');
  st.id = 'margin-hide';
  st.textContent = HIDE_CSS;
  document.documentElement.append(st);
}
function showOriginal(): void {
  document.getElementById('margin-hide')?.remove();
}

type Route = { kind: PageKind; query: string } | { kind: 'watch'; query: '' };

/** 频道主页只跳一次 /videos，防止轮询反复 replace */
let chanRedirect = false;

/** 当前路由要不要接管，接管成哪一页 */
function route(): Route | null {
  const p = location.pathname;
  if (p === '/watch') return { kind: 'watch', query: '' };
  // Shorts、播放列表、Live：原生
  if (p.startsWith('/shorts/') || p === '/playlist' || p.startsWith('/live/')) return null;
  if (p === '/results') return { kind: 'search', query: new URLSearchParams(location.search).get('search_query') ?? '' };
  if (/^\/(?:@|channel\/|c\/|user\/)/.test(p)) {
    const seg = p.split('/').filter(Boolean);
    const named = seg[0] === 'channel' || seg[0] === 'c' || seg[0] === 'user';
    const base = named ? `${seg[0]}/${seg[1] ?? ''}` : seg[0];
    const tab = named ? seg[2] : seg[1];
    // 频道主页（/@name、/@name/featured）是横排 shelf，只有十几个精选；
    // 「视频」标签才是 ytd-rich-grid-renderer 的无限列表，直接换过去，否则只能抓到一小撮
    if (!tab || tab === 'featured') {
      if (!chanRedirect) {
        chanRedirect = true;
        setTimeout(() => {
          const target = `/${base}/videos`;
          if (location.pathname !== target) location.replace(target);
        }, 300);
      }
      return null;
    }
    return { kind: 'channel', query: decodeURIComponent(base) };
  }
  if (p === '/' || /^\/feed\/[^/]+\/?$/.test(p) || p === '/index.html') return { kind: 'home', query: '' };
  return null;
}

const offByUrl = () => new URLSearchParams(location.search).get('margin') === 'off';

let settings: Settings | null = null;
let app: { destroy(): void; update(s: Settings): void } | null = null;
let key = '';
let swapping = false;

async function swap(): Promise<void> {
  if (swapping || !settings) return;
  const r = offByUrl() || sessionStorage.getItem('margin:off') || !settings.enabled ? null : route();
  const next = r ? `${r.kind}|${r.query}|${location.pathname}${location.search}` : '';
  if (next === key) return;
  key = next;
  swapping = true;
  app?.destroy();
  app = null;
  try {
    if (!r) { showOriginal(); return; }
    if (r.kind === 'watch') {
      // 播放页不能藏原生：播放器就在里面
      showOriginal();
      const inst = new YtWatch(settings);
      inst.mount();
      app = inst;
    } else {
      hideOriginal();
      const inst = new YtApp(settings, r.kind, r.query);
      inst.mount();
      app = inst;
    }
  } catch (e) {
    console.warn('[margin] 页面加载失败，回退到原版', e);
    showOriginal();
    key = '';
  } finally {
    swapping = false;
  }
}

function boot(): void {
  injectFonts();
  void loadSettings().then((s) => {
    settings = s;
    void swap();
  });

  onSettingsChange((next, prev) => {
    settings = next;
    if (!next.enabled) { showOriginal(); app?.destroy(); app = null; key = ''; return; }
    app?.update(next);
    if (prev.theme !== next.theme || prev.cols !== next.cols) void swap();
    if (!document.getElementById('margin-hide')) void swap();
  });

  // YouTube 的 SPA 导航：事件 + 轮询双保险（事件偶尔在慢网络下丢）
  let last = location.href;
  const onNav = () => {
    if (location.href === last) return;
    last = location.href;
    if (location.pathname.startsWith('/watch')) sessionStorage.removeItem('margin:off');
    void swap();
  };
  document.addEventListener('yt-navigate-finish', onNav);
  document.addEventListener('yt-page-data-updated', onNav);
  addEventListener('popstate', onNav);
  setInterval(() => { if (location.href !== last) onNav(); }, 800);
}

if (document.readyState === 'loading') {
  // location 在 document_start 已经有了，先藏起来防闪，等 DOM 有内容再采集
  const first = route();
  if (first && first.kind !== 'watch' && !offByUrl() && !sessionStorage.getItem('margin:off')) hideOriginal();
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
