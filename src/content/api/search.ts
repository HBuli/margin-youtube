/** 搜索联想与热搜。
 *  YouTube 没有给页面用的联想接口，猜词只会在自己这边发请求，所以联想直接留空，
 * 由 hero-search 回落到本地搜索历史；热搜给一组固定的热门方向，点一下就是一条 YouTube 搜索。
 *  ——后面的稍后再看等函数是 MARGIN 原有的工具函数，保留签名给未打包的旧模块用。 */
export interface Suggest { term: string; html: string }
export interface Hot { keyword: string; name: string }

export async function suggest(_term: string, _signal?: AbortSignal): Promise<Suggest[]> {
  void _term; void _signal;
  return [];
}

const HOT: Hot[] = [
  { keyword: 'lofi hip hop radio', name: 'lofi 电台' },
  { keyword: '4K 风景 沉浸', name: '4K 风景' },
  { keyword: 'documentary', name: '纪录片' },
  { keyword: 'lecture', name: '讲座' },
  { keyword: 'live coding', name: '编程直播' },
  { keyword: 'jazz', name: '爵士' },
  { keyword: 'space documentary', name: '太空' },
  { keyword: 'ambient', name: '氛围音乐' },
];

export function hotSearch(): Promise<Hot[]> {
  return Promise.resolve(HOT);
}

const csrf = () => document.cookie.match(/(?:^|;\s*)bili_jct=([^;]+)/)?.[1] ?? '';

/** 加入稍后再看；未登录返回 false */
export async function addWatchLater(bvid: string): Promise<{ ok: boolean; msg: string }> {
  const token = csrf();
  if (!token) return { ok: false, msg: '登录 B 站后才能用稍后再看' };
  const r = await fetch('https://api.bilibili.com/x/v2/history/toview/add', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ bvid, csrf: token }),
  });
  const b = await r.json().catch(() => ({ code: -1 }));
  return b.code === 0 ? { ok: true, msg: '已加入稍后再看' } : { ok: false, msg: b.message || '没加上，稍后再试' };
}

const HKEY = 'margin:search-history';
export function searchHistory(): string[] {
  try { return JSON.parse(localStorage.getItem(HKEY) || '[]'); } catch { return []; }
}
export function rememberSearch(q: string): void {
  const list = [q, ...searchHistory().filter((x) => x !== q)].slice(0, 8);
  localStorage.setItem(HKEY, JSON.stringify(list));
}
export function forgetSearch(q?: string): void {
  localStorage.setItem(HKEY, JSON.stringify(q ? searchHistory().filter((x) => x !== q) : []));
}
export const searchUrl = (q: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;

export interface LaterItem { aid: number; bvid: string; title: string; cover: string; duration: number; progress: number; author: string; mid: number; addAt: number }
/** 稍后再看列表；未登录返回 null */
export async function watchLater(): Promise<LaterItem[] | null> {
  const r = await fetch('https://api.bilibili.com/x/v2/history/toview', { credentials: 'include' });
  const b = await r.json();
  if (b.code === -101) return null;
  if (b.code !== 0) throw new Error(b.message || `code ${b.code}`);
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  return ((b.data?.list ?? []) as any[]).map((v) => ({
    aid: v.aid, bvid: v.bvid, title: v.title, cover: (v.pic ?? '').replace(/^http:/, 'https:'), duration: v.duration ?? 0,
    progress: v.progress ?? 0, author: v.owner?.name ?? '', mid: v.owner?.mid ?? 0, addAt: v.add_at ?? 0,
  }));
}
export async function removeWatchLater(aid: number): Promise<boolean> {
  const token = csrf();
  if (!token) return false;
  const r = await fetch('https://api.bilibili.com/x/v2/history/toview/del', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ aid: String(aid), csrf: token }),
  });
  const b = await r.json().catch(() => ({ code: -1 }));
  return b.code === 0;
}
