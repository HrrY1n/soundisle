import { lastNDaysMinutes, streakDays, todayRecord, type StatsMap } from "../state/stats.js";
import { formatMinutes } from "./format.js";

/**
 * 顶栏统计条：今日专注分钟 + 连续天数 + 最近 7 天迷你柱状图。
 */
export function renderStats(container: HTMLElement, stats: StatsMap, now: Date): void {
  const today = todayRecord(stats, now);
  const streak = streakDays(stats, now);
  const week = lastNDaysMinutes(stats, now, 7);
  const max = Math.max(25, ...week);

  container.replaceChildren();

  const todayEl = document.createElement("span");
  todayEl.className = "stat";
  todayEl.innerHTML = `今日专注 <b>${formatMinutes(today.focusSeconds)}</b>`;
  container.append(todayEl);

  const streakEl = document.createElement("span");
  streakEl.className = "stat";
  streakEl.innerHTML = `连续 <b>${streak}</b> 天`;
  container.append(streakEl);

  const spark = document.createElement("span");
  spark.className = "stat stat--spark";
  spark.setAttribute("aria-hidden", "true");
  for (const minutes of week) {
    const bar = document.createElement("i");
    bar.className = "spark-bar";
    bar.style.height = `${Math.max(2, Math.round((minutes / max) * 18))}px`;
    bar.title = `${minutes} 分钟`;
    spark.append(bar);
  }
  container.append(spark);
}
