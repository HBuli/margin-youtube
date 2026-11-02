/**
 * 背景文件夹：优先走本地壁纸服务（native messaging）——只记目录路径，每次随机现读一张，
 * 不复制文件、不占第二份磁盘。服务不可用时（比如 Chrome 版）回退到 IndexedDB 里存的副本。
 */
const DB = 'margin-bg-files';
const STORE = 'images';
/** 最多收 40 张、单张 8MB：再多就只是拖慢索引，壁纸用不到 */
const MAX_FILES = 40;
const MAX_BYTES = 8 * 1024 * 1024;

function openDb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

function req2<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export async function saveFolder(files: File[]): Promise<{ saved: number; skipped: number }> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  const st = tx.objectStore(STORE);
  st.clear();
  let saved = 0;
  let skipped = 0;
  for (const f of files) {
    if (saved >= MAX_FILES || !/^image\//.test(f.type) || f.size > MAX_BYTES) { skipped++; continue; }
    st.put(f, `${saved}|${f.name}`);
    saved++;
  }
  await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
  db.close();
  return { saved, skipped };
}

export async function countFolder(): Promise<number> {
  const db = await openDb();
  const n = (await req2(db.transaction(STORE, 'readonly').objectStore(STORE).getAllKeys())).length;
  db.close();
  return n;
}

export interface NativeRes {
  ok?: boolean;
  error?: string;
  cancelled?: boolean;
  dir?: string;
  count?: number;
  name?: string;
  dataUrl?: string;
}

/** 走 background 转发到本地壁纸服务；未安装或非 Firefox 时返回 { ok: false } */
export function nativeCall(payload: Record<string, unknown>): Promise<NativeRes> {
  return new Promise((res) => {
    try {
      chrome.runtime.sendMessage({ __marginNative: true, payload }, (r: NativeRes) => {
        const err = chrome.runtime.lastError;
        if (err) res({ ok: false, error: err.message });
        else res(r ?? { ok: false, error: '本地服务没有响应' });
      });
    } catch (e) {
      res({ ok: false, error: String(e) });
    }
  });
}

/** IndexedDB 回退方案的 objectURL */
let sessionUrl: string | null = null;
/** 本地服务给的 dataURL（只活在内存里，不落盘） */
let nativeUrl: string | null = null;

/** 一次会话里固定一张；force 时重新抽（用户刚换了文件夹） */
export async function randomUrl(force = false): Promise<string | null> {
  if (!force && nativeUrl) return nativeUrl;
  if (!force && sessionUrl) return sessionUrl;
  if (sessionUrl) { URL.revokeObjectURL(sessionUrl); sessionUrl = null; }
  nativeUrl = null;
  // 页面加载极早期背景层就初始化了，后台页可能还没注册监听，这里退避重试几次
  for (let i = 0; i < 6; i++) {
    const native = await nativeCall({ cmd: 'random' });
    if (native.ok && native.dataUrl) { nativeUrl = native.dataUrl; return nativeUrl; }
    if (native.error && !/Receiving end does not exist|Could not establish/i.test(native.error)) break;
    await new Promise((r) => setTimeout(r, 250 + i * 250));
  }
  const db = await openDb();
  const keys = await req2(db.transaction(STORE, 'readonly').objectStore(STORE).getAllKeys());
  if (!keys.length) { db.close(); return null; }
  const key = keys[Math.floor(Math.random() * keys.length)];
  const blob = await req2(db.transaction(STORE, 'readonly').objectStore(STORE).get(key) as IDBRequest<Blob | undefined>);
  db.close();
  if (!blob) return null;
  sessionUrl = URL.createObjectURL(blob);
  return sessionUrl;
}

export async function clearFolder(): Promise<void> {
  nativeUrl = null;
  if (sessionUrl) { URL.revokeObjectURL(sessionUrl); sessionUrl = null; }
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).clear();
  await new Promise<void>((res) => { tx.oncomplete = () => res(); tx.onerror = () => res(); });
  db.close();
}
