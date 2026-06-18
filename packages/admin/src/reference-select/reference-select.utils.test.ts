import { describe, expect, it } from "vitest";
import { toOptions } from "./reference-select.utils.js";

describe("toOptions", () => {
  it("maps rows to value/label by field", () => {
    const rows = [
      { id: 1, name: "Ada" },
      { id: 2, name: "Linus" },
    ];
    expect(toOptions(rows, "id", "name")).toEqual([
      { value: "1", label: "Ada" },
      { value: "2", label: "Linus" },
    ]);
  });

  it("skips rows missing the value field and falls back the label", () => {
    const rows = [{ id: null, name: "x" }, { id: 3, name: null }];
    expect(toOptions(rows, "id", "name")).toEqual([{ value: "3", label: "3" }]);
  });
});
