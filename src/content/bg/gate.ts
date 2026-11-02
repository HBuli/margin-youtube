/**
 * 汇流：移植自 21st「Gateway Flow」（Neuform）的 Canvas 2D 背景。
 * 80 条点线三次贝塞尔从左右两边汇向一个中心点，每条线上一颗粒子顺着流进去；点击处炸开一圈冲击波把粒子推开。
 * 暗色：#000 底、白线 .35 / 白点 .7；亮色：#eef1f6 纸底、#1a1f2a 线 .4 / 点 .75（原组件的 light patch）。
 * 和原版的差别只有接入方式：汇聚点可以指定成某个元素的中心（首页是搜索栏），画布按 dpr 但最多 1.5 倍，
 * 帧由 BackgroundLayer 的循环驱动（隐藏、开场动画、减少动态效果时都会停）。
 */
type Path = { isLeft: boolean; startY: number; particles: { t: number; speed: number }[] };
type Explosion = { x: number; y: number; radius: number; life: number };

const NUM_PATHS = 80;
export const GATE_BG = { light: [0xee, 0xf1, 0xf6], dark: [0, 0, 0] } as const;
const INK = { light: [26, 31, 42], dark: [255, 255, 255] } as const;

export class GateFlow {
  readonly canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;
  private width = 0;
  private height = 0;
  private paths: Path[] = [];
  private explosions: Explosion[] = [];
  private seeded = false;
  /** 汇聚点（视口坐标）；为 null 时用画布中心 */
  focus: (() => { x: number; y: number } | null) | null = null;

  constructor(private dprCap = 1.5) {
    this.canvas.className = 'gate';
  }

  resize(w: number, h: number): void {
    const dpr = Math.min(this.dprCap, window.devicePixelRatio || 1);
    this.width = w; this.height = h;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.seeded && h > 0) this.seed();
  }

  private seed(): void {
    this.seeded = true;
    const height = this.height;
    for (let i = 0; i < NUM_PATHS; i++) {
      this.paths.push({
        isLeft: i % 2 === 0,
        startY: (i / NUM_PATHS) * height * 1.4 - height * 0.2,
        particles: [{ t: Math.random(), speed: 0.0015 + Math.random() * 0.002 }],
      });
    }
  }

  explode(x: number, y: number): void {
    this.explosions.push({ x, y, radius: 0, life: 1 });
  }

  /** 画一帧。step = 本帧相当于原版多少个 60fps 帧（30fps 时为 2），k = 0 亮 / 1 暗 */
  render(step: number, k: number, advance = true): void {
    const { ctx, width, height } = this;
    if (!width || !height) return;
    ctx.clearRect(0, 0, width, height);
    const f = this.focus?.();
    const centerX = f ? f.x : width / 2;
    const centerY = f ? f.y : height / 2;
    const mix = (i: number) => Math.round(INK.light[i] + (INK.dark[i] - INK.light[i]) * k);
    const ink = `${mix(0)}, ${mix(1)}, ${mix(2)}`;
    const lineA = 0.4 + (0.35 - 0.4) * k;
    const dotA = 0.75 + (0.7 - 0.75) * k;

    if (advance) {
      for (const exp of this.explosions) { exp.radius += 15 * step; exp.life -= 0.015 * step; }
      this.explosions = this.explosions.filter((exp) => exp.life > 0);
    }

    ctx.strokeStyle = `rgba(${ink}, ${lineA})`;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([1, 4]);
    ctx.beginPath();
    for (const path of this.paths) {
      // 原版用画布中心算左右两侧的控制点；汇聚点移开时控制点跟着汇聚点走，曲线形状不变
      const p0x = path.isLeft ? 0 : width;
      const p1x = path.isLeft ? centerX * 0.5 : width - (width - centerX) * 0.5;
      const p2x = path.isLeft ? centerX * 0.8 : width - (width - centerX) * 0.8;
      ctx.moveTo(p0x, path.startY);
      ctx.bezierCurveTo(p1x, path.startY, p2x, centerY, centerX, centerY);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = `rgba(${ink}, ${dotA})`;
    for (const path of this.paths) {
      const p0 = { x: path.isLeft ? 0 : width, y: path.startY };
      const p1 = { x: path.isLeft ? centerX * 0.5 : width - (width - centerX) * 0.5, y: path.startY };
      const p2 = { x: path.isLeft ? centerX * 0.8 : width - (width - centerX) * 0.8, y: centerY };
      const p3 = { x: centerX, y: centerY };
      for (const p of path.particles) {
        if (advance) {
          p.t += p.speed * step;
          if (p.t > 1) { p.t = 0; path.startY += (Math.random() - 0.5) * 10; }
        }
        const pos = bezier(p.t, p0, p1, p2, p3);
        let dxTotal = 0, dyTotal = 0;
        for (const exp of this.explosions) {
          const dx = pos.x - exp.x, dy = pos.y - exp.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 0 && dist < exp.radius + 120 && dist > exp.radius - 120) {
            const force = (1 - Math.abs(dist - exp.radius) / 120) * exp.life;
            dxTotal += (dx / dist) * force * 80;
            dyTotal += (dy / dist) * force * 80;
          }
        }
        ctx.fillRect(pos.x + dxTotal - 1.5, pos.y + dyTotal - 1.5, 3, 3);
      }
    }
  }
}

function bezier(t: number, p0: { x: number; y: number }, p1: { x: number; y: number }, p2: { x: number; y: number }, p3: { x: number; y: number }) {
  const u = 1 - t;
  return {
    x: u ** 3 * p0.x + 3 * u ** 2 * t * p1.x + 3 * u * t ** 2 * p2.x + t ** 3 * p3.x,
    y: u ** 3 * p0.y + 3 * u ** 2 * t * p1.y + 3 * u * t ** 2 * p2.y + t ** 3 * p3.y,
  };
}

/** 设置面板缩略图：同一套画法渲染一张静止帧 */
export function gateThumb(theme: 'light' | 'dark', w = 160, h = 120): string {
  const g = new GateFlow(1);
  g.resize(w * 2, h * 2);
  for (const p of g['paths']) p.particles[0].t = (p.startY * 7.3) % 1;
  const k = theme === 'dark' ? 1 : 0;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d')!;
  const bg = GATE_BG[theme];
  x.fillStyle = `rgb(${bg.join(',')})`;
  x.fillRect(0, 0, w, h);
  g.render(0, k, false);
  x.drawImage(g.canvas, 0, 0, w, h);
  return c.toDataURL('image/jpeg', 0.85);
}
