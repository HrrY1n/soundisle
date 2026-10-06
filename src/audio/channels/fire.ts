import { createNoiseSource } from "../noise.js";
import { RandomEventScheduler, rand } from "../scheduler.js";
import { applyDecayEnvelope, createPanner, triggerVoice } from "../voice.js";
import type { ChannelRuntime } from "./types.js";

/**
 * 炉火 = 低频棕噪持续闷响 + 随机爆裂（带通噪声短脉冲）+ 偶发低频「噗」。
 */
export function buildFire(ctx: AudioContext, sink: AudioNode): ChannelRuntime {
  const bed = createNoiseSource(ctx, "brown");
  const bedLowpass = ctx.createBiquadFilter();
  bedLowpass.type = "lowpass";
  bedLowpass.frequency.value = 340;
  // 火焰的呼吸感：极慢 LFO 让闷响轻微起伏
  const swell = ctx.createOscillator();
  swell.frequency.value = 0.13;
  const swellDepth = ctx.createGain();
  swellDepth.gain.value = 0.06;
  const bedGain = ctx.createGain();
  bedGain.gain.value = 0.42;
  swell.connect(swellDepth).connect(bedGain.gain);
  bed.connect(bedLowpass).connect(bedGain).connect(sink);
  bed.start();
  swell.start();

  const crackles = new RandomEventScheduler(
    () => {
      const isPop = Math.random() < 0.12;
      triggerVoice(ctx, sink, 0.4, (t0) => {
        const pan = createPanner(ctx);
        if (isPop) {
          // 大块木柴炸开：低频正弦 + 快速衰减
          const osc = ctx.createOscillator();
          osc.type = "sine";
          osc.frequency.value = rand(90, 190);
          const env = ctx.createGain();
          applyDecayEnvelope(env.gain, t0, rand(0.12, 0.2), rand(0.1, 0.18));
          osc.connect(env).connect(pan);
          return { output: pan, sources: [osc], extras: [env] };
        }
        const burst = createNoiseSource(ctx, "white");
        burst.loop = false;
        const bandpass = ctx.createBiquadFilter();
        bandpass.type = "bandpass";
        bandpass.frequency.value = rand(1500, 5600);
        bandpass.Q.value = rand(4, 9);
        const env = ctx.createGain();
        applyDecayEnvelope(env.gain, t0, rand(0.02, 0.13), rand(0.015, 0.08));
        burst.connect(bandpass).connect(env).connect(pan);
        return { output: pan, sources: [burst], extras: [bandpass, env] };
      });
    },
    () => rand(45, 520),
    rand(300, 1200),
  );

  return {
    schedulers: [crackles],
    dispose() {
      bed.stop();
      swell.stop();
      bedGain.disconnect();
    },
  };
}
