import { describe, expect, it } from "vitest";
import { buildLabelMap, resolveLabel } from "./reference-labels.js";

const rows = [
  { id: 1, name: "Ada" },
  { id: 2, name: "Linus" },
  { id: 3, name: null },
];

describe("buildLabelMap", () => {
  it("maps value to label, falling back the label to the value", () => {
    const map = buildLabelMap(rows, "id", "name");
    expect(map.get("1")).toBe("Ada");
    expect(map.get("3")).toBe("3");
  });
});

describe("resolveLabel", () => {
  const maps = { authorId: buildLabelMap(rows, "id", "name") };

  it("resolves a known value", () => {
    expect(resolveLabel(maps, "authorId", 2, "2")).toBe("Linus");
  });

  it("uses the fallback for unknown values or unmapped columns", () => {
    expect(resolveLabel(maps, "authorId", 99, "99")).toBe("99");
    expect(resolveLabel(maps, "status", "draft", "draft")).toBe("draft");
    expect(resolveLabel(maps, "authorId", null, "")).toBe("");
  });
});
