/**
 * 专注统计：纯函数实现，全部以 dateKey（YYYY-MM-DD）为键，
 * 便于单元测试与未来导出。
 */
export interface DayRecord {
  /** 聚焦秒数（更精确，展示时再换算分钟） */
  focusSeconds: number;
  /** 完成的专注轮数 */
  rounds: number;
}

export type StatsMap = Record<string, DayRecord>;

export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function emptyRecord(): DayRecord {
  return { focusSeconds: 0, rounds: 0 };
}

/** 累加一次专注段（可能来自一次完整轮或中途跳过/重置时已专注的部分） */
export function recordFocus(
  stats: StatsMap,
  now: Date,
  focusSeconds: number,
  opts: { roundCompleted: boolean } = { roundCompleted: true },
): StatsMap {
  if (focusSeconds < 1) return stats;
  const key = dateKey(now);
  const prev = stats[key] ?? emptyRecord();
  return {
    ...stats,
    [key]: {
      focusSeconds: prev.focusSeconds + Math.round(focusSeconds),
      rounds: prev.rounds + (opts.roundCompleted ? 1 : 0),
    },
  };
}

export function todayRecord(stats: StatsMap, now: Date): DayRecord {
  return stats[dateKey(now)] ?? emptyRecord();
}

/**
 * 连续天数：从今天往回数，今天尚未专注则从昨天起算（避免「今天还没开始」就把连胜清零）。
 */
export function streakDays(stats: StatsMap, now: Date): number {
  const hasFocus = (d: Date) => (stats[dateKey(d)]?.focusSeconds ?? 0) > 0;
  const day = 24 * 60 * 60 * 1000;
  let cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!hasFocus(cursor)) cursor = new Date(cursor.getTime() - day);
  let streak = 0;
  while (hasFocus(cursor)) {
    streak += 1;
    cursor = new Date(cursor.getTime() - day);
  }
  return streak;
}

/** 最近 n 天（含今天，按时间升序）的聚焦分钟数，用于迷你柱状图 */
export function lastNDaysMinutes(stats: StatsMap, now: Date, n: number): number[] {
  const day = 24 * 60 * 60 * 1000;
  const result: number[] = [];
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(base.getTime() - i * day);
    result.push(Math.round((stats[dateKey(d)]?.focusSeconds ?? 0) / 60));
  }
  return result;
}
