import { createNoiseSource } from "../noise.js";
import { RandomEventScheduler, rand } from "../scheduler.js";
import { applyDecayEnvelope, createPanner, triggerVoice } from "../voice.js";
import type { ChannelRuntime } from "./types.js";

/**
 * 雨 = 持续雨幕（两层滤波噪声）+ 随机雨滴啄击 + 偶发远雷。
 * 雷是雨的伴生事件：只随雨通道启停。
 * 雨幕刻意压低嘶声层、加重低频体感——「雨」不该听起来像白噪底。
 */
export function buildRain(ctx: AudioContext, sink: AudioNode): ChannelRuntime {
  // —— 持续层 1：中频雨幕（已柔化的嘶声带）
  const hiss = createNoiseSource(ctx, "white");
  const hissHighpass = ctx.createBiquadFilter();
  hissHighpass.type = "highpass";
  hissHighpass.frequency.value = 400;
  const hissLowpass = ctx.createBiquadFilter();
  hissLowpass.type = "lowpass";
  hissLowpass.frequency.value = 1500;
  hissLowpass.Q.value = 0.4;
  const hissGain = ctx.createGain();
  hissGain.gain.value = 0.22;
  hiss.connect(hissHighpass).connect(hissLowpass).connect(hissGain).connect(sink);
  hiss.start();

  // —— 持续层 2：低频雨幕体感
  const body = createNoiseSource(ctx, "white");
  const bodyLowpass = ctx.createBiquadFilter();
  bodyLowpass.type = "lowpass";
  bodyLowpass.frequency.value = 420;
  const bodyGain = ctx.createGain();
  bodyGain.gain.value = 0.22;
  body.connect(bodyLowpass).connect(bodyGain).connect(sink);
  body.start();

  // —— 事件层：雨滴
  const droplets = new RandomEventScheduler(
    () => {
      triggerVoice(ctx, sink, 0.12, (t0) => {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = rand(1100, 3400);
        const env = ctx.createGain();
        applyDecayEnvelope(env.gain, t0, rand(0.02, 0.075), rand(0.015, 0.05));
        const pan = createPanner(ctx);
        osc.connect(env).connect(pan);
        return { output: pan, sources: [osc], extras: [env] };
      });
    },
    () => rand(28, 220),
    rand(200, 900),
  );

  // —— 事件层：远雷（低频隆隆 + 次声扫频），间隔拉得很开
  const thunder = new RandomEventScheduler(
    () => {
      const pan = createPanner(ctx, 0.4);
      pan.connect(sink);
      triggerVoice(ctx, pan, 6, (t0) => {
        const rumble = createNoiseSource(ctx, "brown");
        rumble.loop = false;
        const lowpass = ctx.createBiquadFilter();
        lowpass.type = "lowpass";
        lowpass.frequency.value = 130;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.0001, t0);
        env.gain.exponentialRampToValueAtTime(rand(0.4, 0.7), t0 + rand(0.25, 0.6));
        env.gain.exponentialRampToValueAtTime(0.0001, t0 + rand(3.5, 5.5));
        rumble.connect(lowpass).connect(env);
        return { output: env, sources: [rumble], extras: [lowpass] };
      });
      triggerVoice(ctx, pan, 6, (t0) => {
        const sub = ctx.createOscillator();
        sub.type = "sine";
        sub.frequency.setValueAtTime(rand(55, 70), t0);
        sub.frequency.exponentialRampToValueAtTime(28, t0 + 2.5);
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.0001, t0);
        env.gain.exponentialRampToValueAtTime(0.35, t0 + 0.3);
        env.gain.exponentialRampToValueAtTime(0.0001, t0 + 3);
        sub.connect(env);
        return { output: env, sources: [sub] };
      });
    },
    () => rand(18000, 48000),
    rand(9000, 20000),
  );

  return {
    schedulers: [droplets, thunder],
    dispose() {
      hiss.stop();
      body.stop();
      hissGain.disconnect();
      bodyGain.disconnect();
    },
  };
}
