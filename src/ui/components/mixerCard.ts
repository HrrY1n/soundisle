import { channelDef, type ChannelId } from "../../audio/channels/defs.js";
import type { ChannelPrefs } from "../../state/appState.js";

export interface MixerCardHandlers {
  onToggle(id: ChannelId): void;
  onVolume(id: ChannelId, volume: number): void;
}

/** 尊重动效偏好时禁用卡片 3D 倾斜 */
function tiltEnabled(): boolean {
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * 混音卡片：div 卡片 + 内部「开关按钮」与「音量滑杆」两个交互元素
 * （button 内嵌 input 是无效 HTML，故拆开）。
 * 开启时以通道专属色点亮（--hue 驱动）；滑杆填充色与拖拽读数走 --fill。
 */
export function buildMixerCard(
  id: ChannelId,
  prefs: ChannelPrefs,
  index: number,
  handlers: MixerCardHandlers,
): HTMLElement {
  const def = channelDef(id);
  const card = document.createElement("div");
  card.className = "mix-card";
  card.dataset.channel = id;
  card.style.setProperty("--hue", String(def.hue));
  card.style.setProperty("--i", String(index));

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "mix-card__toggle";
  toggle.setAttribute("aria-pressed", String(prefs.enabled));
  toggle.title = `${def.label} ${def.latin} · 快捷键 ${channelHotkey(id)}`;

  const icon = document.createElement("span");
  icon.className = "mix-card__icon";
  icon.textContent = def.icon;
  icon.setAttribute("aria-hidden", "true");

  const name = document.createElement("span");
  name.className = "mix-card__label";
  name.textContent = def.label;

  const latin = document.createElement("span");
  latin.className = "mix-card__latin";
  latin.textContent = def.latin;

  toggle.append(icon, name, latin);
  toggle.addEventListener("click", () => handlers.onToggle(id));

  const slider = document.createElement("input");
  slider.type = "range";
  slider.className = "mix-card__slider";
  slider.min = "0";
  slider.max = "100";
  slider.value = String(Math.round(prefs.volume * 100));
  slider.setAttribute("aria-label", `${def.label}音量`);

  const readout = document.createElement("span");
  readout.className = "mix-card__value";
  readout.textContent = String(Math.round(prefs.volume * 100));
  readout.setAttribute("aria-hidden", "true");

  const syncFill = () => {
    const pct = Number(slider.value);
    slider.style.setProperty("--fill", `${pct}%`);
    readout.textContent = String(pct);
  };
  slider.addEventListener("input", () => {
    syncFill();
    handlers.onVolume(id, Number(slider.value) / 100);
  });
  slider.addEventListener("pointerdown", () => card.classList.add("is-dragging"));
  window.addEventListener("pointerup", () => card.classList.remove("is-dragging"));
  syncFill();

  card.append(toggle, slider, readout);

  // 指针跟随的轻微 3D 倾斜（触屏无 hover，不受影响）
  if (tiltEnabled()) {
    card.addEventListener("pointermove", (e) => {
      const rect = card.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      card.style.setProperty("--tilt-x", `${(-py * 5).toFixed(2)}deg`);
      card.style.setProperty("--tilt-y", `${(px * 6).toFixed(2)}deg`);
    });
    card.addEventListener("pointerleave", () => {
      card.style.setProperty("--tilt-x", "0deg");
      card.style.setProperty("--tilt-y", "0deg");
    });
  }

  return card;
}

/** 通道快捷键 1-6 */
export function channelHotkey(id: ChannelId): string {
  const order: ChannelId[] = ["rain", "fire", "wind", "stream", "crickets", "birds"];
  const index = order.indexOf(id);
  return index >= 0 ? String(index + 1) : "";
}

export function syncMixerCard(card: HTMLElement, prefs: ChannelPrefs): void {
  card.classList.toggle("is-on", prefs.enabled);
  const toggle = card.querySelector<HTMLButtonElement>(".mix-card__toggle");
  if (toggle) toggle.setAttribute("aria-pressed", String(prefs.enabled));
}

/** 快捷键触发时的视觉回响（光晕扩散一圈） */
export function flashMixerCard(card: HTMLElement): void {
  card.classList.remove("is-flash");
  // 强制 reflow 以重启动画
  void card.offsetWidth;
  card.classList.add("is-flash");
  card.addEventListener("animationend", () => card.classList.remove("is-flash"), { once: true });
}
