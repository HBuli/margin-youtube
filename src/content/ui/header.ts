import { loadSettings, onSettingsChange, type Settings } from '../../shared/settings';
import { h, icon, ICONS } from './dom';
import { createExpandableTabs, type TabItem, type TabSpec } from './expandable-tabs';
import { createSunMoon, type SunMoon } from './sun-moon';
import { attachTooltips } from './tooltip';
import { searchUrl } from '../api/search';

export interface Header { el: HTMLElement; input: HTMLInputElement; sunMoon: SunMoon; /** 液态玻璃块：搜索框、快捷入口胶囊、选中滑块 */ glass: HTMLElement[]; thumb: HTMLElement }

/** 顶栏入口：YouTube 自己的几个固定页，不做未读角标之类的额外请求 */
export const SITE_LINKS: TabSpec[] = [
  { title: '订阅', icon: ICONS.moments, href: 'https://www.youtube.com/feed/subscriptions' },
  { title: '热门', icon: ICONS.heat, href: 'https://www.youtube.com/feed/trending' },
  { title: '稍后看', icon: ICONS.later, href: 'https://www.youtube.com/playlist?list=WL' },
  { title: '历史', icon: ICONS.history, href: 'https://www.youtube.com/feed/history' },
  { title: '我的', icon: ICONS.message, href: 'https://www.youtube.com/feed/you' },
  { title: '工作室', icon: ICONS.creator, href: 'https://studio.youtube.com/' },
];

/**
 * 首页和接管页共用的顶栏：标志、搜索、Expandable Tabs、日月主题按钮、上传、头像。
 * 不请求任何 YouTube 账号接口——登录状态和头像交给原生站，这里只给入口。
 */
export function createHeader(o: { tabs: TabItem[]; onTheme: () => void; onSearch?: (q: string) => void }): Header {
  const user = h('a', { class: 'user', href: 'https://accounts.google.com/ServiceLogin?service=youtube', target: '_blank', rel: 'noopener' }, '登录');
  const userSlot = h('div', { class: 'um-wrap' }, user);

  const input = h('input', { type: 'search', placeholder: '搜索视频、频道', autocomplete: 'off', 'aria-label': '搜索' }) as HTMLInputElement;
  const search = h('form', {
    class: 'search', role: 'search',
    onsubmit: (e: Event) => {
      e.preventDefault();
      const q = input.value.trim();
      if (!q) return;
      if (o.onSearch) o.onSearch(q); else location.href = searchUrl(q);
    },
  }, icon(ICONS.search), input);

  const tabsNav = createExpandableTabs(o.tabs);
  // 顶栏入口自定义：隐藏的入口 hidden；固定入口按设置里的顺序用 CSS order 排
  const applyPrefs = (st: Settings) => {
    const siteIdx = new Map(SITE_LINKS.map((l, i) => [l.title, i]));
    const order = [...st.headOrder.filter((t) => siteIdx.has(t)), ...SITE_LINKS.map((l) => l.title).filter((t) => !st.headOrder.includes(t))];
    for (const b of tabsNav.buttons) {
      const t = b.querySelector('span')?.textContent ?? '';
      b.hidden = t !== '设置' && st.headHide.includes(t);
      b.style.order = siteIdx.has(t) ? String(order.indexOf(t)) : '30';
    }
    tabsNav.el.querySelectorAll<HTMLElement>('.et-sep').forEach((x) => { x.style.order = '20'; x.hidden = tabsNav.buttons.every((b) => b.hidden || !siteIdx.has(b.querySelector('span')?.textContent ?? '')); });
    tabsNav.el.querySelector<HTMLElement>('.et-thumb')?.style.setProperty('order', '-1');
  };
  loadSettings().then(applyPrefs).catch(() => {});
  onSettingsChange((n, p) => { if (n.headHide.join() !== p.headHide.join() || n.headOrder.join() !== p.headOrder.join()) applyPrefs(n); });
  const sunMoon = createSunMoon(o.onTheme);
  // 左上角：「首页」按钮（放在搜索框左边），风格与导航一致；原来的 M 标已去掉
  const el = h('header', { class: 'top' },
    h('a', { class: 'ghost home-link', href: 'https://www.youtube.com/', title: '首页', 'aria-label': '首页' },
      icon(ICONS.home), h('span', {}, '首页')),
    search,
    // 日月按钮搬到设置面板里了（顶栏只留导航与搜索）；sunMoon 实例仍创建，旧页面还会读它
    h('div', { class: 'acts' }, tabsNav.el, userSlot),
  );

  user.dataset.tip = '登录 YouTube';
  search.dataset.tip = '搜索';
  attachTooltips(el);

  addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'k' || !(e.ctrlKey || e.metaKey) || e.altKey) return;
    e.preventDefault();
    input.focus();
    input.select();
  });
  return { el, input, sunMoon, glass: [search, tabsNav.el], thumb: tabsNav.thumb };
}
