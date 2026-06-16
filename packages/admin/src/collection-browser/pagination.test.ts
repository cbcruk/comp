import { describe, expect, it } from "vitest";
import {
  clampPage,
  hasNextPage,
  hasPrevPage,
  pageCount,
} from "./pagination.js";

describe("pageCount", () => {
  it("rounds up and never drops below one", () => {
    expect(pageCount(0, 25)).toBe(1);
    expect(pageCount(25, 25)).toBe(1);
    expect(pageCount(26, 25)).toBe(2);
    expect(pageCount(100, 0)).toBe(1);
  });
});

describe("hasPrevPage / hasNextPage", () => {
  it("knows the edges of the range", () => {
    expect(hasPrevPage(1)).toBe(false);
    expect(hasPrevPage(2)).toBe(true);
    expect(hasNextPage(1, 30, 25)).toBe(true);
    expect(hasNextPage(2, 30, 25)).toBe(false);
  });
});

describe("clampPage", () => {
  it("keeps the page within range", () => {
    expect(clampPage(0, 100, 25)).toBe(1);
    expect(clampPage(99, 100, 25)).toBe(4);
    expect(clampPage(3, 100, 25)).toBe(3);
  });
});
