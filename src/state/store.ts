export type Listener<T> = (state: T) => void;

/**
 * 极简发布/订阅 store：`set` 合并部分状态并广播，`update` 允许基于旧值派生新状态。
 * 纯同步、无依赖，UI 组件按需订阅。
 */
export class Store<T extends object> {
  #state: T;
  #listeners = new Set<Listener<T>>();

  constructor(initial: T) {
    this.#state = initial;
  }

  get state(): Readonly<T> {
    return this.#state;
  }

  set(patch: Partial<T>): void {
    this.#state = { ...this.#state, ...patch };
    this.#emit();
  }

  update(fn: (state: T) => Partial<T>): void {
    this.set(fn(this.#state));
  }

  subscribe(listener: Listener<T>): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  #emit(): void {
    for (const listener of this.#listeners) listener(this.#state);
  }
}
