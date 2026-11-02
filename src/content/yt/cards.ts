import type { YtVideo } from './data';
import { h } from '../ui/dom';

/**
 * 卡片渲染：复用 MARGIN 的设计系统（.card / .cover / .title / .meta 全在 styles.css 里），
 * 只把数据换成 YouTube 的。刻意不放「不感兴趣 / 屏蔽 UP」这类按钮——YouTube 自己有，
 * 这里只加一个「不看这个频道」，本地记住，不动 YouTube 的推荐。
 */

export interface CardOpts {
  onBlock?: (v: YtVideo) => void;
  compact?: boolean;
}

export function videoCard(v: YtVideo, index: number, opts: CardOpts = {}): HTMLElement {
  const url = `https://www.youtube.com/watch?v=${v.id}`;
  const cover = h('a', { class: 'cover', href: url, title: v.title, target: '_blank', rel: 'noopener' },
    h('img', { src: v.cover, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' }),
    // 时长徽标经常是懒渲染的：卡片刚进 DOM 时还没有，滚动到附近 YouTube 才补。
    // 所以这里始终留一个 span，先藏起来，由 YtApp.patchDurations() 事后填。
    h('span', { class: 'dur', 'data-live': String(v.duration === 'LIVE'), style: v.duration ? '' : 'display:none' }, v.duration),
    opts.onBlock
      ? h('div', { class: 'card-acts' },
          h('button', {
            class: 'card-block', type: 'button', title: `不看 ${v.channel} 的频道`,
            'aria-label': `屏蔽频道 ${v.channel}`,
            onclick: (e: Event) => { e.preventDefault(); e.stopPropagation(); opts.onBlock!(v); },
          }, h('span', {}, '不看这个频道')),
        )
      : null,
  );

  const meta = h('div', { class: 'meta' });
  const parts: HTMLElement[] = [];
  if (v.channel) {
    parts.push(v.channelUrl
      ? h('a', { class: 'author', href: v.channelUrl, target: '_blank', rel: 'noopener' }, v.channel)
      : h('span', { class: 'author' }, v.channel));
  }
  if (v.views) parts.push(h('span', {}, v.views));
  if (v.ago) parts.push(h('span', { class: 'm-ago' }, v.ago));
  parts.forEach((el, i) => {
    if (i) meta.append(h('span', { class: 'dot' }, '·'));
    meta.append(el);
  });

  return h('article', { class: `card${opts.compact ? ' compact' : ''}`, 'data-vid': v.id, style: `--i:${index % 12}` },
    cover,
    h('div', { class: 'body' },
      h('a', { class: 'title', href: url, title: v.title, target: '_blank', rel: 'noopener' }, v.title),
      meta,
    ),
  );
}

export function skeleton(n: number): DocumentFragment {
  const f = document.createDocumentFragment();
  for (let i = 0; i < n; i++) {
    f.append(h('div', { class: 'card sk' },
      h('div', { class: 'cover' }), h('div', { class: 'line' }), h('div', { class: 'line short' })));
  }
  return f;
}
