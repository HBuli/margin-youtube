import { build } from 'vite';
import { wgslVitePlugin } from '@vgpu/wgsl/loader-vite';
import { cp, rm, mkdir, readFile, writeFile } from 'node:fs/promises';

// 先构建到中间目录，再按平台分包：
//   dist/chrome/  ← Chrome / Edge「加载已解压的扩展程序」
//   dist/firefox/ ← Firefox / Zen 的 about:debugging 临时载入
// 两个平台只有 manifest.json 不同（Firefox 要 gecko id，且不认 Chrome 的 service_worker）。
const STAGE = 'build-out';
const OUT = 'dist';

const entries = [
  { name: 'content', entry: 'src/content/main.ts' },
  { name: 'popup', entry: 'src/popup/popup.ts' },
  { name: 'background', entry: 'src/background/native.ts' },
];

/** 每个平台对 manifest 的增删 */
const TARGETS = {
  chrome: (m) => {
    delete m.browser_specific_settings;
    // Chrome 的 MV3 不认 background.scripts（只要 service_worker），也没有本地壁纸服务
    delete m.background;
    m.permissions = (m.permissions ?? []).filter((p) => p !== 'nativeMessaging');
    return m;
  },
  firefox: (m) => {
    m.browser_specific_settings = {
      gecko: {
        id: 'margin-youtube@hbuli.local',
        strict_min_version: '140.0',
      },
    };
    return m;
  },
};

await rm(STAGE, { recursive: true, force: true });
await mkdir(STAGE, { recursive: true });

for (const { name, entry } of entries) {
  await build({
    configFile: false,
    publicDir: false,
    logLevel: 'warn',
    plugins: [wgslVitePlugin({ minify: { whitespace: true } })],
    build: {
      outDir: STAGE,
      emptyOutDir: false,
      target: 'chrome110',
      minify: !process.env.NOMIN,
      lib: { entry, name: `margin_${name}`, formats: ['iife'], fileName: () => `${name}.js` },
    },
  });
}

// 流光（WebGPU / vgpu，约 200KB）单独打包，只有用户选到这款背景时才动态 import；
// 加载失败会静默降级成 WebGL 版，所以两个平台共用同一个文件。
await build({
  configFile: false,
  publicDir: false,
  logLevel: 'warn',
  plugins: [wgslVitePlugin({ minify: { whitespace: true } })],
  build: {
    outDir: STAGE,
    emptyOutDir: false,
    target: 'chrome113',
    minify: !process.env.NOMIN,
    lib: { entry: 'src/content/bg/flux/index.ts', formats: ['es'], fileName: () => 'flux.js' },
    rolldownOptions: { output: { minify: !process.env.NOMIN } },
  },
});

await cp('public', STAGE, { recursive: true });

await rm(OUT, { recursive: true, force: true });
const made = [];
for (const [platform, apply] of Object.entries(TARGETS)) {
  const dir = `${OUT}/${platform}`;
  await cp(STAGE, dir, { recursive: true });
  const manifest = apply(JSON.parse(await readFile(`${STAGE}/manifest.json`, 'utf8')));
  await writeFile(`${dir}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
  made.push(`${dir}/manifest.json`);
}
await rm(STAGE, { recursive: true, force: true });

console.log('built:');
for (const f of made) console.log('  ' + f);
