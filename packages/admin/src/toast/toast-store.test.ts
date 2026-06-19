import { describe, expect, it } from "vitest";
import { toastReducer, type Toast } from "./toast-store.js";

const a: Toast = { id: 1, kind: "success", message: "Saved" };
const b: Toast = { id: 2, kind: "error", message: "Failed" };

describe("toastReducer", () => {
  it("appends on add", () => {
    const state = toastReducer([a], { type: "add", toast: b });
    expect(state).toEqual([a, b]);
  });

  it("removes by id on dismiss", () => {
    expect(toastReducer([a, b], { type: "dismiss", id: 1 })).toEqual([b]);
  });

  it("is a no-op dismissing an unknown id", () => {
    expect(toastReducer([a], { type: "dismiss", id: 99 })).toEqual([a]);
  });
});
