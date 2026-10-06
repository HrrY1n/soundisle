import { describe, expect, it } from "vitest";
import {
  dateKey,
  emptyRecord,
  lastNDaysMinutes,
  recordFocus,
  streakDays,
  todayRecord,
  type StatsMap,
} from "../src/state/stats.js";

const DAY = 24 * 60 * 60 * 1000;
// 2026-10-04（周日）
const NOW = new Date(2026, 9, 4, 15, 30);

describe("dateKey", () => {
  it("输出 YYYY-MM-DD 且补零", () => {
    expect(dateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(dateKey(NOW)).toBe("2026-10-04");
  });
});

describe("recordFocus", () => {
  it("累加同日记录并计轮", () => {
    let stats: StatsMap = {};
    stats = recordFocus(stats, NOW, 25 * 60, { roundCompleted: true });
    stats = recordFocus(stats, NOW, 600, { roundCompleted: false });
    expect(stats["2026-10-04"]).toEqual({ focusSeconds: 25 * 60 + 600, rounds: 1 });
  });

  it("不足 1 秒不产生记录", () => {
    const stats = recordFocus({}, NOW, 0.2);
    expect(stats).toEqual({});
  });

  it("跨天分键记录", () => {
    const yesterday = new Date(NOW.getTime() - DAY);
    const stats = recordFocus(recordFocus({}, NOW, 60), yesterday, 120);
    expect(Object.keys(stats)).toHaveLength(2);
  });
});

describe("streakDays", () => {
  it("今天没开始：从昨天倒推，不清零连胜", () => {
    const stats: StatsMap = {
      "2026-10-03": { focusSeconds: 600, rounds: 1 },
      "2026-10-02": { focusSeconds: 600, rounds: 1 },
    };
    expect(streakDays(stats, NOW)).toBe(2);
  });

  it("今天已有专注：含今天倒推", () => {
    const stats: StatsMap = {
      "2026-10-04": { focusSeconds: 300, rounds: 1 },
      "2026-10-03": { focusSeconds: 600, rounds: 1 },
    };
    expect(streakDays(stats, NOW)).toBe(2);
  });

  it("中间断一天即断", () => {
    const stats: StatsMap = {
      "2026-10-04": { focusSeconds: 300, rounds: 1 },
      "2026-10-01": { focusSeconds: 300, rounds: 1 },
    };
    expect(streakDays(stats, NOW)).toBe(1);
  });

  it("空记录为 0", () => {
    expect(streakDays({}, NOW)).toBe(0);
  });
});

describe("lastNDaysMinutes", () => {
  it("升序返回 n 天分钟数，今天在最后", () => {
    const stats: StatsMap = {
      "2026-10-04": { focusSeconds: 1800, rounds: 1 }, // 今天 30 分钟
      "2026-09-30": { focusSeconds: 600, rounds: 1 }, // 4 天前 10 分钟
    };
    const week = lastNDaysMinutes(stats, NOW, 7);
    expect(week).toHaveLength(7);
    expect(week[0]).toBe(0); // 09-28
    expect(week[2]).toBe(10); // 09-30
    expect(week[6]).toBe(30); // 今天
  });
});

describe("todayRecord", () => {
  it("无记录时返回空记录", () => {
    expect(todayRecord({}, NOW)).toEqual(emptyRecord());
  });
});
