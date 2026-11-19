import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

const { forgetRoom, recentRooms, rememberRoom } = await import("./identity");

describe("guest recent rooms", () => {
  beforeEach(() => store.clear());

  it("keeps only the last 3 rooms, newest first", () => {
    for (const c of ["AAAAA1", "AAAAA2", "AAAAA3", "AAAAA4"]) rememberRoom(c, c);
    expect(recentRooms().map((r) => r.code)).toEqual(["AAAAA4", "AAAAA3", "AAAAA2"]);
  });

  it("drops rooms older than 30 days and can forget one", () => {
    const now = Date.now();
    store.set("huddle.recent", JSON.stringify([
      { code: "NEW001", title: "new", at: now - 1000 },
      { code: "OLD001", title: "old", at: now - 31 * 86_400_000 },
    ]));
    expect(recentRooms(now).map((r) => r.code)).toEqual(["NEW001"]);
    forgetRoom("NEW001");
    expect(recentRooms(now)).toEqual([]);
  });
});
