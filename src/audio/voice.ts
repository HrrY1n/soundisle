import { rand } from "./scheduler.js";

/**
 * 一次性「事件语音」辅助：雨滴、爆裂、鸟叫等短事件共享的模式。
 * 契约：setup 负责把信号链连到 `output`，triggerVoice 只把 `output` 接入 sink、
 * 启停声源、结束后断开清理。
 * （历史教训：绝不能把链上每个节点都连一遍 sink——那会让原始未滤波的
 * 声源信号满幅直通混音，表现为持续底噪与削波。）
 */
export interface VoiceSetup {
  /** 唯一接入 sink 的出口节点 */
  output: AudioNode;
  /** 需要启停的声源 */
  sources: Array<AudioScheduledSourceNode>;
  /** 仅需断开清理的中间节点 */
  extras?: AudioNode[];
}

export function triggerVoice(
  ctx: BaseAudioContext,
  sink: AudioNode,
  duration: number,
  setup: (t0: number) => VoiceSetup,
): void {
  const t0 = ctx.currentTime;
  const { output, sources, extras = [] } = setup(t0);
  output.connect(sink);
  for (const source of sources) {
    source.start(t0);
    source.stop(t0 + duration);
    source.onended = () => {
      output.disconnect();
      for (const node of extras) node.disconnect();
    };
  }
}

/** 随机声像的一次性节点（大多数事件都希望有空间感） */
export function createPanner(ctx: BaseAudioContext, spread = 0.7): StereoPannerNode {
  const panner = ctx.createStereoPanner();
  panner.pan.value = rand(-spread, spread);
  return panner;
}

/** 快速衰减包络（雨滴/爆裂的「嗒」感） */
export function applyDecayEnvelope(param: AudioParam, t0: number, peak: number, decay: number, attack = 0.002): void {
  param.setValueAtTime(0.0001, t0);
  param.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + attack);
  param.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
}
