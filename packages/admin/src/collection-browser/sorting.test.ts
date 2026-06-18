import { describe, expect, it } from "vitest";
import { nextSort, parseSort } from "./sorting.js";

describe("parseSort", () => {
  it("parses field and direction", () => {
    expect(parseSort("title:desc")).toEqual({ field: "title", direction: "desc" });
    expect(parseSort("title")).toEqual({ field: "title", direction: "asc" });
    expect(parseSort(undefined)).toBeNull();
    expect(parseSort("")).toBeNull();
  });
});

describe("nextSort", () => {
  it("cycles none → asc → desc → none on the same column", () => {
    expect(nextSort(undefined, "title")).toBe("title:asc");
    expect(nextSort("title:asc", "title")).toBe("title:desc");
    expect(nextSort("title:desc", "title")).toBeUndefined();
  });

  it("starts a fresh asc when switching columns", () => {
    expect(nextSort("title:desc", "status")).toBe("status:asc");
  });
});
