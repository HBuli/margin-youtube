/**
 * YouTube 版首页 / 搜索页 / 频道页的外壳。
 *
 * 和 MARGIN 对 B 站的做法一致：原页面藏着（visibility:hidden，不删 DOM、不 display:none），
 * 自己的界面用 Shadow DOM 画在顶层。区别是数据不来自接口，而是从原生页面已经渲染好的卡片里读，
 * 这样 YouTube 改接口、加签名、要 PO Token 都影响不到这里。
 */
import type { Settings } from '../../shared/settings';
import { BackgroundLayer } from '../bg/background';
import { createHeader, SITE_LINKS, type Header } from '../ui/header';
import { attachGlass, filtersIn } from '../ui/liquid-glass';
import { createYtSettings } from './settings';
import { videoCard, skeleton } from './cards';
import { collectVideos, feedRoot, observeFeed, parseAll, syncNativeScroll, type YtVideo } from './data';
import { h, icon, ICONS } from '../ui/dom';
import { searchUrl } from '../api/search';
import css from '../styles.css?inline';

export type PageKind = 'home' | 'search' | 'channel';

export class YtApp {
  readonly host: HTMLElement;
  private root: ShadowRoot;
  private app!: HTMLElement;
  private grid!: HTMLElement;
  private status!: HTMLElement;
  private sentinel!: HTMLElement;
  private bg = new BackgroundLayer();
  private head!: Header;
  private panel!: ReturnType<typeof createYtSettings>;
  private items: YtVideo[] = [];
  private seen = new Set<string>();
  private loading = false;
  private exhausted = false;
  private stopObserver: (() => void) | null = null;
  private media = matchMedia('(prefers-color-scheme: dark)');
  private dead = false;
  private durTimer = 0;
  private durTries = 0;
  /** 上次实际应用过的主题/背景快照：设置面板是先改 this.settings 再调 update()，
   *  用 prev=this.settings 比较会永远相等，所以单独记快照来触发重绘 */
  private lastTheme = '';
  private lastFilters = '';
  private lastBg = '';

  constructor(private settings: Settings, private kind: PageKind, private query = '') {
    this.host = h('div', { id: 'margin-root' });
    this.root = this.host.attachShadow({ mode: 'open' });
    this.root.append(h('style', {}, css));
    this.render();
    this.applyTheme();
    this.media.addEventListener('change', () => this.applyTheme());
  }

  update(s: Settings): void {
    const changed = this.lastTheme !== s.theme || this.lastBg !== JSON.stringify(s.bg);
    this.settings = s;
    // 背景图存在 storage 里而不在 settings 里，所以换图时 mode 可能没变，这里按整个 bg 对象判断
    if (changed) this.applyTheme();
    this.app.dataset.cols = String(s.cols || 'auto');
    this.app.dataset.zoom = String(s.zoom);
    this.app.dataset.titleFont = s.titleFont;
    this.app.dataset.mono = String(s.monoNum);
    if (this.lastFilters !== JSON.stringify(s.filters)) { this.lastFilters = JSON.stringify(s.filters); this.repaint(); }
  }

  mount(): void {
    if (this.host.isConnected) return;
    document.documentElement.append(this.host);
    this.stopObserver = observeFeed((v) => this.appendCards(v), this.seen);
    this.fill();
    // 首屏是渐进渲染的，头几帧可能还没有卡片，多等几轮
    let tries = 0;
    const tick = () => {
      if (this.dead) return;
      if (this.seen.size > 0) { this.loading = false; this.sentinel.hidden = false; return; }
      if (++tries > 60) {
        // 实测：未登录时 YouTube 首页本身没有推荐卡片（只有「搜索视频，开启 YouTube 之旅」引导），
        // 不是选择器坏了，所以这里把原因说清楚，避免误以为扩展没生效。
        // 骨架屏要一起撤掉，否则只剩一排灰块顶着那行字。
        this.grid.replaceChildren();
        this.setStatus(this.kind === 'home'
          ? '没有读到推荐视频。YouTube 未登录时首页本身是空的，登录后再点「刷新」；也可以直接搜索。'
          : '这里没有可显示的视频');
        this.loading = false;
        return;
      }
      this.fill();
      setTimeout(tick, 250);
    };
    setTimeout(tick, 300);
  }

  destroy(): void {
    this.dead = true;
    this.stopObserver?.();
    this.stopObserver = null;
    if (this.durTimer) { clearTimeout(this.durTimer); this.durTimer = 0; }
    this.host.remove();
    try { this.bg.hold('off', true); } catch { /* 已经拆掉 */ }
  }

  private resolvedTheme(): 'light' | 'dark' {
    return this.settings.theme === 'auto' ? (this.media.matches ? 'dark' : 'light') : this.settings.theme;
  }

  private applyTheme(): void {
    const t = this.resolvedTheme();
    this.app.dataset.theme = t;
    this.app.dataset.palette = this.settings.palette;
    this.app.dataset.cols = String(this.settings.cols || 'auto');
    this.app.dataset.zoom = String(this.settings.zoom);
    this.app.dataset.titleFont = this.settings.titleFont;
    this.app.dataset.mono = String(this.settings.monoNum);
    this.head?.sunMoon.set(t);
    void this.bg.apply(this.settings.bg, t, this.settings.palette);
    this.lastTheme = this.settings.theme;
    this.lastBg = JSON.stringify(this.settings.bg);
  }

  private toggleTheme(): void {
    const next = this.resolvedTheme() === 'dark' ? 'light' : 'dark';
    this.settings = { ...this.settings, theme: next };
    this.applyTheme();
  }

  private setStatus(t: string): void {
    this.status.textContent = t;
  }

  /** 过滤：关键词（支持 /正则/）、频道名、最短时长 */
  private keep(v: YtVideo): boolean {
    const f = this.settings.filters;
    for (const kw of f.keywords) {
      const raw = kw.trim();
      if (!raw) continue;
      const m = raw.match(/^\/(.*)\/([gimsuy]*)$/);
      if (m) { try { if (new RegExp(m[1], m[2].replace('g', '')).test(v.title)) return false; } catch { /* 正则写错就当普通词 */ } }
      else if (v.title.toLowerCase().includes(raw.toLowerCase())) return false;
    }
    for (const up of f.ups) {
      const raw = up.trim().toLowerCase();
      if (raw && (v.channel.toLowerCase().includes(raw) || v.channelUrl.toLowerCase().includes(raw))) return false;
    }
    if (f.minDuration) {
      const sec = parseDur(v.duration);
      if (sec && sec < f.minDuration) return false;
    }
    return true;
  }

  private fill(): void {
    const fresh = collectVideos(feedRoot(), this.seen);
    if (fresh.length) this.appendCards(fresh);
    else if (!this.items.length && !this.loading) this.setStatus('正在读取推荐…');
  }

  /** 时长徽标是懒渲染的：卡片进 DOM 时可能还没有时长，隔一会儿从原生卡片补一次 */
  private patchDurations(): void {
    this.durTimer = 0;
    if (this.dead || this.durTries++ > 10) return;
    const missing = this.items.filter((v) => !v.duration);
    if (!missing.length) return;
    const map = parseAll();
    for (const v of missing) {
      const nv = map.get(v.id);
      if (!nv?.duration) continue;
      v.duration = nv.duration;
      const el = this.grid.querySelector<HTMLElement>(`[data-vid="${v.id}"] .dur`);
      if (el) { el.textContent = nv.duration; el.style.display = ''; el.dataset.live = String(nv.duration === 'LIVE'); }
    }
    if (this.items.some((v) => !v.duration)) this.durTimer = window.setTimeout(() => this.patchDurations(), 1500);
  }

  private appendCards(list: YtVideo[]): void {
    const keep = list.filter((v) => this.keep(v));
    if (!keep.length) return;
    // 首屏骨架要撤掉：它们只是占位，真卡片是后补进来的，不拆掉会永远留在最前面
    if (!this.items.length) this.grid.querySelectorAll('.card.sk').forEach((e) => e.remove());
    const frag = document.createDocumentFragment();
    const base = this.items.length;
    keep.forEach((v, i) => frag.append(videoCard(v, base + i, { onBlock: (x) => this.blockChannel(x) })));
    this.items.push(...keep);
    this.grid.append(frag);
    if (this.items.length >= 4) this.setStatus('');
    this.sentinel.hidden = false;
    if (!this.durTimer) this.patchDurations();
  }

  private repaint(): void {
    this.grid.replaceChildren();
    const keep = this.items.filter((v) => this.keep(v));
    this.items = keep;
    this.appendCards(keep.map((v) => ({ ...v, __repaint: 1 }) as YtVideo));
  }

  private blockChannel(v: YtVideo): void {
    const ups = [...this.settings.filters.ups, v.channel];
    void chrome.storage.local.get('margin:settings').then((r) => {
      const cur = (r['margin:settings'] as Settings | undefined) ?? this.settings;
      return chrome.storage.local.set({ 'margin:settings': { ...cur, filters: { ...cur.filters, ups } } });
    });
  }

  /** 我的容器滚到底了：把原生页面往底部推，让 YouTube 自己的 continuation 去取下一批 */
  private loadMore(): void {
    if (this.loading || this.exhausted) return;
    this.loading = true;
    const before = this.seen.size;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, Math.max(0, max));
    const t0 = performance.now();
    const check = () => {
      if (this.dead) return;
      if (this.seen.size > before) { this.loading = false; return; }
      if (performance.now() - t0 > 2600) {
        this.loading = false;
        this.exhausted = true;
        this.setStatus('没有更多了');
        return;
      }
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  }

  private render(): void {
    this.panel = createYtSettings({
      get: () => this.settings,
      onChange: (patch) => { this.settings = { ...this.settings, ...patch }; void chrome.storage.local.get('margin:settings').then((r) => chrome.storage.local.set({ 'margin:settings': { ...(r['margin:settings'] as Settings), ...patch } })); this.update(this.settings); },
    });

    const head = createHeader({
      onTheme: () => this.toggleTheme(),
      onSearch: (q) => { location.href = searchUrl(q); },
      tabs: [
        ...SITE_LINKS,
        'separator',
        { title: '刷新', icon: ICONS.refresh, run: () => location.reload() },
        { title: '设置', icon: ICONS.gear, run: () => this.panel.open() },
      ],
    });
    this.head = head;

    // 首页不再放标题行：搜「推荐 / For You」那行在 MARGIN 里是编辑式的分区名，
    // 搬到这里只剩下重复信息，占掉一整块纵向空间。搜索页/频道页留一行显示当前关键词。
    const title = this.kind === 'search' ? `搜索 · ${this.query || ''}`.trim() : this.kind === 'channel' ? this.query : '';
    const bar = h('div', { class: 'bar' }, h('div', { class: 'eyebrow' }, h('span', {}, title)));
    bar.hidden = this.kind === 'home';

    this.grid = h('section', { class: 'grid home-grid', 'aria-live': 'polite' });
    this.status = h('div', { class: 'status' }, '正在读取推荐…');
    this.sentinel = h('div', { class: 'sentinel' });
    this.grid.append(skeleton(8));

    const exit = h('button', {
      class: 'ghost small', type: 'button',
      onclick: () => { sessionStorage.setItem('margin:off', '1'); document.getElementById('margin-hide')?.remove(); this.host.remove(); },
    }, icon(ICONS.exit), h('span', {}, '本次回到 YouTube 原版'));

    this.app = h('div', { class: 'app home' },
      this.bg.el,
      head.el,
      h('main', { class: 'main' }, bar, this.grid, this.status, this.sentinel,
        h('footer', { class: 'foot' }, exit, h('span', {}, 'MARGIN for YouTube · 非官方'))),
      this.panel.el,
    );
    this.app.dataset.cols = String(this.settings.cols || 'auto');
    this.root.append(this.app);

    const lg = filtersIn(this.root);
    head.glass.forEach((g) => attachGlass(g, lg));

    let scrollT = 0;
    // 滚动里做的事不少（重绘背景、同步原生滚动位置、判断触底），按帧合并一次；
    // 直接在 scroll 回调里跑会让 window.scrollTo 每帧强制一次布局，滚动明显发涩
    let raf = 0;
    this.app.addEventListener('scroll', () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        this.bg.redraw();
        if (!scrollT) { this.app.classList.add('scrolling'); this.bg.hold('scroll', true); }
        clearTimeout(scrollT);
        scrollT = window.setTimeout(() => { scrollT = 0; this.app.classList.remove('scrolling'); this.bg.hold('scroll', false); }, 140);
        syncNativeScroll(this.app.scrollTop, this.app.scrollHeight - this.app.clientHeight);
        const near = this.app.scrollHeight - this.app.scrollTop - this.app.clientHeight < 1200;
        if (near) this.loadMore();
      });
    }, { passive: true });
  }
}

function parseDur(t: string): number {
  const m = t.match(/(\d+):(\d+)(?::(\d+))?/);
  if (!m) return 0;
  return m[3] ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : Number(m[1]) * 60 + Number(m[2]);
}
