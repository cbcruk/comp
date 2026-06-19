import { describe, expect, it } from "vitest";
import { applyPatch } from "./row-patch.js";

describe("applyPatch", () => {
  const rows = [
    { id: 1, t: "a" },
    { id: 2, t: "b" },
  ];

  it("merges into matching rows without mutating", () => {
    const next = applyPatch(rows, (r) => r.id === 1, { t: "z" });
    expect(next).toEqual([
      { id: 1, t: "z" },
      { id: 2, t: "b" },
    ]);
    expect(rows[0]).toEqual({ id: 1, t: "a" });
  });

  it("leaves rows unchanged when nothing matches", () => {
    expect(applyPatch(rows, () => false, { t: "z" })).toEqual(rows);
  });
});
