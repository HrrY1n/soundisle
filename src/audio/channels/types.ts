import type { RandomEventScheduler } from "../scheduler.js";

/**
 * 通道运行时：通道构建产物。
 * 持续层节点常驻运行（开销极低），离散事件由调度器驱动，
 * 引擎在通道开关时启停调度器并用增益淡入淡出。
 */
export interface ChannelRuntime {
  /** 该通道的离散事件调度器；通道关闭时应 stop，开启时 start */
  schedulers: RandomEventScheduler[];
  /** 停止所有持续声源并断开节点 */
  dispose(): void;
}

export type ChannelBuilder = (ctx: AudioContext, sink: AudioNode) => ChannelRuntime;
