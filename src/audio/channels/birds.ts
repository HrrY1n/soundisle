import { RandomEventScheduler, rand } from "../scheduler.js";
import { createPanner, triggerVoice } from "../voice.js";
import type { ChannelRuntime } from "./types.js";

/**
 * 鸟鸣 = 稀疏的扫频啁啾（1-3 个音节，2-4kHz 快速上下滑），
 * 每次出现在随机声像位置。无持续层——鸟鸣应该是「点缀」而非「背景」。
 */
export function buildBirds(ctx: AudioContext, sink: AudioNode): ChannelRuntime {
  const chirps = new RandomEventScheduler(
    () => {
      const pan = createPanner(ctx);
      pan.connect(sink);
      const syllables = 1 + Math.floor(rand(0, 3));
      const basePitch = rand(2200, 3200);
      const direction = Math.random() < 0.5 ? 1 : -1;
      let cursor = ctx.currentTime;
      for (let i = 0; i < syllables; i += 1) {
        const dur = rand(0.06, 0.13);
        const pitch = basePitch * (1 + i * rand(-0.05, 0.12));
        const peak = pitch + direction * rand(400, 900);
        triggerVoice(ctx, pan, dur + 0.05, (t0) => {
          const at = Math.max(t0, cursor);
          const osc = ctx.createOscillator();
          osc.type = "sine";
          osc.frequency.setValueAtTime(pitch, at);
          osc.frequency.exponentialRampToValueAtTime(Math.max(peak, 400), at + dur * 0.6);
          osc.frequency.exponentialRampToValueAtTime(pitch * 0.9, at + dur);
          const env = ctx.createGain();
          env.gain.setValueAtTime(0.0001, at);
          env.gain.exponentialRampToValueAtTime(rand(0.02, 0.045), at + 0.012);
          env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
          osc.connect(env);
          return { output: env, sources: [osc] };
        });
        cursor += dur + rand(0.04, 0.12);
      }
    },
    () => rand(1800, 9000),
    rand(1500, 5000),
  );

  return {
    schedulers: [chirps],
    dispose() {},
  };
}
