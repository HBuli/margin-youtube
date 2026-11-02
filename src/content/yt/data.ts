/**
 * YouTube 数据层。
 *
 * 不调 InnerTube（要签名 / PO Token，且属于非官方接口），直接读页面已经渲染好的 DOM：
 * - 首页 / 频道页：ytd-rich-item-renderer，内部现在是 yt-lockup-view-model（h3 + yt-content-metadata-view-model）
 * - 搜索结果：ytd-video-renderer（#video-title + #metadata-line / span.inline-metadata-item）
 * - 旧版频道页：ytd-grid-video-renderer
 *
 * 2026-11 实测结构（无头 Firefox + WebDriver BiDi 探测）：
 *   搜索页 ytd-video-renderer：标题 #video-title，元数据 span.inline-metadata-item ["189万","5年前"]，
 *     时长在 ytd-thumbnail-overlay-time-status-renderer .ytBadgeShapeText（"10:30"）。
 *   频道/首页 ytd-rich-item-renderer > yt-lockup-view-model：标题 h3 a.ytLockupMetadataViewModelTitle，
 *     元数据 span.ytContentMetadataViewModelMetadataText ["55万","2周前"]，
 *     时长在 yt-thumbnail-badge-view-model badge-shape .ytBadgeShapeText（"8:00:00"）。
 * YouTube 改 DOM 时只需要在这个文件里补选择器。
 */

export interface YtVideo {
  /** YouTube videoId */
  id: string;
  title: string;
  channel: string;
  channelUrl: string;
  cover: string;
  /** 时长文本，已经格式化好的 "12:34"；直播为 "LIVE" */
  duration: string;
  /** 「1.2万次观看」「3天前」这类原始文本，YouTube 自己本地化好了，直接用 */
  views: string;
  ago: string;
}

const WATCH = /\/watch\?(?:[^#]*&)?v=([\w-]{6,})/;
const ITEM = [
  'ytd-rich-item-renderer',
  'ytd-video-renderer',
  'ytd-grid-video-renderer',
  'ytd-compact-video-renderer',
  // YouTube 正在把卡片迁到 view-model：首页/频道页有时整块都是 yt-lockup-view-model，
  // 外层容器也不再是 ytd-rich-grid-renderer，所以它必须算一种卡片。
  'yt-lockup-view-model',
].join(', ');

/** 广告 / 推广容器的选择器：命中任意一个就整张卡丢掉 */
const AD = [
  '#promoted',
  'ytd-promoted-video-renderer',
  'ytd-ad-slot-renderer',
  'ytd-in-feed-ad-layout-renderer',
  'ytd-display-ad-renderer',
  'ytd-compact-promoted-video-renderer',
].join(', ');

/** 时长 / 直播 / 赞助徽标文本 */
const BADGE = 'badge-shape, .yt-badge-shape, yt-badge-supported-renderer';

const TIME_RE = /^\d{1,2}:\d{2}(:\d{2})?$/;

export const videoIdOf = (href: string): string | null => href.match(WATCH)?.[1] ?? null;

const text = (el: Element | null): string => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

/** 依次试选择器，返回第一个命中的元素（新版 YouTube 把数据包进 view-model 自定义元素） */
function first(root: Element, sels: string[]): Element | null {
  for (const s of sels) { const n = root.querySelector(s); if (n) return n; }
  return null;
}

function coverOf(item: Element, id: string): string {
  const img = item.querySelector('img') as HTMLImageElement | null;
  const src = img?.getAttribute('src') || img?.getAttribute('data-thumb') || '';
  if (src && !src.startsWith('data:')) return src;
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

/**
 * 时长：老版在 ytd-thumbnail-overlay-time-status-renderer，#text 或 .ytBadgeShapeText；
 * 新版 lockup 卡片在 yt-thumbnail-badge-view-model > badge-shape > .ytBadgeShapeText。
 * 只认 "1:23" / "1:02:03" / "LIVE"，避免把 "4K"、"直播" 之外的画质徽标当时长。
 */
function durationOf(item: Element): string {
  const sels = [
    'ytd-thumbnail-overlay-time-status-renderer #text',
    'ytd-thumbnail-overlay-time-status-renderer .ytBadgeShapeText',
    'yt-thumbnail-badge-view-model .ytBadgeShapeText',
    'yt-thumbnail-badge-view-model badge-shape',
    '#overlays badge-shape',
    'badge-shape .badge-shape-wiz__text',
    '.yt-badge-shape__text',
  ];
  for (const s of sels) {
    for (const el of item.querySelectorAll(s)) {
      const t = text(el);
      if (TIME_RE.test(t)) return t;
      if (/^(LIVE|直播)$/i.test(t)) return 'LIVE';
    }
  }
  if (item.querySelector('a[href*="/shorts/"]')) return 'SHORTS';
  return '';
}

/**
 * 「观看数」和「发布时间」。实测三种结构：
 * - 搜索页新：span.inline-metadata-item → ["189万", "5年前"]
 * - 首页/频道页新：span.ytContentMetadataViewModelMetadataText → ["55万", "2周前"]
 * - 旧版：#metadata-line span
 * `.ytd-video-meta-block span` 会把整段 byline 拼成一个大串（"Lofi Girl • • 1万人正在观看"），
 * 所以过滤掉过长的文本。
 */
function metaOf(item: Element): { views: string; ago: string } {
  const sel = [
    '#metadata-line span',
    'span.inline-metadata-item',
    '.ytContentMetadataViewModelMetadataText',
    '.yt-content-metadata-view-model__metadata-row span',
    '.ytd-video-meta-block span',
  ].join(', ');
  const spans = [...item.querySelectorAll(sel)].map((s) => text(s)).filter((s) => s && s.length <= 24);
  const uniq = [...new Set(spans)];
  let views = '';
  let ago = '';
  for (const s of uniq) {
    if (!ago && /前|ago|首播|直播|Streamed|星期|小时|分钟|刚刚/i.test(s)) ago = s;
    else if (!views && /观看|views?|万|亿|[KM]\b|회|再生/.test(s)) views = s;
  }
  return { views, ago };
}

export function parseItem(item: Element): YtVideo | null {
  const a = first(item, ['a#video-title', 'a#video-title-link', 'a#thumbnail[href*="/watch"]', 'a[href*="/watch?v="]']) as HTMLAnchorElement | null;
  const href = a?.href ?? first(item, ['a[href*="/watch?v="]'])?.getAttribute('href') ?? '';
  const id = videoIdOf(href) ?? videoIdOf(location.href + href);
  if (!id) return null;

  const title = (
    text(item.querySelector('#video-title'))
    || text(first(item, ['h3 a.ytLockupMetadataViewModelTitle', 'h3 a', '#video-title-link']))
    || a?.getAttribute('title')
    || ''
  ).trim();
  if (!title) return null;

  const chA = first(item, [
    'ytd-channel-name a', '#channel-name a',
    '.ytContentMetadataViewModelMetadataRow a[href^="/@"]',
    'a[href^="/@"]', 'a[href^="/channel/"]', 'a[href^="/c/"]',
  ]) as HTMLAnchorElement | null;
  const channel = text(chA) || text(first(item, ['ytd-channel-name', '#channel-name'])) || '';
  const channelUrl = chA?.getAttribute('href') ? new URL(chA.getAttribute('href')!, location.origin).href : '';

  const { views, ago } = metaOf(item);
  return { id, title, channel, channelUrl, cover: coverOf(item, id), duration: durationOf(item), views, ago };
}

/** 广告判断：广告容器，或徽标里写着「赞助 / Sponsored / 推广」 */
function isAd(item: Element): boolean {
  if (item.matches(AD) || item.querySelector(AD)) return true;
  const badge = text(item.querySelector(BADGE));
  return /赞助|sponsored|推广|promoted/i.test(badge);
}

/**
 * 从 root 里收集视频；seen 用来跨批次去重（YouTube 滚动加载时会把同一张卡片挪位置重渲染）。
 * 返回本次新发现的卡片。
 */
export function collectVideos(root: ParentNode, seen: Set<string>): YtVideo[] {
  const out: YtVideo[] = [];
  for (const item of root.querySelectorAll(ITEM)) {
    // 整行货架（Shorts 架、分类架、feed nudge）与广告跳过
    if (item.closest('ytd-rich-section-renderer')) continue;
    if (isAd(item)) continue;
    const v = parseItem(item);
    if (!v || seen.has(v.id)) continue;
    seen.add(v.id);
    out.push(v);
  }
  return out;
}

/** 页面上所有卡片按 id 建索引：用来事后补时长（YouTube 的时长徽标是懒渲染的） */
export function parseAll(): Map<string, YtVideo> {
  const m = new Map<string, YtVideo>();
  for (const item of document.querySelectorAll(ITEM)) {
    const v = parseItem(item);
    if (v && !m.has(v.id)) m.set(v.id, v);
  }
  return m;
}

/** 页面上真正装视频的容器：优先网格，其次搜索结果列表 */
export function feedRoot(): ParentNode {
  return document.querySelector('ytd-rich-grid-renderer')
    ?? document.querySelector('ytd-section-list-renderer')
    ?? document.querySelector('ytd-two-column-browse-results-renderer')
    ?? document.querySelector('ytd-browse')
    ?? document;
}

/** 列表页（搜索结果）的卡片比首页窄，样式上要走 compact 变体 */
export const isListPage = (): boolean => location.pathname === '/results';

/**
 * 监听 YouTube 自己往 DOM 里追加的新卡片。
 * 原生页面只是 visibility:hidden（不删 DOM、不 display:none），它的脚本、滚动和无限加载都照常跑，
 * 所以这里只需要等它把新卡片插进来。
 */
export function observeFeed(onNew: (v: YtVideo[], seen: Set<string>) => void, seen: Set<string>, ms = 250): () => void {
  let t = 0;
  const scan = () => {
    t = 0;
    const v = collectVideos(feedRoot(), seen);
    if (v.length) onNew(v, seen);
  };
  const mo = new MutationObserver(() => { if (!t) t = window.setTimeout(scan, ms); });
  mo.observe(document.documentElement, { childList: true, subtree: true });
  return () => { mo.disconnect(); if (t) clearTimeout(t); };
}

/**
 * 无限加载：把「我的滚动」同步给原生页面，让 YouTube 自己的 continuation 继续取数据。
 * 我的容器是 position:fixed，原生页面在底下是正常文档流，滚 window 才有效。
 */
export function syncNativeScroll(top: number, mineScrollable: number): void {
  const nativeMax = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  if (nativeMax < 1 || mineScrollable < 1) return;
  const ratio = Math.min(1, Math.max(0, top / mineScrollable));
  window.scrollTo(0, ratio * nativeMax);
}
