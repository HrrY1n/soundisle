import { describe, expect, it } from "vitest";
import { FocusTimer, type TimerSnapshot, type PhaseEndInfo } from "../src/timer/timer.js";

/** 手动时钟 + 手动调度：完全可控的计时器测试环境 */
function createHarness(focusMinutes = 25, restMinutes = 5) {
  let time = 0;
  let tick: (() => void) | null = null;
  const phaseEnds: PhaseEndInfo[] = [];
  const changes: TimerSnapshot[] = [];

  const timer = new FocusTimer({
    focusMinutes,
    restMinutes,
    now: () => time,
    schedule: (fn) => {
      tick = fn;
      return () => {
        tick = null;
      };
    },
    callbacks: {
      onPhaseEnd: (info) => phaseEnds.push(info),
      onChange: (snapshot) => changes.push(snapshot),
    },
  });

  return {
    timer,
    advance(ms: number) {
      time += ms;
      tick?.();
    },
    phaseEnds,
    changes,
    get time() {
      return time;
    },
  };
}

describe("FocusTimer", () => {
  it("初始为 idle，显示完整专注时长", () => {
    const h = createHarness();
    const s = h.timer.snapshot;
    expect(s.status).toBe("idle");
    expect(s.phase).toBe("focus");
    expect(s.remainingSeconds).toBe(1500);
    expect(s.rounds).toBe(0);
  });

  it("start 后开始倒计时", () => {
    const h = createHarness();
    h.timer.start();
    expect(h.timer.snapshot.status).toBe("running");
    h.advance(60_000);
    expect(h.timer.snapshot.remainingSeconds).toBe(1440);
  });

  it("暂停冻结剩余时间，继续后接着走", () => {
    const h = createHarness();
    h.timer.start();
    h.advance(60_000);
    h.timer.pause();
    expect(h.timer.snapshot.status).toBe("paused");
    h.advance(120_000);
    expect(h.timer.snapshot.remainingSeconds).toBe(1440);
    h.timer.start();
    h.advance(5_000);
    expect(h.timer.snapshot.remainingSeconds).toBe(1435);
  });

  it("专注自然结束 → 上报 completed，进入休息", () => {
    const h = createHarness();
    h.timer.start();
    h.advance(1500_000);
    expect(h.phaseEnds).toHaveLength(1);
    expect(h.phaseEnds[0]).toMatchObject({ phase: "focus", completed: true });
    expect(h.phaseEnds[0]!.focusSeconds).toBeCloseTo(1500, 0);
    expect(h.timer.snapshot.phase).toBe("rest");
    expect(h.timer.snapshot.remainingSeconds).toBe(300);
  });

  it("休息结束 → 轮数 +1，回到专注", () => {
    const h = createHarness();
    h.timer.start();
    h.advance(1500_000);
    h.advance(300_000);
    expect(h.phaseEnds).toHaveLength(2);
    expect(h.timer.snapshot.phase).toBe("focus");
    expect(h.timer.snapshot.rounds).toBe(1);
    expect(h.timer.snapshot.remainingSeconds).toBe(1500);
  });

  it("跳过专注：上报未完成的专注秒数（completed=false），不计轮", () => {
    const h = createHarness();
    h.timer.start();
    h.advance(600_000);
    h.timer.skip();
    expect(h.phaseEnds[0]).toMatchObject({ phase: "focus", completed: false });
    expect(h.phaseEnds[0]!.focusSeconds).toBeCloseTo(600, 0);
    expect(h.timer.snapshot.phase).toBe("rest");
    expect(h.timer.snapshot.rounds).toBe(0);
  });

  it("跳过休息：专注轮已完成，计轮", () => {
    const h = createHarness();
    h.timer.start();
    h.advance(1500_000);
    h.timer.skip();
    expect(h.timer.snapshot.phase).toBe("focus");
    expect(h.timer.snapshot.rounds).toBe(1);
  });

  it("reset 归零且不上报", () => {
    const h = createHarness();
    h.timer.start();
    h.advance(600_000);
    h.timer.reset();
    expect(h.phaseEnds).toHaveLength(0);
    expect(h.timer.snapshot).toMatchObject({ status: "idle", phase: "focus", remainingSeconds: 1500, rounds: 0 });
  });

  it("toggle 在开始/暂停间切换", () => {
    const h = createHarness();
    h.timer.toggle();
    expect(h.timer.snapshot.status).toBe("running");
    h.timer.toggle();
    expect(h.timer.snapshot.status).toBe("paused");
  });

  it("后台时间锚定：暂停期间不因真实时间流逝而偏离", () => {
    const h = createHarness(1, 1);
    h.timer.start();
    h.advance(30_000);
    h.timer.pause();
    // 真实时间大幅流逝（模拟后台标签页），但暂停状态不累计
    h.advance(10 * 60_000);
    expect(h.timer.snapshot.remainingSeconds).toBe(30);
  });
});
