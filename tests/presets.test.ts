import { describe, expect, it } from "vitest";
import { CHANNEL_DEFS } from "../src/audio/channels/defs.js";
import { PRESETS, presetToChannelState } from "../src/ui/presets.js";
import { BUILTIN_MODES, clampMinutes, resolveModes } from "../src/timer/modes.js";
import { defaultState } from "../src/state/appState.js";

describe("presets", () => {
  it("预设映射覆盖全部六个通道", () => {
    for (const preset of PRESETS) {
      const mix = presetToChannelState(preset);
      expect(mix.size).toBe(CHANNEL_DEFS.length);
      for (const def of CHANNEL_DEFS) {
        const state = mix.get(def.id)!;
        if (preset.mix[def.id] !== undefined) {
          expect(state.enabled).toBe(true);
          expect(state.volume).toBe(preset.mix[def.id]);
        } else {
          expect(state.enabled).toBe(false);
          expect(state.volume).toBe(def.defaultVolume);
        }
      }
    }
  });

  it("每个预设至少点亮一个通道，且音量在 0-1 内", () => {
    for (const preset of PRESETS) {
      const on = Object.values(preset.mix);
      expect(on.length).toBeGreaterThanOrEqual(1);
      for (const v of on) expect(v).toBeGreaterThan(0);
      for (const v of on) expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe("modes", () => {
  it("resolveModes 追加自定义模式", () => {
    const modes = resolveModes({ focusMin: 30, restMin: 6 });
    expect(modes).toHaveLength(BUILTIN_MODES.length + 1);
    expect(modes.at(-1)).toEqual({ id: "custom", label: "自定义", focusMin: 30, restMin: 6 });
  });

  it("clampMinutes 约束到 [1,180]", () => {
    expect(clampMinutes(0)).toBe(1);
    expect(clampMinutes(-5)).toBe(1);
    expect(clampMinutes(1.4)).toBe(1);
    expect(clampMinutes(500)).toBe(180);
    expect(clampMinutes(Number.NaN)).toBe(1);
  });
});

describe("defaultState", () => {
  it("默认开启雨声，其余关闭", () => {
    const state = defaultState();
    expect(state.channels.rain!.enabled).toBe(true);
    for (const def of CHANNEL_DEFS) {
      if (def.id !== "rain") expect(state.channels[def.id]!.enabled).toBe(false);
    }
    expect(state.theme).toBe("dark");
    expect(state.modeId).toBe("pomodoro");
  });

  it("所有通道都有合法音量", () => {
    const state = defaultState();
    for (const def of CHANNEL_DEFS) {
      const v = state.channels[def.id]!.volume;
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
