import "@fontsource/space-grotesk/300.css";
import "@fontsource/space-grotesk/500.css";

import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/responsive.css";

import { playChime } from "./audio/chime.js";
import { CHANNEL_DEFS, type ChannelId } from "./audio/channels/defs.js";
import { SoundEngine } from "./audio/engine.js";
import { resolveModes } from "./timer/modes.js";
import { FocusTimer, type TimerSnapshot } from "./timer/timer.js";
import { defaultState, type ChannelPrefs, type PersistedState, type Theme } from "./state/appState.js";
import { recordFocus, type StatsMap } from "./state/stats.js";
import { Store } from "./state/store.js";
import { APP_STORAGE_KEY, createMemoryBackend, PersistentStore, localStorageBackend } from "./state/storage.js";
import { buildMixerCard, flashMixerCard, syncMixerCard } from "./ui/components/mixerCard.js";
import { TimerPanel } from "./ui/components/timerPanel.js";
import { formatClock } from "./ui/format.js";
import { PRESETS, presetToChannelState } from "./ui/presets.js";
import { Scene } from "./ui/scene.js";
import { renderStats } from "./ui/statsBar.js";

interface AppState extends PersistedState {
  stats: StatsMap;
}

// —— 存储与状态 ——————————————————————————————————————————
const backend = import.meta.env.MODE === "test" ? createMemoryBackend() : localStorageBackend;
const persistent = new PersistentStore(backend);
const firstRun = backend.getItem(APP_STORAGE_KEY) === null;
const initialState = persistent.load<AppState>({ ...defaultState(), stats: {} });
const store = new Store<AppState>(initialState);

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function persist(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => persistent.save(store.state), 250);
}

// —— 引擎 ——————————————————————————————————————————————
const engine = new SoundEngine();
for (const [id, prefs] of Object.entries(initialState.channels)) {
  engine.setChannel(id as ChannelId, prefs);
}

// —— 计时器 ——————————————————————————————————————————————
const modes = () => resolveModes(store.state.custom);
const currentMode = () => modes().find((m) => m.id === store.state.modeId) ?? modes()[0]!;

const timerPanel = new TimerPanel({
  onMainAction: () => {
    void engine.start();
    timer.toggle();
  },
  onSkip: () => timer.skip(),
  onReset: () => timer.reset(),
  onModeSelect: selectMode,
});

const timer = new FocusTimer({
  focusMinutes: currentMode().focusMin,
  restMinutes: currentMode().restMin,
  callbacks: {
    onPhaseEnd({ phase, focusSeconds, completed }) {
      if (phase === "focus" && focusSeconds >= 1) {
        store.update((s) => ({
          stats: recordFocus(s.stats, new Date(), focusSeconds, { roundCompleted: completed }),
        }));
      }
      playChime(engine, phase === "focus" ? "focus-end" : "rest-end");
    },
    onChange(snapshot) {
      if (snapshot.phase !== lastPhase) {
        lastPhase = snapshot.phase;
        timerPanel.root.classList.remove("phase-flip");
        void timerPanel.root.offsetWidth;
        timerPanel.root.classList.add("phase-flip");
      }
      timerPanel.render(snapshot);
      updateDocumentTitle(snapshot);
    },
  },
});

let lastPhase: TimerSnapshot["phase"] | null = null;

function selectMode(modeId: string): void {
  timer.reset();
  store.set({ modeId: modeId });
  const mode = modes().find((m) => m.id === modeId) ?? modes()[0]!;
  timer.configure(mode.focusMin, mode.restMin);
  timerPanel.renderModeButtons(modes(), modeId);
  timerPanel.setActiveMode(modeId);
  syncCustomEditor();
  timerPanel.render(timer.snapshot);
  persist();
}

function handleCustomChange(focusMin: number, restMin: number): void {
  store.set({ custom: { focusMin, restMin } });
  timer.configure(focusMin, restMin);
  timerPanel.render(timer.snapshot);
  persist();
}

function syncCustomEditor(): void {
  if (store.state.modeId === "custom") {
    timerPanel.renderCustomEditor(store.state.custom, handleCustomChange);
  } else {
    timerPanel.hideCustomEditor();
  }
}

function updateDocumentTitle(snapshot: TimerSnapshot): void {
  document.title =
    snapshot.status === "idle"
      ? "声屿 SoundIsle · 专注声境工作台"
      : `${formatClock(snapshot.remainingSeconds)} ${snapshot.phase === "focus" ? "专注" : "休息"} · 声屿`;
}

// —— 混音台 ——————————————————————————————————————————————
const mixerGrid = document.getElementById("mixer-grid") as HTMLElement;
const cardById = new Map<ChannelId, HTMLElement>();

function toggleChannel(id: ChannelId): void {
  void engine.start();
  const enabled = !engine.getChannelState(id).enabled;
  applyChannelState(id, { ...store.state.channels[id]!, enabled });
}

for (const [index, def] of CHANNEL_DEFS.entries()) {
  const prefs = store.state.channels[def.id]!;
  const card = buildMixerCard(def.id, prefs, index, {
    onToggle: toggleChannel,
    onVolume: (id, volume) => {
      engine.setChannel(id, { volume });
      const prefs2 = { ...store.state.channels[id]!, volume };
      store.update((s) => ({ channels: { ...s.channels, [id]: prefs2 } }));
      persist();
    },
  });
  syncMixerCard(card, prefs);
  cardById.set(def.id, card);
  mixerGrid.append(card);
}

function applyChannelState(
  id: ChannelId,
  prefs: ChannelPrefs,
): void {
  engine.setChannel(id, prefs);
  store.update((s) => ({ channels: { ...s.channels, [id]: prefs } }));
  const card = cardById.get(id);
  if (card) syncMixerCard(card, prefs);
  syncScene();
  persist();
}

function syncScene(): void {
  const enabled = new Set(
    CHANNEL_DEFS.filter((d) => engine.getChannelState(d.id).enabled).map((d) => d.id),
  );
  scene.setEnabledChannels(enabled);
}

// —— 预设 ——————————————————————————————————————————————
const presetRow = document.getElementById("presets") as HTMLElement;
for (const preset of PRESETS) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "preset-btn";
  btn.textContent = preset.label;
  btn.title = preset.mood;
  btn.addEventListener("click", () => {
    void engine.start();
    const mix = presetToChannelState(preset);
    for (const [id, prefs] of mix) applyChannelState(id, prefs);
  });
  presetRow.append(btn);
}

// —— 顶栏 ——————————————————————————————————————————————
const statsEl = document.getElementById("stats") as HTMLElement;
const themeBtn = document.getElementById("theme-toggle") as HTMLButtonElement;
const muteBtn = document.getElementById("mute-toggle") as HTMLButtonElement;

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  themeBtn.textContent = theme === "dark" ? "🌙" : "☀️";
  scene.setTheme(theme);
}

themeBtn.addEventListener("click", () => {
  const next: Theme = store.state.theme === "dark" ? "light" : "dark";
  store.set({ theme: next });
  applyTheme(next);
  persist();
});

muteBtn.addEventListener("click", () => {
  engine.setMuted(!engine.muted);
  muteBtn.textContent = engine.muted ? "🔇" : "🔈";
  muteBtn.setAttribute("aria-pressed", String(engine.muted));
  muteBtn.setAttribute("aria-label", engine.muted ? "取消静音" : "静音");
  document.documentElement.dataset.muted = String(engine.muted);
  scene.setMuted(engine.muted);
});

// —— 夜海场景 —————————————————————————————————————————————
const sceneCanvas = document.getElementById("scene") as HTMLCanvasElement;
const scene = new Scene(sceneCanvas, engine);
const sceneResize = new ResizeObserver(() => scene.resize());
sceneResize.observe(sceneCanvas);
scene.resize();
scene.start();
syncScene();

// —— 挂载与初始渲染 ————————————————————————————————————————
(document.getElementById("timer-panel") as HTMLElement).append(timerPanel.root);
timerPanel.renderModeButtons(modes(), store.state.modeId);
timerPanel.setActiveMode(store.state.modeId);
syncCustomEditor();
timerPanel.render(timer.snapshot);
applyTheme(store.state.theme);
renderStats(statsEl, store.state.stats, new Date());
// 统计条仅在 stats 变化时重建（音量拖动等高频更新不触发 DOM 重建）
let lastStats = store.state.stats;
store.subscribe((s) => {
  if (s.stats !== lastStats) {
    lastStats = s.stats;
    renderStats(statsEl, s.stats, new Date());
  }
});

// 首次任意交互唤醒音频上下文（浏览器自动播放策略要求用户手势）
document.addEventListener(
  "pointerdown",
  () => {
    void engine.start();
    const hint = document.getElementById("hint");
    if (hint) hint.textContent = "空格 开始/暂停 · M 静音 · T 切换主题 · 1-6 切换声音";
  },
  { capture: true },
);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    void engine.resume();
  } else {
    persistent.save(store.state); // 切走前落盘，防抖中的状态不丢失
  }
});

let suppressSaveOnUnload = false;
window.addEventListener("beforeunload", () => {
  if (!suppressSaveOnUnload) persistent.save(store.state);
});

// —— 键盘快捷键 ————————————————————————————————————————————
window.addEventListener("keydown", (e) => {
  const target = e.target as HTMLElement | null;
  const inField =
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement;
  if (inField) return;
  const onButton = target instanceof HTMLButtonElement;

  if (e.code === "Space" && !onButton) {
    e.preventDefault();
    void engine.start();
    timer.toggle();
  } else if (e.key.toLowerCase() === "m" && !e.metaKey && !e.ctrlKey) {
    muteBtn.click();
  } else if (e.key.toLowerCase() === "t" && !e.metaKey && !e.ctrlKey) {
    themeBtn.click();
  } else if (/^[1-6]$/.test(e.key)) {
    const def = CHANNEL_DEFS[Number(e.key) - 1];
    if (def) {
      toggleChannel(def.id);
      const card = cardById.get(def.id);
      if (card) flashMixerCard(card);
    }
  }
});

if (firstRun) {
  // 首次到访：给一个最短可感知的引导
  const hint = document.getElementById("hint");
  if (hint) {
    hint.innerHTML = "点击页面任意处，唤醒雨声 · <b>空格</b> 开始专注";
  }
}

// 入场动画保险丝：无论环境如何节流/冻结 CSS 动画，2.5s 后强制落位
setTimeout(() => document.getElementById("app")?.classList.add("is-settled"), 2500);

// 调试/自动化测试句柄（只读快照 + 受控操作入口）
const debugHandle = {
  engine,
  timer,
  getState: () => store.state,
  getChannelGain: (id: ChannelId) => engine.getChannelGainValue(id),
  masterNode: () => engine.masterNode,
  /** 清空持久化状态并跳过本次卸载回写，用于测试/支持重置 */
  clearState(): void {
    suppressSaveOnUnload = true;
    localStorage.removeItem(APP_STORAGE_KEY);
  },
};
(window as unknown as { __soundisle?: typeof debugHandle }).__soundisle = debugHandle;
