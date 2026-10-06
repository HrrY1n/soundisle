import { createNoiseSource } from "../noise.js";
import { RandomEventScheduler, rand } from "../scheduler.js";
import { applyDecayEnvelope, createPanner, triggerVoice } from "../voice.js";
import type { ChannelRuntime } from "./types.js";

/**
 * 夜虫 = 一组组 4kHz 左右的颤音鸣叫（每串 3-6 声，串内 45ms 间距）
 * + 极轻的夜色底噪。鸣叫串随机出现在不同声像位置，营造夏夜环绕感。
 */
export function buildCrickets(ctx: AudioContext, sink: AudioNode): ChannelRuntime {
  const night = createNoiseSource(ctx, "white");
  const nightLowpass = ctx.createBiquadFilter();
  nightLowpass.type = "lowpass";
  nightLowpass.frequency.value = 500;
  const nightGain = ctx.createGain();
  nightGain.gain.value = 0.05;
  night.connect(nightLowpass).connect(nightGain).connect(sink);
  night.start();

  const chirpGroups = new RandomEventScheduler(
    () => {
      const pulses = 3 + Math.floor(rand(0, 4));
      const groupPan = createPanner(ctx);
      groupPan.connect(sink);
      const carrier = rand(4100, 4700);
      const groupStart = ctx.currentTime;
      for (let i = 0; i < pulses; i += 1) {
        const at = groupStart + i * 0.048;
        triggerVoice(ctx, groupPan, 0.09, (_t0) => {
          const osc = ctx.createOscillator();
          osc.type = "sine";
          osc.frequency.value = carrier;
          const env = ctx.createGain();
          // 包络锚定在 at（未来），但振荡器此刻已启动：
          // 必须先把瞬时增益压到 0，否则启动到 at 之间会以默认增益 1.0 爆音
          env.gain.value = 0.0001;
          applyDecayEnvelope(env.gain, at, rand(0.03, 0.055), 0.032, 0.006);
          osc.connect(env);
          return { output: env, sources: [osc] };
        });
      }
    },
    () => rand(650, 1600),
    rand(300, 1200),
  );

  return {
    schedulers: [chirpGroups],
    dispose() {
      night.stop();
      nightGain.disconnect();
    },
  };
}
