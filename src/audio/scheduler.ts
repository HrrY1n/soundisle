/**
 * 随机事件调度器：驱动环境音中的离散事件（雨滴、爆裂、雷、鸟叫、气泡）。
 * 每次触发后按「随机间隔函数」安排下一次；start/stop 幂等，配合通道开关使用。
 */
export class RandomEventScheduler {
  #timer: ReturnType<typeof setTimeout> | null = null;
  #running = false;

  constructor(
    private fire: () => void,
    private nextGapMs: () => number,
    /** 首次启动时的额外延迟，避免多个通道同时启动时事件齐发 */
    private initialDelayMs = 0,
  ) {}

  start(): void {
    if (this.#running) return;
    this.#running = true;
    this.#timer = setTimeout(this.#tick, this.initialDelayMs);
  }

  stop(): void {
    this.#running = false;
    if (this.#timer !== null) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
  }

  dispose(): void {
    this.stop();
  }

  #tick = (): void => {
    if (!this.#running) return;
    this.fire();
    this.#timer = setTimeout(this.#tick, Math.max(1, this.nextGapMs()));
  };
}

/** 生成 [min, max) 区间随机数 */
export function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
