import type { FieldMap, FieldMeta } from "@comp/core";
import { describe, expect, it } from "vitest";
import { canEditColumn, isEditing } from "./inline-edit.js";

const fields = {
  id: { name: "id", primaryKey: true } as FieldMeta,
  title: { name: "title", primaryKey: false } as FieldMeta,
} as unknown as FieldMap;

describe("isEditing", () => {
  it("matches only the active cell", () => {
    expect(isEditing(null, "1", "title")).toBe(false);
    expect(isEditing({ id: "1", field: "title" }, "1", "title")).toBe(true);
    expect(isEditing({ id: "1", field: "title" }, "2", "title")).toBe(false);
    expect(isEditing({ id: "1", field: "title" }, "1", "body")).toBe(false);
  });
});

describe("canEditColumn", () => {
  it("allows known non-pk columns only", () => {
    expect(canEditColumn(fields, "id", "title")).toBe(true);
    expect(canEditColumn(fields, "id", "id")).toBe(false);
    expect(canEditColumn(fields, "id", "missing")).toBe(false);
  });
});
