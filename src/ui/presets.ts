import { CHANNEL_DEFS, type ChannelId } from "../audio/channels/defs.js";

/**
 * 声景预设：一键编排多个通道（未列出的通道关闭）。
 * 音量是各通道的期望值，切换时由引擎统一淡入。
 */
export interface Preset {
  id: string;
  label: string;
  mood: string;
  mix: Partial<Record<ChannelId, number>>;
}

export const PRESETS: readonly Preset[] = [
  {
    id: "rainy-reading",
    label: "雨夜阅读",
    mood: "雨声敲窗，一盏灯",
    mix: { rain: 0.75, wind: 0.25 },
  },
  {
    id: "winter-hearth",
    label: "炉火冬夜",
    mood: "木柴噼啪，暖光摇曳",
    mix: { fire: 0.8, wind: 0.3 },
  },
  {
    id: "forest-morning",
    label: "森林清晨",
    mood: "鸟鸣溪涧，薄雾未散",
    mix: { birds: 0.7, stream: 0.55, wind: 0.3 },
  },
  {
    id: "summer-courtyard",
    label: "夏夜庭院",
    mood: "虫鸣四起，晚风穿堂",
    mix: { crickets: 0.75, wind: 0.22, stream: 0.18 },
  },
];

/** 将预设映射为六通道完整状态（未列出的通道 → 关闭，音量回到各自默认值） */
export function presetToChannelState(preset: Preset): Map<ChannelId, { enabled: boolean; volume: number }> {
  const map = new Map<ChannelId, { enabled: boolean; volume: number }>();
  for (const def of CHANNEL_DEFS) {
    const volume = preset.mix[def.id];
    map.set(def.id, {
      enabled: volume !== undefined,
      volume: volume ?? def.defaultVolume,
    });
  }
  return map;
}
