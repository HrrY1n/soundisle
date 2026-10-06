/**
 * 六个声音通道的统一描述：id、文案、专属色相、默认音量与电平微调。
 * UI（混音卡片、可视化）与引擎（构建音频图）都以此为准。
 */
export type ChannelId = "rain" | "fire" | "wind" | "stream" | "crickets" | "birds";

export interface ChannelDef {
  id: ChannelId;
  /** 中文名 */
  label: string;
  /** 拉丁名，用于副标题 */
  latin: string;
  /** 通道图标（emoji，简洁且跨平台） */
  icon: string;
  /** 专属色相（0-360），点亮卡片与可视化用 */
  hue: number;
  /** 默认音量 0-1 */
  defaultVolume: number;
  /** 电平微调：各音色在等音量下的响度差异补偿 */
  trim: number;
}

export const CHANNEL_DEFS: readonly ChannelDef[] = [
  { id: "rain",     label: "雨",   latin: "Rain",     icon: "🌧", hue: 205, defaultVolume: 0.7, trim: 0.9 },
  { id: "fire",     label: "炉火", latin: "Fire",     icon: "🔥", hue: 28,  defaultVolume: 0.65, trim: 1.0 },
  { id: "wind",     label: "风",   latin: "Wind",     icon: "🍃", hue: 140, defaultVolume: 0.5, trim: 0.85 },
  { id: "stream",   label: "溪流", latin: "Stream",   icon: "⛰", hue: 175, defaultVolume: 0.55, trim: 0.8 },
  { id: "crickets", label: "夜虫", latin: "Crickets", icon: "🌙", hue: 265, defaultVolume: 0.45, trim: 0.9 },
  { id: "birds",    label: "鸟鸣", latin: "Birds",    icon: "🐦", hue: 95,  defaultVolume: 0.4, trim: 1.15 },
];

export function channelDef(id: ChannelId): ChannelDef {
  const def = CHANNEL_DEFS.find((d) => d.id === id);
  if (!def) throw new Error(`未知通道：${id}`);
  return def;
}
