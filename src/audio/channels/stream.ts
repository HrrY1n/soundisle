import { createNoiseSource } from "../noise.js";
import { RandomEventScheduler, rand } from "../scheduler.js";
import { applyDecayEnvelope, createPanner, triggerVoice } from "../voice.js";
import type { ChannelRuntime } from "./types.js";

/**
 * 溪流 = 带通噪声水声主体（快 LFO 模拟水流起伏）+ 高频水花亮层 + 随机气泡啵声。
 */
export function buildStream(ctx: AudioContext, sink: AudioNode): ChannelRuntime {
  const water = createNoiseSource(ctx, "white");
  const waterBandpass = ctx.createBiquadFilter();
  waterBandpass.type = "bandpass";
  waterBandpass.frequency.value = 950;
  waterBandpass.Q.value = 0.9;
  const waterGain = ctx.createGain();
  waterGain.gain.value = 0.26;

  const ripple = ctx.createOscillator();
  ripple.frequency.value = 0.5;
  const rippleDepth = ctx.createGain();
  rippleDepth.gain.value = 220;
  ripple.connect(rippleDepth).connect(waterBandpass.frequency);
  ripple.start();

  water.connect(waterBandpass).connect(waterGain).connect(sink);
  water.start();

  const spray = createNoiseSource(ctx, "white");
  const sprayBandpass = ctx.createBiquadFilter();
  sprayBandpass.type = "bandpass";
  sprayBandpass.frequency.value = 2800;
  sprayBandpass.Q.value = 1.8;
  const sprayGain = ctx.createGain();
  sprayGain.gain.value = 0.04;
  spray.connect(sprayBandpass).connect(sprayGain).connect(sink);
  spray.start();

  const bubbles = new RandomEventScheduler(
    () => {
      triggerVoice(ctx, sink, 0.15, (t0) => {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(rand(350, 550), t0);
        osc.frequency.exponentialRampToValueAtTime(rand(750, 1100), t0 + rand(0.04, 0.09));
        const env = ctx.createGain();
        applyDecayEnvelope(env.gain, t0, rand(0.015, 0.04), rand(0.03, 0.06));
        const pan = createPanner(ctx);
        osc.connect(env).connect(pan);
        return { output: pan, sources: [osc], extras: [env] };
      });
    },
    () => rand(90, 420),
    rand(400, 1500),
  );

  return {
    schedulers: [bubbles],
    dispose() {
      water.stop();
      spray.stop();
      ripple.stop();
      waterGain.disconnect();
      sprayGain.disconnect();
    },
  };
}
