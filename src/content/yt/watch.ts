/**
 * 播放页接管。
 *
 * 和首页不同，这里**不重建** DOM：播放器（MSE/DRM/字幕/画质切换）、评论区、关联视频都保留原生节点，
 * 只做三件事——
 *   1. 原生顶栏让位（visibility:hidden，保留 56px 占位），换成 MARGIN 顶栏；
 *   2. 把所有推广位从布局里摘掉（display:none，含侧栏广告、商品/周边 shelf、赞助卡片）；
 *   3. 主题跟随设置（给 <html> 切 dark 属性，原生配色跟着变）。
 *
 * 为什么不搬播放器：把 #movie_player 移到别处会触发组件重新挂载，结果是黑屏或丢播放进度。
 */
import type { Settings } from '../../shared/settings';
import { createHeader, SITE_LINKS, type Header } from '../ui/header';
import { createYtSettings } from './settings';
import { h, ICONS } from '../ui/dom';
import { searchUrl } from '../api/search';
import css from '../styles.css?inline';

/** 注进 document 的样式：只动原生页面，不碰 shadow 里的界面 */
const WATCH_CSS = `
/* 原生顶栏让位：用 visibility 而不是 display，保留它占的 56px，否则内容整体上移、播放器顶部会被顶栏压住 */
#masthead-container, ytd-masthead { visibility: hidden !important; }

/* 推广位：播放页所有已知的广告 / 赞助 / 商品 / 会员推销容器 */
ytd-ad-slot-renderer,
ytd-promoted-sparkles-web-renderer,
ytd-promoted-video-renderer,
ytd-compact-promoted-video-renderer,
ytd-display-ad-renderer,
ytd-in-feed-ad-layout-renderer,
ytd-companion-slot-renderer,
ytd-action-companion-ad-renderer,
ytd-merch-shelf-renderer,
ytd-ticket-shelf-renderer,
ytd-brand-video-shelf-renderer,
ytd-brand-video-singleton-renderer,
ytd-primetime-promo-renderer,
yt-mealbar-promo-renderer,
ytd-inline-survey-renderer,
ytd-statement-banner-renderer,
#player-ads,
#masthead-ad,
ytd-engagement-panel-section-list-renderer[target-id*="ads"],
ytd-engagement-panel-section-list-renderer[target-id*="sparkles"],
/* 播放器里的所有广告 UI：横幅、浮层、底条、广告徽标、可跳过按钮的容器、优惠卡片。
   跳过按钮本身被藏了也能用 JS click()，所以不影响自动跳过。 */
[class*="ytp-ad-"],
.ytp-suggested-action,
.ytp-featured-product,
.ytp-ad-overlay-container,
.ytp-ad-player-overlay,
.ytp-ad-player-overlay-layout,
.ytp-ad-action-interstitial,
.ytp-ad-survey,
.ytp-ad-overlay-slot,
.ytp-ad-badge,
.ytp-ad-progress,
ytd-comments ytd-product-list-renderer,
yt-promo-popup,
#sponsor-button { display: none !important; }

/* 刻意不隐藏 ytd-enforcement-message-view-model：那是「播放已停止」对话框，
   藏掉只会让用户看不到原因。 */

/* 视频下方：保留 频道行（头像/名称/订阅）+ 点赞栏 + 观看数日期 + 标题，
   去掉 描述、展开、话题 chips、商品货架、「加入」会员 */
ytd-watch-metadata #bottom-row,
ytd-watch-metadata #description,
ytd-watch-metadata #description-inline-expander,
ytd-watch-metadata #meta-contents,
ytd-watch-metadata ytd-metadata-row-container-renderer,
ytd-watch-metadata ytd-clarification-renderer,
ytd-watch-metadata #ticket-shelf { display: none !important; }
/* 点赞栏里的下载 / 剪辑 / 会员相关按钮仍然去掉，只留 赞、踩、分享、保存 */
ytd-watch-metadata #actions ytd-download-button-renderer,
ytd-watch-metadata #actions ytd-button-renderer[is-download-button],
ytd-watch-metadata #actions ytd-clip-section-renderer,
ytd-watch-metadata #actions yt-button-shape button[aria-label*="剪辑"],
ytd-watch-metadata #actions yt-button-shape button[aria-label*="下载"] { display: none !important; }
/* 频道行跟 MARGIN 统一：头像正圆、名字用无衬线、订阅按钮胶囊化 */
ytd-watch-metadata #owner #avatar img,
ytd-watch-metadata #owner yt-img-shadow img { border-radius: 50% !important; }
ytd-watch-metadata #owner #channel-name,
ytd-watch-metadata #owner #channel-name a { font: 500 14px/1.3 var(--margin-sans) !important; }
ytd-watch-metadata #owner #subscribe-button yt-button-shape button,
ytd-watch-metadata #owner #subscribe-button button { border-radius: 999px !important; }
ytd-watch-metadata #meta { font: 400 12.5px/1.5 var(--margin-sans) !important; color: rgba(255,255,255,.6); }
/* 标题用 MARGIN 的标题字体，跟顶栏、首页统一 */
ytd-watch-metadata #title h1,
ytd-watch-metadata h1.ytd-watch-metadata {
  font-family: "Instrument Serif", "Margin Serif SC", "Noto Serif SC", Georgia, serif !important;
  font-weight: 400 !important; letter-spacing: .01em;
}

/* ── 两栏比例 8:2 ──
   原生是 flex，secondary 会被撑到 500 多（和左边对半），这里按主栏 80% / 侧栏 20% 分配 */
ytd-watch-flexy:not([fullscreen]) #columns.ytd-watch-flexy { gap: 28px; padding: 0 20px 0 16px; }
ytd-watch-flexy:not([fullscreen]) #primary.ytd-watch-flexy { flex: 0 0 calc(80% - 38px) !important; max-width: none !important; }
ytd-watch-flexy:not([fullscreen]) #secondary.ytd-watch-flexy { flex: 1 1 0 !important; min-width: 0 !important; max-width: none !important; }

/* ── 视觉统一成 MARGIN ── */
ytd-watch-flexy {
  --margin-sans: "Geist", "Margin Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
  --margin-serif: "Instrument Serif", "Margin Serif SC", "Noto Serif SC", Georgia, serif;
}
/* 播放器圆角（剧场/全屏不动） */
ytd-watch-flexy:not([fullscreen]):not([theater]) #player-container-inner { border-radius: 16px; overflow: hidden; }
/* 评论区：字体、留白、去重分隔线 */
ytd-comments { font-family: var(--margin-sans); }
ytd-comments #header.ytd-comments { border-bottom: 0; padding-bottom: 4px; }
ytd-comments #header #count { font: 400 15px/1 var(--margin-serif); color: rgba(255,255,255,.62); }
ytd-comment-thread-renderer { padding: 12px 0; }
ytd-comment-thread-renderer #author-text { font: 600 13px/1.3 var(--margin-sans); color: var(--yt-spec-text-primary); }
ytd-comment-thread-renderer #content-text a { color: #00aeec; }
/* 关联视频：胶囊化卡片 + MARGIN 字体 */
#secondary ytd-compact-video-renderer,
#secondary yt-lockup-view-model {
  border-radius: 12px; padding: 6px; margin: 0 -6px;
  transition: background .2s cubic-bezier(.23,1,.32,1);
}
#secondary ytd-compact-video-renderer:hover,
#secondary yt-lockup-view-model:hover { background: rgba(255,255,255,.06); }
#secondary ytd-thumbnail,
#secondary yt-thumbnail-view-model,
#secondary .yt-lockup-view-model__content-image { border-radius: 10px; overflow: hidden; }
/* 侧栏里的推广视频：新版用 feed-ad-metadata-view-model，旧版是 promoted-* */
#secondary yt-lockup-view-model:has(feed-ad-metadata-view-model),
#secondary yt-lockup-view-model:has(.ytwFeedAdMetadataViewModelHostIsClickableAdComponent),
#secondary ytd-compact-video-renderer:has(ytd-ad-slot-renderer),
#secondary ytd-promoted-video-renderer,
#secondary ytd-compact-promoted-video-renderer,
#secondary ytd-promoted-sparkles-web-renderer,
#secondary ytd-display-ad-renderer { display: none !important; }

/* 关联视频改成上下布局：封面在上、标题在下，标题能拿满整行宽度 */
#secondary ytd-compact-video-renderer #dismissible.ytd-compact-video-renderer {
  display: flex !important; flex-direction: column !important; gap: 8px;
}
#secondary ytd-compact-video-renderer ytd-thumbnail.ytd-compact-video-renderer,
#secondary ytd-compact-video-renderer #thumbnail {
  width: 100% !important; min-width: 0 !important; margin: 0 !important;
}
#secondary ytd-compact-video-renderer #thumbnail img { width: 100% !important; height: auto !important; }
#secondary ytd-compact-video-renderer .details.ytd-compact-video-renderer,
#secondary ytd-compact-video-renderer #details { margin: 0 !important; padding: 0 !important; }
/* 新版 view-model 卡片（YouTube 现在侧栏全用它，class 是 camelCase 不带连字符）：
   .ytLockupViewModelHost 原本是 flex row → 改成 column，封面撑满、标题拿整行 */
#secondary div.ytLockupViewModelHost { flex-direction: column !important; gap: 8px; }
#secondary a.ytLockupViewModelContentImage { width: 100% !important; min-width: 0 !important; }
#secondary a.ytLockupViewModelContentImage yt-thumbnail-view-model,
#secondary .ytThumbnailViewModelImage { width: 100% !important; }
#secondary div.ytLockupViewModelMetadata { width: 100% !important; min-width: 0 !important; }
#secondary .ytLockupMetadataViewModelTextContainer { width: 100% !important; }
#secondary .ytLockupMetadataViewModelMenuButton { display: none !important; }

/* 评论卡片化：每条评论一张圆角卡，回复缩进在卡内 */
ytd-comments ytd-comment-thread-renderer {
  display: block;
  position: relative;
  margin: 0 0 10px; padding: 16px 18px;
  border-radius: 14px;
  background: rgba(0, 0, 0, .028);
  transition: background .2s cubic-bezier(.23,1,.32,1);
}

/* 评论正文放大：原来 14px 在 990px 宽的卡里只占三分之一，右侧全是空白 */
ytd-comment-thread-renderer #expander #content,
ytd-comment-thread-renderer #content-text,
ytd-comment-thread-renderer yt-attributed-string {
  font: 400 15.5px/1.72 var(--margin-sans) !important;
  letter-spacing: .003em;
}
ytd-comment-thread-renderer #expander { --ytd-expander-max-lines: 10; padding-right: 128px; }
ytd-comment-thread-renderer #more-replies,
ytd-comment-thread-renderer #expand,
ytd-comment-thread-renderer tp-yt-paper-button#more {
  font: 500 12.5px/1.4 var(--margin-sans) !important;
  color: rgba(255, 255, 255, .62) !important;
}

/* 点赞 / 点踩 / 回复：从正文下面抽出来，竖排放到卡片右侧当按钮 */
ytd-comment-view-model #action-buttons {
  position: absolute; right: 14px; top: 14px;
  width: auto !important; margin: 0 !important;
}
ytd-comments ytd-comment-view-model ytd-comment-engagement-bar #toolbar {
  display: flex !important; flex-direction: column !important; align-items: stretch !important;
  gap: 6px !important; width: 106px !important; min-width: 106px !important;
}
ytd-comments ytd-comment-view-model #toolbar ytd-toggle-button-renderer,
ytd-comments ytd-comment-view-model #toolbar ytd-button-renderer,
ytd-comments ytd-comment-view-model #toolbar yt-button-shape {
  display: block !important; width: 100% !important;
}
ytd-comments ytd-comment-view-model #toolbar button.ytSpecButtonShapeNextHost {
  width: 100% !important; min-width: 0 !important; max-width: none !important; justify-content: center;
  border-radius: 999px; padding: 5px 10px;
  border: 1px solid rgba(0, 0, 0, .1);
  background: rgba(0, 0, 0, .03);
  font: 500 12.5px/1.2 var(--margin-sans);
  transition: background .18s var(--ease-out), border-color .18s var(--ease-out);
}
html[dark] ytd-comment-view-model #toolbar button.ytSpecButtonShapeNextHost {
  border-color: rgba(255, 255, 255, .12);
  background: rgba(255, 255, 255, .05);
}
ytd-comment-view-model #toolbar button.ytSpecButtonShapeNextHost:hover {
  background: rgba(0, 0, 0, .07);
  border-color: rgba(0, 0, 0, .18);
}
html[dark] ytd-comment-view-model #toolbar button.ytSpecButtonShapeNextHost:hover {
  background: rgba(255, 255, 255, .1);
  border-color: rgba(255, 255, 255, .22);
}
ytd-comment-view-model #toolbar #vote-count-middle { font: 500 12.5px/1 var(--margin-sans); }
ytd-comment-view-model #toolbar #creator-heart { display: none !important; }
html[dark] ytd-comments ytd-comment-thread-renderer { background: rgba(255, 255, 255, .045); }
ytd-comments ytd-comment-thread-renderer:hover { background: rgba(0, 0, 0, .045); }
html[dark] ytd-comments ytd-comment-thread-renderer:hover { background: rgba(255, 255, 255, .065); }
ytd-comments ytd-comment-thread-renderer ytd-comment-replies-renderer { margin-top: 8px; }
ytd-comment-renderer #author-thumbnail.ytd-comment-renderer img,
ytd-comment-renderer #author-thumbnail img { border-radius: 50% !important; }

#secondary #video-title,#secondary #video-title,
#secondary .ytLockupMetadataViewModelTitle,
#secondary .yt-lockup-metadata-view-model__title,
#secondary yt-formatted-string#video-title {
  font: 500 13.5px/1.45 var(--margin-sans) !important; letter-spacing: .005em;
}
#secondary #metadata-line span,
#secondary .yt-content-metadata-view-model__metadata-row,
#secondary .yt-content-metadata-view-model__metadata-text {
  font: 400 12px/1.5 var(--margin-sans) !important; color: rgba(255,255,255,.52);
}

/* 侧栏只留关联视频：横排卡片、chips、「继续观看」这类穿插模块全部去掉 */
ytd-watch-next-secondary-results-renderer ytd-rich-shelf-renderer,
ytd-watch-next-secondary-results-renderer ytd-horizontal-card-list-renderer,
ytd-watch-next-secondary-results-renderer #chips { display: none !important; }
`;

/** shadow 内部：外壳只做顶栏，其余区域透明、不接收点击，让原生播放器照常可操作 */
const LOCAL_CSS = `
.app.watch-shell { position: fixed; inset: 0; background: transparent; overflow: visible; pointer-events: none; }
.app.watch-shell .top { position: fixed; top: 0; left: 0; right: 0; height: 56px; padding: 0 24px; pointer-events: auto; }
.app.watch-shell .top .brand .mark { width: 32px; height: 32px; border-radius: 10px; }
`;

export class YtWatch {
  readonly host: HTMLElement;
  private root: ShadowRoot;
  private app!: HTMLElement;
  private head!: Header;
  private panel!: ReturnType<typeof createYtSettings>;
  private media = matchMedia('(prefers-color-scheme: dark)');
  private lastTheme = '';
  private dead = false;
  private styleEl: HTMLStyleElement | null = null;
  private adTimer = 0;
  private adSaved: { muted: boolean; rate: number } | null = null;
  /** 自动翻译：已经点过的按钮，避免反复点 */
  private trSeen = new WeakSet<Element>();
  private trTimer = 0;
  /** 当前这段广告是否已经跳过（每段只 seek 一次，来回 seek 会闪） */
  private adSeeked = false;

  constructor(private settings: Settings) {
    this.host = h('div', { id: 'margin-root' });
    this.root = this.host.attachShadow({ mode: 'open' });
    this.root.append(h('style', {}, css));
    this.render();
    this.applyTheme();
    this.media.addEventListener('change', () => this.applyTheme());
  }

  private resolvedTheme(): 'light' | 'dark' {
    return this.settings.theme === 'auto' ? (this.media.matches ? 'dark' : 'light') : this.settings.theme;
  }

  private applyTheme(): void {
    const t = this.resolvedTheme();
    this.app.dataset.theme = t;
    this.app.dataset.palette = this.settings.palette;
    this.head?.sunMoon.set(t);
    // 原生配色跟随：YouTube 自己也是靠 <html dark> 切暗色
    document.documentElement.toggleAttribute('dark', t === 'dark');
    this.lastTheme = this.settings.theme;
  }

  private render(): void {
    this.panel = createYtSettings({
      get: () => this.settings,
      onChange: (patch) => {
        this.settings = { ...this.settings, ...patch };
        void chrome.storage.local.get('margin:settings').then((r) => chrome.storage.local.set({ 'margin:settings': { ...(r['margin:settings'] as Settings), ...patch } }));
        this.update(this.settings);
      },
    });

    this.head = createHeader({
      tabs: [
        ...SITE_LINKS,
        'separator',
        { title: '刷新', icon: ICONS.refresh, run: () => location.reload() },
        { title: '设置', icon: ICONS.gear, run: () => this.panel.open() },
      ],
      onTheme: () => this.update({ ...this.settings, theme: this.resolvedTheme() === 'dark' ? 'light' : 'dark' }),
      onSearch: (q) => { location.href = searchUrl(q); },
    });

    // 设置面板必须挂在 .app 内部：主题变量（--ink/--canvas/--surface）定义在 .app 上，
    // 放到外面就拿不到，面板会退化成黑字黑底
    this.app = h('div', { class: 'app watch-shell' }, this.head.el, this.panel.el);
    this.root.append(h('style', {}, LOCAL_CSS), this.app);
  }

  /**
   * 贴片广告：CSS 拦不住（它在 video 里播），这里用「静音 + 16 倍速」让它来不及播完就过。
   * 为什么不直接设 currentTime：跳过会被判定为无效观看，YouTube 会拒绝放正片。
   * 广告结束（.ad-showing 消失）后还原用户自己的静音/倍速状态。
   */
  /**
   * 评论区自动翻译成中文。
   * YouTube 只对「语言和界面语言不同」的评论渲染翻译按钮（#translate-button），
   * 所以这里不需要判断语种：有按钮就点，点过的记下来，避免重复触发。
   */
  private autoTranslate(): void {
    // 真实结构（2026-11 实测）：<ytd-tri-state-button-view-model class="translate-button" state="untoggled">
    //   <tp-yt-paper-button role="button">翻译成中文（中国）</tp-yt-paper-button></...>
    // 既没有 id="translate-button"，也不是 <button>，所以按 class 找、点里面的 paper-button。
    const btns = document.querySelectorAll<HTMLElement>('.translate-button');
    btns.forEach((b) => {
      if (b.getAttribute('state') === 'toggled') {
        this.trSeen.add(b);
        return;
      }
      if (this.trSeen.has(b)) return;
      this.trSeen.add(b);
      const target = b.querySelector<HTMLElement>('tp-yt-paper-button, button') ?? b;
      target.click();
    });
  }

  private guardAds(): void {
    const player = document.querySelector<HTMLElement>('.html5-video-player.ad-showing');
    const video = document.querySelector<HTMLVideoElement>('#movie_player video, .html5-video-player video');
    if (!player) {
      if (this.adSaved && video) {
        video.muted = this.adSaved.muted;
        video.playbackRate = this.adSaved.rate;
        this.adSaved = null;
        this.adSeeked = false;
      }
      return;
    }
    if (!video) return;
    if (!this.adSaved) {
      this.adSaved = { muted: video.muted, rate: video.playbackRate };
      this.adSeeked = false;
    }
    video.muted = true;
    if ((video.playbackRate as number) !== 16) video.playbackRate = 16;
    // 每段广告只把播放位置拖到结尾一次：反复 seek 会让画面来回跳（用户看到的就是「一闪一闪」）
    if (!this.adSeeked && Number.isFinite(video.duration) && video.duration > 0.6) {
      this.adSeeked = true;
      try { video.currentTime = Math.max(0, video.duration - 0.05); } catch { /* 某些 SABR 流不允许 seek，忽略 */ }
    }
    // 「跳过广告」按钮一出现就点掉；网络层拦截在 background 的动态规则里，这里只做兜底
    const skip = document.querySelector<HTMLElement>(
      '.ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button',
    );
    if (skip && skip.offsetParent !== null) skip.click();
  }

  mount(): void {
    if (this.host.isConnected) return;
    document.documentElement.append(this.host);
    this.adTimer = window.setInterval(() => this.guardAds(), 400);
    // 评论是懒加载的，1.2s 扫一次比 MutationObserver 简单，开销可以忽略
    this.trTimer = window.setInterval(() => this.autoTranslate(), 1200);
    this.autoTranslate();
    if (!document.getElementById('margin-watch')) {
      const st = document.createElement('style');
      st.id = 'margin-watch';
      st.textContent = WATCH_CSS;
      document.head.append(st);
      this.styleEl = st;
    }
  }

  update(s: Settings): void {
    this.settings = s;
    if (this.lastTheme !== s.theme) this.applyTheme();
  }

  destroy(): void {
    if (this.dead) return;
    this.dead = true;
    clearInterval(this.adTimer);
    clearInterval(this.trTimer);
    this.styleEl?.remove();
    this.styleEl = null;
    this.host.remove();
    // 退出播放页时把主题还原成跟随系统，别把首页染成我们设的颜色
    document.documentElement.removeAttribute('dark');
    if (matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.setAttribute('dark', '');
  }
}
