import type { SoundEngine } from "./engine.js";

/**
 * 阶段切换风铃：三音琶音 + 指数衰减，FM 感的清亮铃声。
 * 专注结束上行（330→440→550），休息结束下行——不看屏幕也知道轮到哪个阶段。
 */
export function playChime(engine: SoundEngine, kind: "focus-end" | "rest-end"): void {
  const ctx = engine.context;
  const sink = engine.chimeSink;
  if (!ctx || !sink) return;

  const freqs =
    kind === "focus-end"
      ? [523.25, 659.25, 783.99] // C5-E5-G5 上行
      : [783.99, 659.25, 523.25]; // 下行
  const t0 = ctx.currentTime + 0.02;

  freqs.forEach((freq, i) => {
    const at = t0 + i * 0.16;
    const carrier = ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.value = freq;

    // 轻微 FM 让铃声有金属质感
    const modulator = ctx.createOscillator();
    modulator.type = "sine";
    modulator.frequency.value = freq * 2.01;
    const modDepth = ctx.createGain();
    modDepth.gain.value = freq * 0.02;
    modulator.connect(modDepth).connect(carrier.frequency);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(0.18, at + 0.015);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 1.6);

    carrier.connect(env).connect(sink);
    carrier.start(at);
    modulator.start(at);
    carrier.stop(at + 1.7);
    modulator.stop(at + 1.7);
    carrier.onended = () => {
      env.disconnect();
      modDepth.disconnect();
    };
  });
}
