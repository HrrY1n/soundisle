import { CHANNEL_DEFS, type ChannelDef, type ChannelId } from "../audio/channels/defs.js";
import type { SoundEngine } from "../audio/engine.js";

/**
 * 夜海场景：整个页面是一片随混音状态变化的海。
 * 星空与月径（暗色）· 三层海浪（每层绑定一个启用通道的色相与实时能量）
 * · 通道粒子（雨丝/余烬/流萤/雾/水光/掠影）。静音时整个海面黯淡。
 * 遵循 prefers-reduced-motion：只绘制静止海面，不做动画。
 */

const BIN_COUNT = 48;
const HORIZON = 0.64; // 海平线（视口高度比例）

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  seed: number;
}

interface Star {
  x: number;
  y: number;
  r: number;
  phase: number;
  speed: number;
  alpha: number;
}

export class Scene {
  #canvas: HTMLCanvasElement;
  #g: CanvasRenderingContext2D;
  #engine: SoundEngine;
  #theme: "dark" | "light" = "dark";
  #muted = false;
  #enabled: ReadonlySet<ChannelId> = new Set();
  #stars: Star[] = [];
  #particles = new Map<ChannelId, Particle[]>();
  #buffers = new Map<ChannelId, Uint8Array<ArrayBuffer>>();
  #raf = 0;
  #last = 0;
  #time = 0;
  #w = 0;
  #h = 0;
  #reduced = false;
  #bird: Particle | null = null;
  #birdTimer = 3;

  constructor(canvas: HTMLCanvasElement, engine: SoundEngine) {
    this.#canvas = canvas;
    const g = canvas.getContext("2d");
    if (!g) throw new Error("Canvas 2D 不可用");
    this.#g = g;
    this.#engine = engine;
    this.#reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  setTheme(theme: "dark" | "light"): void {
    if (this.#theme !== theme) {
      this.#theme = theme;
      this.#makeStars();
      if (this.#reduced) this.#drawStatic();
    }
  }

  setMuted(muted: boolean): void {
    this.#muted = muted;
    if (this.#reduced) this.#drawStatic();
  }

  setEnabledChannels(enabled: ReadonlySet<ChannelId>): void {
    this.#enabled = enabled;
    if (this.#reduced) this.#drawStatic();
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const rect = this.#canvas.getBoundingClientRect();
    this.#w = Math.max(1, rect.width);
    this.#h = Math.max(1, rect.height);
    this.#canvas.width = Math.round(this.#w * dpr);
    this.#canvas.height = Math.round(this.#h * dpr);
    this.#g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.#makeStars();
    if (this.#reduced) this.#drawStatic();
  }

  start(): void {
    if (this.#raf || this.#reduced) {
      if (this.#reduced) this.#drawStatic();
      return;
    }
    this.#last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - this.#last) / 1000);
      this.#last = now;
      this.#time += dt;
      this.#draw(dt);
      this.#raf = requestAnimationFrame(loop);
    };
    this.#raf = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.#raf);
    this.#raf = 0;
  }

  #makeStars(): void {
    const count = Math.round((this.#w * this.#h) / 16000);
    this.#stars = [];
    for (let i = 0; i < Math.min(count, 160); i += 1) {
      this.#stars.push({
        x: Math.random() * this.#w,
        y: Math.random() * this.#h * HORIZON * 0.92,
        r: 0.4 + Math.random() * 1.1,
        phase: Math.random() * Math.PI * 2,
        speed: 0.4 + Math.random() * 1.4,
        alpha: 0.12 + Math.random() * 0.5,
      });
    }
  }

  #channelEnergy(def: ChannelDef): number {
    if (!this.#enabled.has(def.id)) return 0;
    const analyser = this.#engine.channelAnalyser(def.id);
    if (!analyser) return 0;
    let data = this.#buffers.get(def.id);
    if (!data || data.length !== analyser.frequencyBinCount) {
      data = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
      this.#buffers.set(def.id, data);
    }
    analyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < BIN_COUNT; i += 1) sum += data[i] ?? 0;
    return Math.min(1, (sum / BIN_COUNT / 255) * 2.2);
  }

  #draw(dt: number): void {
    const { w, h } = this;
    const g = this.#g;
    const t = this.#time;
    const dark = this.#theme === "dark";
    const dim = this.#muted ? 0.38 : 1;
    const horizonY = h * HORIZON;

    g.clearRect(0, 0, w, h);

    // —— 星空（仅暗色）——
    if (dark) {
      for (const s of this.#stars) {
        const tw = 0.55 + 0.45 * Math.sin(t * s.speed + s.phase);
        g.globalAlpha = s.alpha * tw * dim * 0.8;
        g.fillStyle = "#cfe0f2";
        g.beginPath();
        g.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;

      // —— 月亮与月径 ——
      const mx = w * 0.76;
      const my = h * 0.2;
      const glow = g.createRadialGradient(mx, my, 4, mx, my, 130);
      glow.addColorStop(0, "rgba(238,232,214,0.30)");
      glow.addColorStop(1, "rgba(238,232,214,0)");
      g.globalAlpha = dim;
      g.fillStyle = glow;
      g.fillRect(mx - 130, my - 130, 260, 260);
      g.fillStyle = "rgba(240,234,216,0.92)";
      g.beginPath();
      g.arc(mx, my, 21, 0, Math.PI * 2);
      g.fill();
      // 月径：海面上的碎光（两遍绘制：宽而淡 + 窄而亮）
      for (let k = 0; k < 16; k += 1) {
        const ky = horizonY + 8 + k * ((h - horizonY) / 18);
        const kx = mx + Math.sin(t * 0.8 + k * 1.7) * (7 + k * 2.6);
        const kw = 40 - k * 1.5;
        const a = (0.3 - k * 0.015) * dim;
        g.fillStyle = "rgba(240,234,216,0.9)";
        g.globalAlpha = a * 0.45;
        g.beginPath();
        g.ellipse(kx, ky + Math.sin(t * 1.3 + k) * 2, kw, 2.2, 0, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = a;
        g.beginPath();
        g.ellipse(kx, ky + Math.sin(t * 1.3 + k) * 2, kw * 0.55, 1.3, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    } else {
      // 亮色：暖日光晕
      const mx = w * 0.76;
      const my = h * 0.2;
      const glow = g.createRadialGradient(mx, my, 4, mx, my, 180);
      glow.addColorStop(0, "rgba(224,168,92,0.20)");
      glow.addColorStop(1, "rgba(224,168,92,0)");
      g.globalAlpha = dim;
      g.fillStyle = glow;
      g.fillRect(mx - 180, my - 180, 360, 360);
      g.globalAlpha = 1;
    }

    // —— 海面：不做基底矩形（其上边缘会暴露为直线伪影），
    // 深度由三层波浪各自的填充叠加而成 ——
    // —— 海平线微光 ——
    const line = g.createLinearGradient(w * 0.2, 0, w * 0.8, 0);
    line.addColorStop(0, "rgba(140,180,215,0)");
    line.addColorStop(0.5, dark ? "rgba(150,190,225,0.20)" : "rgba(205,160,100,0.25)");
    line.addColorStop(1, "rgba(140,180,215,0)");
    g.fillStyle = line;
    g.fillRect(0, horizonY - 0.5, w, 1);

    // —— 三层海浪：每层绑定一个启用通道（色相 + 能量），无通道时按基线呼吸 ——
    const active = CHANNEL_DEFS.filter((d) => this.#enabled.has(d.id));
    for (let layer = 0; layer < 3; layer += 1) {
      const def = active[layer % Math.max(active.length, 1)];
      const energy = def ? this.#channelEnergy(def) : 0;
      const hue = def ? def.hue : dark ? 203 : 35;
      const baseY = horizonY + 14 + layer * ((h - horizonY) * 0.14);
      const amp = (7 + energy * 26) * (1 - layer * 0.18) + 3;
      const speed = 0.5 + layer * 0.21;
      const alpha = (dark ? 0.20 : 0.16) * dim * (1 - layer * 0.22);

      g.beginPath();
      g.moveTo(0, h);
      for (let x = 0; x <= w; x += 6) {
        const p = x / w;
        const y =
          baseY +
          Math.sin(p * 5.2 + t * speed + layer * 2.1) * amp +
          Math.sin(p * 11.7 - t * speed * 0.62 + layer) * amp * 0.36;
        g.lineTo(x, y);
      }
      g.lineTo(w, h);
      g.closePath();
      g.fillStyle = `hsla(${hue} ${dark ? 42 : 32}% ${dark ? 30 : 60}% / ${(dark ? 0.3 : 0.36) * dim * (1 - layer * 0.22)})`;
      g.fill();
      g.strokeStyle = `hsla(${hue} ${dark ? 55 : 40}% ${dark ? 62 : 48}% / ${alpha * 1.9})`;
      g.lineWidth = 1.2;
      g.stroke();
    }

    // —— 通道粒子 ——
    this.#drawParticles(dt, dim, dark, horizonY);

    // —— 鸟影（鸟鸣通道独立事件）——
    if (this.#enabled.has("birds")) {
      this.#birdTimer -= dt;
      if (!this.#bird && this.#birdTimer <= 0) {
        const dir = Math.random() < 0.5 ? 1 : -1;
        this.#bird = {
          x: dir > 0 ? -20 : w + 20,
          y: h * (0.12 + Math.random() * 0.18),
          vx: dir * (90 + Math.random() * 50),
          vy: 0,
          life: 0,
          maxLife: (w + 60) / 110,
          size: 1.6 + Math.random(),
          seed: Math.random() * 10,
        };
        this.#birdTimer = 5 + Math.random() * 7;
      }
      const b = this.#bird;
      if (b) {
        b.life += dt;
        b.x += b.vx * dt;
        b.y += Math.sin(b.life * 5 + b.seed) * 12 * dt;
        const fade = Math.min(1, b.life * 2, (b.maxLife - b.life) * 2);
        if (b.life >= b.maxLife) {
          this.#bird = null;
        } else {
          g.globalAlpha = 0.4 * fade * dim * (dark ? 1 : 0.8);
          g.fillStyle = dark ? "#9fb4cc" : "#4a5568";
          g.beginPath();
          g.arc(b.x, b.y, b.size, 0, Math.PI * 2);
          g.fill();
          g.globalAlpha = 1;
        }
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  #drawParticles(dt: number, dim: number, dark: boolean, horizonY: number): void {
    const { w, h } = this;
    const g = this.#g;
    const t = this.#time;

    const pool = (id: ChannelId, want: number, spawn: () => Particle) => {
      if (!this.#enabled.has(id)) {
        this.#particles.delete(id);
        return;
      }
      let list = this.#particles.get(id);
      if (!list) {
        list = [];
        this.#particles.set(id, list);
      }
      while (list.length < want) list.push(spawn());
    };

    const vol = (id: ChannelId) => (this.#enabled.has(id) ? this.#engine.getChannelState(id).volume : 0);

    // 雨：斜落雨丝
    const rainVol = vol("rain");
    pool("rain", Math.round(24 + rainVol * 70), () => ({
      x: Math.random() * (w + 120) - 60,
      y: -20 - Math.random() * h * 0.4,
      vx: 46,
      vy: 520 + Math.random() * 320,
      life: 0,
      maxLife: 3,
      size: 9 + Math.random() * 9,
      seed: Math.random() * 10,
    }));
    const rains = this.#particles.get("rain");
    if (rains) {
      g.strokeStyle = `hsla(205 60% 72% / ${0.30 * dim})`;
      g.lineWidth = 1.1;
      g.beginPath();
      for (const p of rains) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.y > horizonY + 30 + p.seed * 12 || p.y > h) {
          p.y = -20 - Math.random() * 60;
          p.x = Math.random() * (w + 120) - 60;
        }
        g.moveTo(p.x, p.y);
        g.lineTo(p.x - p.vx * 0.028, p.y - p.size);
      }
      g.stroke();
    }

    // 火：升腾余烬
    const fireVol = vol("fire");
    pool("fire", Math.round(8 + fireVol * 22), () => ({
      x: Math.random() * w,
      y: h + 8,
      vx: 0,
      vy: -(22 + Math.random() * 40),
      life: 0,
      maxLife: 4 + Math.random() * 4,
      size: 1.2 + Math.random() * 1.9,
      seed: Math.random() * 10,
    }));
    const embers = this.#particles.get("fire");
    if (embers) {
      for (const p of embers) {
        p.life += dt;
        if (p.life > p.maxLife || p.y < horizonY - 60) {
          p.y = h + 8;
          p.x = Math.random() * w;
          p.life = 0;
          p.maxLife = 4 + Math.random() * 4;
        }
        p.x += Math.sin(t * 1.7 + p.seed) * 14 * dt;
        const fade = Math.sin((p.life / p.maxLife) * Math.PI);
        g.globalAlpha = 0.5 * fade * dim;
        g.fillStyle = `hsl(${24 + p.seed * 2} 85% 62%)`;
        g.beginPath();
        g.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    }

    // 风：横移薄雾
    pool("wind", 9, () => ({
      x: Math.random() * w,
      y: h * (0.3 + Math.random() * 0.4),
      vx: 10 + Math.random() * 18,
      vy: 0,
      life: 0,
      maxLife: 1,
      size: 60 + Math.random() * 130,
      seed: Math.random() * 10,
    }));
    const mists = this.#particles.get("wind");
    if (mists) {
      for (const p of mists) {
        p.x += p.vx * dt;
        if (p.x - p.size > w) p.x = -p.size;
        const grad = g.createLinearGradient(p.x - p.size, p.y, p.x + p.size, p.y);
        grad.addColorStop(0, "rgba(150,175,200,0)");
        grad.addColorStop(0.5, `rgba(150,175,200,${(dark ? 0.05 : 0.09) * dim})`);
        grad.addColorStop(1, "rgba(150,175,200,0)");
        g.fillStyle = grad;
        g.fillRect(p.x - p.size, p.y - 5, p.size * 2, 10);
      }
    }

    // 溪流：水线碎光
    const streamVol = vol("stream");
    pool("stream", Math.round(6 + streamVol * 16), () => ({
      x: Math.random() * w,
      y: horizonY + 4 + Math.random() * 46,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 0.5 + Math.random() * 0.7,
      size: 1 + Math.random() * 1.6,
      seed: Math.random() * 10,
    }));
    const sparks = this.#particles.get("stream");
    if (sparks) {
      for (const p of sparks) {
        p.life += dt;
        if (p.life > p.maxLife) {
          p.life = 0;
          p.x = Math.random() * w;
          p.y = horizonY + 4 + Math.random() * 46;
        }
        const fade = Math.sin((p.life / p.maxLife) * Math.PI);
        g.globalAlpha = 0.65 * fade * dim;
        g.fillStyle = `hsl(172 65% 70%)`;
        g.beginPath();
        g.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    }

    // 夜虫：流萤（呼吸式明灭）
    const crickVol = vol("crickets");
    pool("crickets", Math.round(6 + crickVol * 14), () => ({
      x: Math.random() * w,
      y: h * (0.42 + Math.random() * 0.22),
      vx: (Math.random() - 0.5) * 14,
      vy: (Math.random() - 0.5) * 8,
      life: 0,
      maxLife: 1,
      size: 1.4 + Math.random() * 1.2,
      seed: Math.random() * 10,
    }));
    const flies = this.#particles.get("crickets");
    if (flies) {
      for (const p of flies) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < h * 0.38 || p.y > h * 0.66) p.vy *= -1;
        const blink = Math.pow(Math.max(0, Math.sin(t * 1.4 + p.seed * 6)), 12);
        if (blink > 0.02) {
          g.globalAlpha = 0.85 * blink * dim;
          g.fillStyle = "hsl(58 90% 66%)";
          g.beginPath();
          g.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.globalAlpha = 1;
    }
  }

  /** 静帧（reduced-motion）：只画海面与月，无粒子无动画 */
  #drawStatic(): void {
    const { w, h } = this;
    const g = this.#g;
    const dark = this.#theme === "dark";
    const dim = this.#muted ? 0.38 : 1;
    const horizonY = h * HORIZON;
    g.clearRect(0, 0, w, h);
    for (let layer = 0; layer < 3; layer += 1) {
      const baseY = horizonY + 14 + layer * ((h - horizonY) * 0.14);
      g.beginPath();
      g.moveTo(0, h);
      for (let x = 0; x <= w; x += 6) {
        const p = x / w;
        const y = baseY + Math.sin(p * 5.2 + layer * 2.1) * 8;
        g.lineTo(x, y);
      }
      g.lineTo(w, h);
      g.closePath();
      g.fillStyle = `hsla(203 42% 30% / ${(dark ? 0.3 : 0.2) * dim * (1 - layer * 0.24)})`;
      g.fill();
    }
  }

  get w(): number {
    return this.#w;
  }

  get h(): number {
    return this.#h;
  }
}
