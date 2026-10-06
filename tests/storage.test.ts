import { describe, expect, it } from "vitest";
import { createMemoryBackend, PersistentStore } from "../src/state/storage.js";

describe("PersistentStore", () => {
  it("无数据时返回 fallback", () => {
    const store = new PersistentStore(createMemoryBackend());
    expect(store.load({ a: 1 })).toEqual({ a: 1 });
  });

  it("save → load 往返一致", () => {
    const store = new PersistentStore(createMemoryBackend());
    store.save({ theme: "light", volume: 0.5 });
    expect(store.load({ theme: "dark", volume: 1 })).toEqual({ theme: "light", volume: 0.5 });
  });

  it("部分保存：与 fallback 深合并（浅层）", () => {
    const store = new PersistentStore(createMemoryBackend());
    store.save({ theme: "light" });
    expect(store.load({ theme: "dark", modeId: "pomodoro" })).toEqual({ theme: "light", modeId: "pomodoro" });
  });

  it("损坏的 JSON 安全回退", () => {
    const backend = createMemoryBackend();
    backend.setItem("k", "{not json");
    const store = new PersistentStore(backend, "k");
    expect(store.load({ ok: true })).toEqual({ ok: true });
  });

  it("非对象 JSON（数字/字符串/null）安全回退", () => {
    for (const bad of ["42", '"text"', "null", "[]"]) {
      const backend = createMemoryBackend();
      backend.setItem("k", bad);
      const store = new PersistentStore(backend, "k");
      expect(store.load({ ok: true })).toEqual({ ok: true });
    }
  });

  it("数组也被视为非法载荷回退（避免结构混淆）", () => {
    const backend = createMemoryBackend();
    backend.setItem("k", "[1,2]");
    const store = new PersistentStore(backend, "k");
    expect(store.load({ ok: true })).toEqual({ ok: true });
  });
});
