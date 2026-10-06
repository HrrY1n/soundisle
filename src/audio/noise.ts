/**
 * 噪声缓冲工厂：所有环境音的原料。
 * 白噪 = 平坦频谱；粉噪 = 每 octave -3dB（Kellet 滤波近似）；棕噪 = 每 octave -6dB（积分白噪）。
 * 缓冲按类型缓存复用。两处必要的音频卫生：
 *  1) 去直流（棕噪随机游走会带 DC，直流进滤波器/压限器会产生噗声与失真）；
 *  2) 环绕交叉淡化（把尾部混入头部），否则 4 秒循环接缝处会产生周期性咔哒/低频顿挫。
 */

export type NoiseColor = "white" | "pink" | "brown";

const BUFFER_SECONDS = 4;
const cache = new WeakMap<BaseAudioContext, Map<NoiseColor, AudioBuffer>>();

function generate(color: NoiseColor, sampleRate: number): Float32Array<ArrayBuffer> {
  const length = sampleRate * BUFFER_SECONDS;
  const data = new Float32Array(length);

  if (color === "white") {
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  } else if (color === "pink") {
    // Paul Kellet 经济版粉噪滤波器
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      b6 = white * 0.115926;
      data[i] = pink * 0.11;
    }
  } else {
    // brown：维纳积分，白噪泄漏一点防止直流漂移
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
  }

  // 1) 去直流
  let mean = 0;
  for (let i = 0; i < length; i += 1) mean += data[i] ?? 0;
  mean /= length;
  for (let i = 0; i < length; i += 1) data[i] = (data[i] ?? 0) - mean;

  // 2) 环绕交叉淡化：头部 60ms 与尾部等功率叠加，消除循环接缝
  const fade = Math.min(Math.floor(sampleRate * 0.06), length >> 2);
  for (let i = 0; i < fade; i += 1) {
    const t = i / fade;
    const wHead = Math.sin(t * Math.PI * 0.5);
    const wTail = Math.cos(t * Math.PI * 0.5);
    data[i] = (data[i] ?? 0) * wHead + (data[length - fade + i] ?? 0) * wTail;
  }

  return data;
}

export function getNoiseBuffer(ctx: BaseAudioContext, color: NoiseColor): AudioBuffer {
  let perCtx = cache.get(ctx);
  if (!perCtx) {
    perCtx = new Map();
    cache.set(ctx, perCtx);
  }
  const existing = perCtx.get(color);
  if (existing) return existing;

  const buffer = ctx.createBuffer(1, ctx.sampleRate * BUFFER_SECONDS, ctx.sampleRate);
  buffer.copyToChannel(generate(color, ctx.sampleRate), 0);
  perCtx.set(color, buffer);
  return buffer;
}

/** 创建一个循环播放的噪声源（不连接任何输出，由调用方连接） */
export function createNoiseSource(ctx: BaseAudioContext, color: NoiseColor): AudioBufferSourceNode {
  const source = ctx.createBufferSource();
  source.buffer = getNoiseBuffer(ctx, color);
  source.loop = true;
  return source;
}
