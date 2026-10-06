/**
 * 持久化适配层：以「可注入的存储后端」隔离 localStorage，
 * 单元测试可注入内存实现；数据带 schema 版本号，未来字段演进时可安全失效旧数据。
 */
export interface StorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const APP_STORAGE_KEY = "soundisle:v1";

export class PersistentStore {
  constructor(private backend: StorageBackend, private key = APP_STORAGE_KEY) {}

  load<T>(fallback: T): T {
    try {
      const raw = this.backend.getItem(this.key);
      if (!raw) return fallback;
      const parsed: unknown = JSON.parse(raw);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return fallback;
      return { ...fallback, ...(parsed as object) } as T;
    } catch {
      return fallback;
    }
  }

  save<T>(value: T): void {
    try {
      this.backend.setItem(this.key, JSON.stringify(value));
    } catch {
      // 配额满或隐私模式下静默降级：应用仍可运行，只是不记忆状态
    }
  }
}

export const localStorageBackend: StorageBackend = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
};

export function createMemoryBackend(): StorageBackend {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
  };
}
