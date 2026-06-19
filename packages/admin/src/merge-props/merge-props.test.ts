import { describe, expect, it, vi } from "vitest";
import { mergeProps } from "./merge-props.js";

describe("mergeProps", () => {
  it("concatenates className", () => {
    expect(mergeProps({ className: "a" }, { className: "b" }).className).toBe("a b");
    expect(mergeProps({ className: "a" }, {}).className).toBe("a");
    expect(mergeProps({}, {}).className).toBeUndefined();
  });

  it("shallow-merges style with later keys winning", () => {
    expect(
      mergeProps(
        { style: { color: "red", margin: 1 } },
        { style: { color: "blue" } },
      ).style,
    ).toEqual({ color: "blue", margin: 1 });
  });

  it("chains on* handlers in order", () => {
    const calls: string[] = [];
    const merged = mergeProps(
      { onClick: () => calls.push("internal") },
      { onClick: () => calls.push("external") },
    );
    (merged.onClick as () => void)();
    expect(calls).toEqual(["internal", "external"]);
  });

  it("overrides other props with the later value, ignoring undefined", () => {
    expect(mergeProps({ id: "x" }, { id: "y" }).id).toBe("y");
    expect(mergeProps({ id: "x" }, { id: undefined }).id).toBe("x");
  });

  it("skips nullish sources", () => {
    const fn = vi.fn();
    expect(mergeProps({ id: "x" }, undefined, { onClick: fn }).id).toBe("x");
  });
});
