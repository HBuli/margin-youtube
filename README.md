<div align="center">

<h1>MARGIN · YouTube</h1>

<p><strong>给 YouTube 换一个更清晰的界面。</strong></p>
<p>接管式重排版：首页、搜索、频道页由扩展重画，播放页保留原生播放器，只做去广告与样式统一。</p>

<p>
  <img src="https://img.shields.io/badge/browser-Chrome%20%2F%20Firefox-535b66" alt="支持 Chrome 与 Firefox" />
  <img src="https://img.shields.io/badge/extension-Manifest%20V3-535b66" alt="Manifest V3" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-535b66" alt="MIT 许可" /></a>
</p>

</div>

## 这是什么

YouTube 的推荐流用起来太重：一堆穿插模块、推广卡、横向货架，真正想看的视频被挤在中间。

MARGIN 的做法和换肤插件不同 —— 它在 `document_start` 把原站藏起来，用 Shadow DOM + 原生 TypeScript/CSS 重建首页、搜索页、频道页的排版，数据直接从页面已渲染的 DOM 里读（不调 InnerTube、不做签名破解）。播放页不重建 DOM，只挂一层统一样式和 MARGIN 顶栏，播放器、字幕、评论区、关联视频都是原生的。

设计语言沿用 [bilibili-margin](https://github.com/jiuyang5354/bilibili-margin)：编辑式排版、液态玻璃控件、13 款 WebGL 动态背景、六层软阴影。

## 功能

- **首页 / 搜索 / 频道页重排**：响应式卡片网格，列数、缩放（70%–120%）、标题字体可调
- **去广告**：推荐流里的推广卡、侧栏推广视频、播放器广告 UI 全部隐藏；贴片广告静音并加速通过
- **无限滚动**：滚动到底自动触发 YouTube 自身的 continuation
- **播放页**：8:2 主副栏、评论卡片化、评论自动翻译成中文、关联视频上下布局
- **过滤**：关键词（支持 `/正则/`）、频道黑名单、最短时长；默认内置一批仇恨/歧视词
- **动态背景**：13 款 WGSL 着色器，或选一个本地文件夹每次随机一张图（走 Native Messaging，不复制文件）
- **顶栏**：首页按钮、搜索（`Ctrl+K`）、订阅/热门/稍后看/历史/我的、主题切换、设置面板

## 安装

**Chrome / Edge**：解压 `margin-youtube-chrome.zip` → `chrome://extensions` → 打开开发者模式 → 加载已解压的扩展程序。

**Firefox / Zen**：`about:debugging#/runtime/this-firefox` → 临时载入 `margin-youtube-firefox.xpi`。

> Firefox Release 会忽略 `xpinstall.signatures.required`，未签名扩展无法常驻。Zen、LibreWolf 这类非官方构建可以：把 xpi 放进 `<profile>/extensions/<extension-id>.xpi`，并设 `extensions.autoDisableScopes = 0`。

## 构建

需要 Node 22+。

```bash
npm ci
npm run build     # tsc --noEmit && node scripts/build.mjs
```

产物在 `dist/chrome` 和 `dist/firefox`，两份 manifest 分别去掉了对方的字段（Chrome 不要 `browser_specific_settings`，Firefox 不要 `background.service_worker`）。

## 已知限制

- 未登录的 YouTube 首页本身没有推荐内容，扩展会显示提示而不是空白
- 贴片广告靠静音 + 16 倍速 + 自动点跳过，不是网络层拦截（YouTube 的 `videoplayback` 流里不带 `adformat`，DNR 拦不到）
- 播放页字幕导出未实现：2026 年起无 POT 的 `/api/timedtext` 一律返回空 body
- Chrome 版未实测（开发机没有 Chrome）；`flux` 背景在 Chrome 会降级为 WebGL 版

## 许可

MIT。界面与设计系统衍生自 [bilibili-margin](https://github.com/jiuyang5354/bilibili-margin)（Copyright © 2026 jiuyang5354），YouTube 适配部分为本项目新增。
