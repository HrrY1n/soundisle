import type { ChannelId } from "../audio/channels/defs.js";
import { CHANNEL_DEFS } from "../audio/channels/defs.js";

export type Theme = "dark" | "light";

export interface ChannelPrefs {
  enabled: boolean;
  volume: number;
}

export interface CustomMode {
  focusMin: number;
  restMin: number;
}

/** 持久化的应用状态（localStorage），stats 见 stats.ts */
export interface PersistedState {
  theme: Theme;
  channels: Record<ChannelId, ChannelPrefs>;
  modeId: string;
  custom: CustomMode;
}

export function defaultState(): PersistedState {
  const channels = {} as Record<ChannelId, ChannelPrefs>;
  for (const def of CHANNEL_DEFS) {
    channels[def.id] = { enabled: def.id === "rain", volume: def.defaultVolume };
  }
  return {
    theme: "dark",
    channels,
    modeId: "pomodoro",
    custom: { focusMin: 30, restMin: 6 },
  };
}
