/** 计时模式：预设三种节奏 + 可自定义（自定义值由状态层持久化） */
export interface TimerMode {
  id: string;
  label: string;
  /** 专注分钟数 */
  focusMin: number;
  /** 休息分钟数 */
  restMin: number;
}

export const BUILTIN_MODES: readonly TimerMode[] = [
  { id: "pomodoro", label: "番茄 25/5", focusMin: 25, restMin: 5 },
  { id: "deep", label: "深度 50/10", focusMin: 50, restMin: 10 },
  { id: "flow", label: "心流 90/15", focusMin: 90, restMin: 15 },
];

export function resolveModes(custom: { focusMin: number; restMin: number }): TimerMode[] {
  return [...BUILTIN_MODES, { id: "custom", label: "自定义", focusMin: custom.focusMin, restMin: custom.restMin }];
}

export function clampMinutes(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(180, Math.max(1, Math.round(value)));
}
