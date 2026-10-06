import type { TimerSnapshot } from "../../timer/timer.js";
import { clampMinutes } from "../../timer/modes.js";
import { formatClock } from "../format.js";

const RING_RADIUS = 118;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * 计时器面板：SVG 圆环进度 + 大钟读数 + 控制按钮 + 模式切换。
 * 提供完整 DOM 更新方法，由 main.ts 订阅 timer/store 后调用。
 */
export class TimerPanel {
  readonly root: HTMLElement;
  #ringFill: SVGCircleElement;
  #clock: HTMLTimeElement;
  #phase: HTMLElement;
  #round: HTMLElement;
  #mainBtn: HTMLButtonElement;
  #modeWrap: HTMLElement;
  #onModeSelect: (modeId: string) => void;
  #modeButtons = new Map<string, HTMLButtonElement>();

  constructor(opts: {
    onMainAction(): void;
    onSkip(): void;
    onReset(): void;
    onModeSelect(modeId: string): void;
  }) {
    this.#onModeSelect = opts.onModeSelect;
    this.root = document.createElement("div");
    this.root.className = "timer-panel__inner";

    const ringWrap = document.createElement("div");
    ringWrap.className = "timer-ring-wrap";
    ringWrap.innerHTML = `
      <svg class="timer-ring" viewBox="0 0 260 260" aria-hidden="true">
        <circle class="timer-ring__track" cx="130" cy="130" r="${RING_RADIUS}" />
        <circle class="timer-ring__fill" cx="130" cy="130" r="${RING_RADIUS}" />
      </svg>
      <div class="timer-readout">
        <div class="timer-phase"></div>
        <time class="timer-clock">25:00</time>
        <div class="timer-round"></div>
      </div>`;

    const controls = document.createElement("div");
    controls.className = "timer-controls";

    const skipBtn = document.createElement("button");
    skipBtn.type = "button";
    skipBtn.className = "btn btn--ghost";
    skipBtn.textContent = "跳过 ⏭";
    skipBtn.title = "跳过当前阶段";
    skipBtn.addEventListener("click", opts.onSkip);

    this.#mainBtn = document.createElement("button");
    this.#mainBtn.type = "button";
    this.#mainBtn.className = "btn btn--primary";
    this.#mainBtn.title = "开始 / 暂停（空格）";
    this.#mainBtn.addEventListener("click", opts.onMainAction);

    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "btn btn--ghost";
    resetBtn.textContent = "重置 ↺";
    resetBtn.title = "重置（丢弃当前进度）";
    resetBtn.addEventListener("click", opts.onReset);

    controls.append(skipBtn, this.#mainBtn, resetBtn);

    this.#modeWrap = document.createElement("div");
    this.#modeWrap.className = "timer-modes";
    this.#modeWrap.setAttribute("role", "tablist");
    this.#modeWrap.setAttribute("aria-label", "计时模式");

    this.root.append(ringWrap, controls, this.#modeWrap);

    this.#ringFill = ringWrap.querySelector(".timer-ring__fill") as SVGCircleElement;
    this.#clock = ringWrap.querySelector(".timer-clock") as HTMLTimeElement;
    this.#phase = ringWrap.querySelector(".timer-phase") as HTMLElement;
    this.#round = ringWrap.querySelector(".timer-round") as HTMLElement;
    this.#ringFill.style.strokeDasharray = String(RING_CIRCUMFERENCE);
  }

  renderModeButtons(modes: Array<{ id: string; label: string }>, activeId: string): void {
    this.#modeWrap.replaceChildren();
    this.#modeButtons.clear();
    for (const mode of modes) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mode-pill";
      btn.textContent = mode.label;
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", String(mode.id === activeId));
      btn.addEventListener("click", () => this.#onModeSelect(mode.id));
      this.#modeButtons.set(mode.id, btn);
      this.#modeWrap.append(btn);
    }
  }

  render(snapshot: TimerSnapshot): void {
    const total = snapshot.totalSeconds || 1;
    const progress = 1 - snapshot.remainingSeconds / total;
    this.#ringFill.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - progress));

    this.#clock.textContent = formatClock(snapshot.remainingSeconds);
    this.#clock.setAttribute("datetime", `PT${Math.ceil(snapshot.remainingSeconds)}S`);

    const statusText =
      snapshot.status === "idle" ? "准备开始" : snapshot.status === "paused" ? "已暂停" : null;
    const phaseText =
      snapshot.phase === "focus" ? (statusText ? `${statusText}` : "专注中") : statusText ? `${statusText}` : "休息一下";
    this.#phase.textContent = phaseText;
    this.root.dataset.phase = snapshot.phase;
    this.root.dataset.status = snapshot.status;

    this.#round.textContent = snapshot.rounds > 0 ? `第 ${snapshot.rounds + 1} 轮` : "";

    this.#mainBtn.textContent =
      snapshot.status === "running" ? "⏸ 暂停" : snapshot.status === "paused" ? "▶ 继续" : "▶ 开始专注";
  }

  setActiveMode(modeId: string): void {
    for (const [id, btn] of this.#modeButtons) {
      btn.setAttribute("aria-selected", String(id === modeId));
    }
  }

  /** 自定义模式的分钟数编辑器；选择其它模式时应调用 hideCustomEditor */
  renderCustomEditor(
    custom: { focusMin: number; restMin: number },
    onChange: (focusMin: number, restMin: number) => void,
  ): void {
    this.#custom = { ...custom };
    if (!this.#customEditor) {
      this.#customEditor = document.createElement("div");
      this.#customEditor.className = "custom-editor";
      const make = (label: string, key: "focusMin" | "restMin") => {
        const wrap = document.createElement("label");
        wrap.className = "custom-editor__field";
        const text = document.createElement("span");
        text.textContent = label;
        const input = document.createElement("input");
        input.type = "number";
        input.min = "1";
        input.max = "180";
        input.className = "custom-editor__input";
        input.addEventListener("change", () => {
          const value = clampMinutes(Number(input.value));
          input.value = String(value);
          // 读 this.#custom 而非闭包捕获，避免另一字段用过期值
          this.#custom = {
            focusMin: key === "focusMin" ? value : this.#custom.focusMin,
            restMin: key === "restMin" ? value : this.#custom.restMin,
          };
          onChange(this.#custom.focusMin, this.#custom.restMin);
        });
        wrap.append(text, input);
        this.#customInputs.set(key, input);
        return wrap;
      };
      this.#customEditor.append(
        make("专注", "focusMin"),
        document.createTextNode("分钟"),
        make("休息", "restMin"),
        document.createTextNode("分钟"),
      );
      this.root.append(this.#customEditor);
    }
    const focusInput = this.#customInputs.get("focusMin");
    const restInput = this.#customInputs.get("restMin");
    if (focusInput) focusInput.value = String(custom.focusMin);
    if (restInput) restInput.value = String(custom.restMin);
    this.#customEditor.hidden = false;
  }

  hideCustomEditor(): void {
    if (this.#customEditor) this.#customEditor.hidden = true;
  }

  #customEditor: HTMLElement | null = null;
  #customInputs = new Map<"focusMin" | "restMin", HTMLInputElement>();
  #custom = { focusMin: 25, restMin: 5 };
}
