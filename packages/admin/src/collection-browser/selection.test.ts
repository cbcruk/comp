import { describe, expect, it } from "vitest";
import {
  allSelected,
  rowId,
  toggle,
  toggleAll,
} from "./selection.js";

const rows = [{ id: 1, t: "a" }, { id: 2, t: "b" }, { id: 3, t: "c" }];

describe("rowId", () => {
  it("stringifies the primary key value", () => {
    expect(rowId({ id: 7 }, "id")).toBe("7");
    expect(rowId({ id: null }, "id")).toBeNull();
    expect(rowId({ id: 1 }, null)).toBeNull();
  });
});

describe("toggle", () => {
  it("adds then removes without mutating the input", () => {
    const a = new Set<string>();
    const b = toggle(a, "1");
    expect(a.size).toBe(0);
    expect([...b]).toEqual(["1"]);
    expect([...toggle(b, "1")]).toEqual([]);
  });
});

describe("allSelected / toggleAll", () => {
  it("detects when every visible row is selected", () => {
    expect(allSelected(rows, "id", new Set(["1", "2"]))).toBe(false);
    expect(allSelected(rows, "id", new Set(["1", "2", "3"]))).toBe(true);
    expect(allSelected([], "id", new Set())).toBe(false);
  });

  it("selects all, then clears when all are already selected", () => {
    const all = toggleAll(rows, "id", new Set());
    expect([...all].sort()).toEqual(["1", "2", "3"]);
    expect([...toggleAll(rows, "id", all)]).toEqual([]);
  });
});
