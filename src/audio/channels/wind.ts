import { createNoiseSource } from "../noise.js";
import type { ChannelRuntime } from "./types.js";

/**
 * 风 = 粉噪带通主体，双 LFO（滤波器扫频 + 增益起伏）制造阵风，
 * 叠一层极轻的高频呼哨。全 LFO 驱动，无离散事件。
 */
export function buildWind(ctx: AudioContext, sink: AudioNode): ChannelRuntime {
  const gust = createNoiseSource(ctx, "pink");
  const bandpass = ctx.createBiquadFilter();
  bandpass.type = "bandpass";
  bandpass.frequency.value = 480;
  bandpass.Q.value = 0.75;

  const gustGain = ctx.createGain();
  gustGain.gain.value = 0.26;

  // LFO A：缓慢扫过滤波器中心频率 → 风的「呜——呜——」形态变化
  const sweep = ctx.createOscillator();
  sweep.frequency.value = 0.055;
  const sweepDepth = ctx.createGain();
  sweepDepth.gain.value = 170;
  sweep.connect(sweepDepth).connect(bandpass.frequency);
  sweep.start();

  // LFO B：稍快的增益起伏 → 阵风强弱
  const swell = ctx.createOscillator();
  swell.frequency.value = 0.12;
  const swellDepth = ctx.createGain();
  swellDepth.gain.value = 0.14;
  swell.connect(swellDepth).connect(gustGain.gain);
  swell.start();

  gust.connect(bandpass).connect(gustGain).connect(sink);
  gust.start();

  // 高频呼哨层：极轻，让大风时有一点「哨」的亮色
  const whistle = createNoiseSource(ctx, "white");
  const whistleHighpass = ctx.createBiquadFilter();
  whistleHighpass.type = "highpass";
  whistleHighpass.frequency.value = 2400;
  const whistleGain = ctx.createGain();
  whistleGain.gain.value = 0.018;
  whistle.connect(whistleHighpass).connect(whistleGain).connect(sink);
  whistle.start();

  return {
    schedulers: [],
    dispose() {
      gust.stop();
      whistle.stop();
      sweep.stop();
      swell.stop();
      gustGain.disconnect();
      whistleGain.disconnect();
    },
  };
}
