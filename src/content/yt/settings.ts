import type { Settings, ShaderId } from '../../shared/settings';
import { ZOOMS } from '../../shared/settings';
import { clearFolder, nativeCall } from './bgfolder';
import { block, chipInput, row, segmented, stepSlider, rangeSlider, toggle } from '../ui/controls';
import { createSheet } from '../ui/sheet';
import { h } from '../ui/dom';

/**
 * 精简设置面板：只留真正会改的东西（主题、背景、排版、过滤）。
 * 天气、足迹热力图、收藏夹、稍后再看这些 B 站专属模块没有移植——YouTube 自己有对应功能，
 * 再包一层只会和原站点重复。
 */

const SHADERS: ShaderId[] = ['aurora', 'silk', 'mesh', 'grain', 'ice', 'veil', 'smoke', 'neuro', 'flow', 'rays', 'blend', 'flux', 'gate'];
const SHADER_NAMES: Record<ShaderId, string> = {
  aurora: '极光', silk: '丝绸', mesh: '网格', grain: '颗粒', ice: '冰晶', veil: '薄纱', smoke: '烟', neuro: '神经',
  flow: '流动', rays: '光束', blend: '混色', flux: '汇流', gate: '门',
};

export interface YtPanel {
  el: HTMLElement;
  open(): void;
  close(): void;
}

export function createYtSettings(o: { get: () => Settings; onChange: (patch: Partial<Settings>) => void }): YtPanel {
  const s = o.get();
  const sheet = createSheet({ title: '设置', width: 420 });

  const bgOf = () => o.get().bg;
  const shaderBtn = h('button', { type: 'button', class: 'ghost small' }, `换一种：${SHADER_NAMES[s.bg.shader]}`);
  shaderBtn.addEventListener('click', () => {
    const cur = bgOf().shader;
    const next = SHADERS[(SHADERS.indexOf(cur) + 1) % SHADERS.length];
    o.onChange({ bg: { ...bgOf(), mode: 'fixed', shader: next } });
    shaderBtn.textContent = `换一种：${SHADER_NAMES[next]}`;
  });

  const shaderRow = row('背景样式', null, shaderBtn);
  const strRow = row('背景强度', '太亮会盖住内容', rangeSlider(s.bg.intensity, (v) => `${Math.round(v * 100)}%`, (v) => {
    o.onChange({ bg: { ...bgOf(), intensity: v } });
  }, '背景强度'));

  const pick = h('button', { type: 'button', class: 'ghost small' }, '选择文件夹…');
  const clear = h('button', { type: 'button', class: 'ghost small' }, '清除');
  const tip = h('span', { class: 'sd-hint' }, '');
  const imgRow = row('背景文件夹', '只记目录、不复制文件，每次打开随机一张', h('div', { class: 'sd-inline' }, pick, clear));
  imgRow.append(tip);

  void nativeCall({ cmd: 'info' }).then((r) => {
    if (tip.textContent) return;
    if (!r.ok) tip.textContent = `本地壁纸服务不可用：${r.error ?? '未知原因'}`;
    else if (r.dir) tip.textContent = `${r.dir}（${r.count ?? 0} 张）`;
    else tip.textContent = '还没选文件夹';
  });
  pick.addEventListener('click', async () => {
    pick.disabled = true;
    tip.textContent = '正在打开目录选择器…';
    const r = await nativeCall({ cmd: 'pickDir' });
    pick.disabled = false;
    if (r.cancelled) { tip.textContent = '已取消'; return; }
    if (!r.ok) { tip.textContent = `读取失败：${r.error ?? '未知原因'}`; return; }
    tip.textContent = `${r.dir}（${r.count ?? 0} 张）`;
    o.onChange({ bg: { ...bgOf(), mode: 'image', rev: (bgOf().rev || 0) + 1 } });
    sync();
  });
  clear.addEventListener('click', async () => {
    await nativeCall({ cmd: 'clear' });
    await clearFolder();
    o.onChange({ bg: { ...bgOf(), mode: 'off', rev: (bgOf().rev || 0) + 1 } });
    tip.textContent = '已清除';
    sync();
  });

  const bgMode = segmented<'shader' | 'image' | 'off'>(
    [['shader', '动态'], ['image', '图片'], ['off', '关闭']],
    s.bg.mode === 'image' ? 'image' : s.bg.mode === 'off' ? 'off' : 'shader',
    (v) => {
      o.onChange({ bg: { ...bgOf(), mode: v === 'shader' ? 'fixed' : v } });
      sync();
    },
  );
  const sync = () => {
    const m = o.get().bg.mode;
    const shader = m !== 'image' && m !== 'off';
    const image = m === 'image';
    shaderRow.hidden = !shader;
    strRow.hidden = !shader;
    imgRow.hidden = !image;
  };

  const theme = segmented<'auto' | 'light' | 'dark'>([['auto', '跟随系统'], ['light', '亮色'], ['dark', '暗色']], s.theme, (v) => o.onChange({ theme: v }));
  const cols = segmented<`${0 | 4 | 5}`>(['0', '4', '5'].map((x) => [x as `${0 | 4 | 5}`, x === '0' ? '自动' : `${x} 列`]), String(s.cols) as `${0 | 4 | 5}`, (v) => o.onChange({ cols: Number(v) as 0 | 4 | 5 }));
  const zoom = stepSlider([...ZOOMS], s.zoom, (v) => `${v}%`, (v) => o.onChange({ zoom: v as Settings['zoom'] }), '内容缩放');
  const titleFont = segmented<'serif' | 'sans'>([['serif', '宋体'], ['sans', '黑体']], s.titleFont, (v) => o.onChange({ titleFont: v }));
  const mono = toggle(s.monoNum, '数字等宽', (v) => o.onChange({ monoNum: v }));

  const kw = chipInput(s.filters.keywords, '标题里出现就隐藏，回车添加', (v) => o.onChange({ filters: { ...o.get().filters, keywords: v } }));
  const up = chipInput(s.filters.ups, '频道名，回车添加', (v) => o.onChange({ filters: { ...o.get().filters, ups: v } }));
  const dur = stepSlider([0, 60, 180, 300, 600, 1200, 1800], s.filters.minDuration, (n) => (n ? `${n / 60} 分钟以上` : '不限'), (v) => o.onChange({ filters: { ...o.get().filters, minDuration: v } }), '最短时长');

  sheet.body.append(
    block('主题', null, theme),
    block('背景', 'WebGL 着色器，或自己文件夹里的图', bgMode),
    shaderRow,
    strRow,
    imgRow,
    block('每行卡片', null, cols),
    block('内容缩放', null, zoom),
    block('标题字体', '衬线更有编辑感，无衬线更中性', titleFont),
    row('数字等宽', '时间、播放数这类数字用等宽字体', mono),
    block('标题关键词过滤', '匹配到的视频不显示，只影响这一页', kw),
    block('频道过滤', '按频道名隐藏', up),
    block('最短时长', null, dur),
    h('p', { class: 'sd-note' }, '设置存在本机。数据全部来自 YouTube 页面本身，不经过任何第三方服务器。'),
  );
  sync();

  return {
    el: sheet.el,
    open: () => sheet.open(),
    close: () => sheet.close(),
  };
}
