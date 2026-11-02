/**
 * 唯一的后台逻辑：把内容脚本的请求转发给本地壁纸服务（native messaging）。
 * 内容脚本不能直接调 sendNativeMessage，必须经过扩展页面/后台，所以留了这个 10 行的壳。
 */
chrome.runtime.onMessage.addListener((msg: { __marginNative?: boolean; payload?: Record<string, unknown> }, _sender, respond) => {
  if (!msg || msg.__marginNative !== true) return undefined;
  chrome.runtime.sendNativeMessage('margin_bg', msg.payload ?? {}, (res: unknown) => {
    const err = chrome.runtime.lastError;
    respond(err ? { ok: false, error: err.message } : res ?? { ok: false, error: '本地服务没有响应' });
  });
  return true;
});

/**
 * 贴片广告拦截。
 * 用动态规则而不是 manifest 里的静态规则集：静态规则只在扩展安装时注册一次，
 * 开发期热重装（webExtension.install 覆盖）不会刷新，规则会一直是旧的。
 * 拦三样：广告视频流（videoplayback 带 adformat 参数）、广告统计、广告脚本/图片。
 */
const AD_RULES: chrome.declarativeNetRequest.Rule[] = [
  // 广告统计与投放端点（不拦这些会持续给播放器下发广告决策）
  {
    id: 1,
    priority: 1,
    action: { type: 'block' },
    condition: { urlFilter: '||youtube.com/api/stats/ads', resourceTypes: ['xmlhttprequest', 'other'] },
  },
  {
    id: 2,
    priority: 1,
    action: { type: 'block' },
    condition: { urlFilter: '||youtube.com/pagead/', resourceTypes: ['xmlhttprequest', 'other', 'script'] },
  },
  {
    id: 3,
    priority: 1,
    action: { type: 'block' },
    condition: {
      urlFilter: '||doubleclick.net',
      resourceTypes: ['script', 'image', 'xmlhttprequest', 'sub_frame', 'media'],
    },
  },
  {
    id: 4,
    priority: 1,
    action: { type: 'block' },
    condition: {
      urlFilter: '||googlesyndication.com',
      resourceTypes: ['script', 'image', 'xmlhttprequest', 'sub_frame', 'media'],
    },
  },
  {
    id: 5,
    priority: 1,
    action: { type: 'block' },
    condition: {
      urlFilter: '||googleads.g.doubleclick.net',
      resourceTypes: ['script', 'image', 'xmlhttprequest', 'sub_frame', 'media'],
    },
  },
];

try {
  void chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: AD_RULES.map((r) => r.id),
    addRules: AD_RULES,
  });
} catch (e) {
  console.warn('[margin] 广告规则注册失败', e);
}
