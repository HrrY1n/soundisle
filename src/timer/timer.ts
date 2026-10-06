/**
 * 专注计时状态机：idle → focus ⇄ rest，支持暂停/跳过/重置。
 * 用 Date.now 锚定结束时刻而非累加 tick，后台标签页休眠时依然准确。
 * 通过注入 `now` 与 `schedule` 便于单元测试。
 */
export type Phase = "focus" | "rest";
export type TimerStatus = "idle" | "running" | "paused";

export interface TimerSnapshot {
  status: TimerStatus;
  phase: Phase;
  /** 本阶段总秒数 */
  totalSeconds: number;
  /** 本阶段剩余秒数 */
  remainingSeconds: number;
  /** 已完成的完整专注轮数 */
  rounds: number;
}

export interface PhaseEndInfo {
  phase: Phase;
  /** 该阶段累计专注秒数 */
  focusSeconds: number;
  /** true=自然走完；false=用户主动跳过 */
  completed: boolean;
}

export interface TimerCallbacks {
  onPhaseEnd(info: PhaseEndInfo): void;
  onChange?(snapshot: TimerSnapshot): void;
}

export interface TimerOptions {
  focusMinutes: number;
  restMinutes: number;
  callbacks: TimerCallbacks;
  now?: () => number;
  /** 注入定时器便于测试；默认 setInterval(250ms) */
  schedule?: (fn: () => void, ms: number) => () => void;
}

export class FocusTimer {
  #focusMinutes: number;
  #restMinutes: number;
  #callbacks: TimerCallbacks;
  #now: () => number;
  #schedule: (fn: () => void, ms: number) => () => void;

  #status: TimerStatus = "idle";
  #phase: Phase = "focus";
  #rounds = 0;
  /** 本阶段已专注秒数（暂停期间的快照） */
  #elapsedInPhase = 0;
  /** running 时的阶段起点时间戳 */
  #phaseStartedAt = 0;
  #cancelTick: (() => void) | null = null;

  constructor(options: TimerOptions) {
    this.#focusMinutes = options.focusMinutes;
    this.#restMinutes = options.restMinutes;
    this.#callbacks = options.callbacks;
    this.#now = options.now ?? Date.now;
    this.#schedule = options.schedule ?? defaultSchedule;
  }

  get snapshot(): TimerSnapshot {
    const total = this.#phaseTotalSeconds();
    const elapsed = this.#currentElapsed();
    return {
      status: this.#status,
      phase: this.#phase,
      totalSeconds: total,
      remainingSeconds: Math.max(0, Math.ceil(total - elapsed)),
      rounds: this.#rounds,
    };
  }

  /** 仅建议在 idle 状态切换模式；运行中切换由 UI 层先 reset */
  configure(focusMinutes: number, restMinutes: number): void {
    this.#focusMinutes = focusMinutes;
    this.#restMinutes = restMinutes;
    if (this.#status === "idle") this.#resetPhaseClock();
  }

  start(): void {
    if (this.#status === "running") return;
    if (this.#status === "paused") {
      this.#status = "running";
      this.#phaseStartedAt = this.#now();
      this.#startTicking();
      this.#emit();
      return;
    }
    this.#beginPhase("focus");
  }

  pause(): void {
    if (this.#status !== "running") return;
    this.#elapsedInPhase = this.#currentElapsed();
    this.#status = "paused";
    this.#stopTicking();
    this.#emit();
  }

  toggle(): void {
    if (this.#status === "running") this.pause();
    else this.start();
  }

  /** 跳过当前阶段：已专注时间仍上报（completed=false），但不计完整轮 */
  skip(): void {
    if (this.#status === "idle") return;
    const elapsed = this.#currentElapsed();
    this.#callbacks.onPhaseEnd({ phase: this.#phase, focusSeconds: elapsed, completed: false });
    this.#transitionToNext();
  }

  /** 全部丢弃：不上报统计 */
  reset(): void {
    this.#status = "idle";
    this.#phase = "focus";
    this.#rounds = 0;
    this.#resetPhaseClock();
    this.#stopTicking();
    this.#emit();
  }

  #complete(): void {
    const finishedPhase = this.#phase;
    const elapsed = this.#currentElapsed();
    this.#callbacks.onPhaseEnd({ phase: finishedPhase, focusSeconds: elapsed, completed: true });
    this.#transitionToNext();
  }

  #transitionToNext(): void {
    if (this.#phase === "focus") {
      this.#phase = "rest";
    } else {
      this.#phase = "focus";
      this.#rounds += 1;
    }
    this.#beginPhase(this.#phase);
  }

  #beginPhase(phase: Phase): void {
    this.#phase = phase;
    this.#status = "running";
    this.#elapsedInPhase = 0;
    this.#phaseStartedAt = this.#now();
    this.#startTicking();
    this.#emit();
  }

  #resetPhaseClock(): void {
    this.#elapsedInPhase = 0;
    this.#phaseStartedAt = this.#now();
  }

  #phaseTotalSeconds(): number {
    return Math.round((this.#phase === "focus" ? this.#focusMinutes : this.#restMinutes) * 60);
  }

  #currentElapsed(): number {
    if (this.#status !== "running") return this.#elapsedInPhase;
    return this.#elapsedInPhase + (this.#now() - this.#phaseStartedAt) / 1000;
  }

  #startTicking(): void {
    this.#stopTicking();
    this.#cancelTick = this.#schedule(() => {
      if (this.snapshot.remainingSeconds <= 0) {
        this.#complete();
        return;
      }
      this.#emit();
    }, 250);
  }

  #stopTicking(): void {
    this.#cancelTick?.();
    this.#cancelTick = null;
  }

  #emit(): void {
    this.#callbacks.onChange?.(this.snapshot);
  }
}

function defaultSchedule(fn: () => void, ms: number): () => void {
  const id = setInterval(fn, ms);
  return () => clearInterval(id);
}
