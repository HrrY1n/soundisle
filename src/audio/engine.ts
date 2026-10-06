import { CHANNEL_DEFS, channelDef, type ChannelId } from "./channels/defs.js";
import { buildBirds } from "./channels/birds.js";
import { buildCrickets } from "./channels/crickets.js";
import { buildFire } from "./channels/fire.js";
import { buildRain } from "./channels/rain.js";
import { buildStream } from "./channels/stream.js";
import { buildWind } from "./channels/wind.js";
import type { ChannelBuilder, ChannelRuntime } from "./channels/types.js";

const BUILDERS: Record<ChannelId, ChannelBuilder> = {
  rain: buildRain,
  fire: buildFire,
  wind: buildWind,
  stream: buildStream,
  crickets: buildCrickets,
  birds: buildBirds,
};

export interface ChannelState {
  enabled: boolean;
  volume: number;
}

type Runtime = ChannelRuntime & { gain: GainNode; analyser: AnalyserNode };

/** 增益参数的统一应用策略：
 *  running → 取消在途事件，以当前实际值锚定，再 setTargetAtTime 平滑过渡；
 *  （cancelAndHoldAtTime + 同时刻 setTargetAtTime 在 Chromium 中会被持有事件
 *  吞掉导致淡出失效，故用 setValueAtTime 锚定。）
 *  suspended（自动播放策略未放行）→ 时钟冻结，时间自动化不可靠，
 *  直接设定瞬时值，恢复后不会出现跳变。 */
function applyParam(param: AudioParam, target: number, ctx: AudioContext, fadeSeconds = 0.8): void {
  const now = ctx.currentTime;
  if (ctx.state !== "running") {
    param.cancelScheduledValues(now);
    param.value = target;
    return;
  }
  param.cancelScheduledValues(now);
  try {
    param.setValueAtTime(param.value, now);
  } catch {
    // param.value 不可读时跳过锚定，仅保留目标自动化
  }
  param.setTargetAtTime(target, now, fadeSeconds / 3);
}

/**
 * 音频引擎：懒创建 AudioContext（必须在用户手势后），构建
 * 「通道增益 → 主增益 → 压缩器 → 分析器 → 输出」的主链。
 * setChannel 在引擎未启动时只记录期望状态，start 时统一应用。
 */
export class SoundEngine {
  #ctx: AudioContext | null = null;
  #master: GainNode | null = null;
  #analyser: AnalyserNode | null = null;
  #runtimes = new Map<ChannelId, Runtime>();
  #desired = new Map<ChannelId, ChannelState>();
  #muted = false;
  #chimeSink: AudioNode | null = null;

  constructor() {
    for (const def of CHANNEL_DEFS) {
      this.#desired.set(def.id, { enabled: false, volume: def.defaultVolume });
    }
  }

  get started(): boolean {
    return this.#ctx !== null;
  }

  get analyser(): AnalyserNode | null {
    return this.#analyser;
  }

  /** 指定通道的频谱分析器抽头；引擎未启动时返回 null */
  channelAnalyser(id: ChannelId): AnalyserNode | null {
    return this.#runtimes.get(id)?.analyser ?? null;
  }

  /** 当前通道增益瞬时值（淡入淡出过程中变化），测试与调试用 */
  getChannelGainValue(id: ChannelId): number {
    return this.#runtimes.get(id)?.gain.gain.value ?? 0;
  }

  getChannelState(id: ChannelId): ChannelState {
    const state = this.#desired.get(id);
    if (!state) throw new Error(`未知通道：${id}`);
    return state;
  }

  /** 必须由用户手势触发；幂等且防并发重复建图 */
  async start(): Promise<void> {
    if (this.#ctx) {
      await this.#resumeInternal();
      return;
    }
    const ctx = newAudioContext();
    this.#ctx = ctx; // 先占位，避免并发 start() 双重建图
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        // 策略阻止时仍构建完整图：增益走直接赋值，恢复后立即可响
      }
    }
    const master = ctx.createGain();
    master.gain.value = this.#muted ? 0 : 1;
    // 音频卫生链：截断次声/直流（棕噪漂移、滤波噗声），柔化 9kHz 以上的高频毛刺
    const rumbleGuard = ctx.createBiquadFilter();
    rumbleGuard.type = "highpass";
    rumbleGuard.frequency.value = 24;
    rumbleGuard.Q.value = 0.5;
    const airSoftener = ctx.createBiquadFilter();
    airSoftener.type = "lowpass";
    airSoftener.frequency.value = 9000;
    airSoftener.Q.value = 0.4;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 30;
    compressor.ratio.value = 2.5;
    compressor.attack.value = 0.01;
    compressor.release.value = 0.3;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.82;
    master
      .connect(rumbleGuard)
      .connect(airSoftener)
      .connect(compressor)
      .connect(analyser)
      .connect(ctx.destination);

    this.#ctx = ctx;
    this.#master = master;
    this.#analyser = analyser;
    this.#chimeSink = master;

    for (const def of CHANNEL_DEFS) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(master);
      // 每通道一个分析器抽头（不接输出），可视化按通道颜色呈现
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.85;
      gain.connect(analyser);
      const runtime = BUILDERS[def.id](ctx, gain);
      this.#runtimes.set(def.id, { ...runtime, gain, analyser });
      this.#applyChannel(def.id, 0.3);
    }
  }

  async #resumeInternal(): Promise<void> {
    if (!this.#ctx || this.#ctx.state !== "suspended") return;
    try {
      await this.#ctx.resume();
    } catch {
      // 用户手势缺失时保持挂起；下一次手势会再尝试
    }
  }

  async resume(): Promise<void> {
    await this.#resumeInternal();
  }

  setChannel(id: ChannelId, patch: Partial<ChannelState>): void {
    const prev = this.getChannelState(id);
    const next = { ...prev, ...patch };
    this.#desired.set(id, next);
    this.#applyChannel(id);
  }

  setMuted(muted: boolean): void {
    this.#muted = muted;
    if (this.#ctx && this.#master) {
      applyParam(this.#master.gain, muted ? 0 : 1, this.#ctx, 0.3);
    }
  }

  get muted(): boolean {
    return this.#muted;
  }

  /** 通道音量 → 增益：感知曲线（^1.6）× 通道电平微调；enabled=false 时淡出至 0 */
  #applyChannel(id: ChannelId, fadeSeconds = 0.8): void {
    const runtime = this.#runtimes.get(id);
    const state = this.#desired.get(id);
    if (!runtime || !state || !this.#ctx) return;
    const def = channelDef(id);
    const target = state.enabled ? Math.pow(Math.max(state.volume, 0), 1.6) * def.trim : 0;
    applyParam(runtime.gain.gain, target, this.#ctx, fadeSeconds);
    for (const scheduler of runtime.schedulers) {
      if (state.enabled) scheduler.start();
      else scheduler.stop();
    }
  }

  /** 阶段结束风铃等 UI 音效的挂载点（走主链，受静音控制） */
  get chimeSink(): AudioNode | null {
    return this.#chimeSink;
  }

  /** 主链输出节点（用户实际听到的信号），供测量/测试抽头 */
  get masterNode(): AudioNode | null {
    return this.#master;
  }

  get context(): AudioContext | null {
    return this.#ctx;
  }

  async dispose(): Promise<void> {
    for (const runtime of this.#runtimes.values()) {
      for (const scheduler of runtime.schedulers) scheduler.dispose();
      runtime.dispose();
      runtime.gain.disconnect();
    }
    this.#runtimes.clear();
    await this.#ctx?.close();
    this.#ctx = null;
    this.#master = null;
    this.#analyser = null;
  }
}

function newAudioContext(): AudioContext {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  return new Ctor();
}
