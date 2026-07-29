import type { FieldMap } from "@comp/core";
import { describe, expect, it } from "vitest";
import {
  addInlineRow,
  inlineRowsFrom,
  hasInlineChanges,
  inlineFields,
  removeInlineRow,
  restoreInlineRow,
  setInlineValue,
  toInlineWrite,
} from "./inline-rows.js";

const fields: FieldMap = {
  id: {
    name: "id",
    columnName: "id",
    dataType: "number",
    columnType: "SQLiteInteger",
    notNull: true,
    hasDefault: true,
    primaryKey: true,
  },
  orderId: {
    name: "orderId",
    columnName: "order_id",
    dataType: "number",
    columnType: "SQLiteInteger",
    notNull: true,
    hasDefault: false,
    primaryKey: false,
    relation: { table: "orders", column: "id" },
  },
  product: {
    name: "product",
    columnName: "product",
    dataType: "string",
    columnType: "SQLiteText",
    notNull: true,
    hasDefault: false,
    primaryKey: false,
  },
  quantity: {
    name: "quantity",
    columnName: "quantity",
    dataType: "number",
    columnType: "SQLiteInteger",
    notNull: true,
    hasDefault: true,
    primaryKey: false,
  },
};

const rows = [
  { id: 1, orderId: 7, product: "Cup", quantity: 2 },
  { id: 2, orderId: 7, product: "Plate", quantity: 1 },
];

const seed = (): ReturnType<typeof inlineRowsFrom> =>
  inlineRowsFrom(rows, fields, "id", "orderId");
const write = (state: ReturnType<typeof inlineRowsFrom>): ReturnType<typeof toInlineWrite> =>
  toInlineWrite(state, fields, "id", "orderId");

describe("inlineFields", () => {
  it("hides the key and the parent link", () => {
    expect(inlineFields(fields, "id", "orderId").map((f) => f.name)).toEqual([
      "product",
      "quantity",
    ]);
  });
});

describe("inlineRowsFrom", () => {
  it("seeds string values per editable field", () => {
    const state = seed();
    expect(state[0]?.values).toEqual({ product: "Cup", quantity: "2" });
    expect(state[0]?.id).toBe(1);
    expect(state[0]?.dirty).toBe(false);
  });
});

describe("editing", () => {
  it("sends nothing when nothing changed", () => {
    expect(write(seed())).toEqual({});
    expect(hasInlineChanges(write(seed()))).toBe(false);
  });

  it("updates only the rows that were touched", () => {
    const state = setInlineValue(seed(), "saved-1", "quantity", "5");
    expect(write(state)).toEqual({
      update: [{ id: 1, values: { product: "Cup", quantity: 5 } }],
    });
  });

  it("creates added rows with values coerced to the API's types", () => {
    const state = setInlineValue(
      setInlineValue(addInlineRow(seed(), "new-1", fields, "id", "orderId"), "new-1", "product", "Bowl"),
      "new-1",
      "quantity",
      "3",
    );
    expect(write(state).create).toEqual([{ product: "Bowl", quantity: 3 }]);
  });

  it("drops an added row outright but flags a stored one for deletion", () => {
    const added = addInlineRow(seed(), "new-1", fields, "id", "orderId");
    expect(removeInlineRow(added, "new-1")).toHaveLength(2);

    const state = removeInlineRow(seed(), "saved-2");
    expect(state).toHaveLength(2);
    expect(state[1]?.deleted).toBe(true);
    expect(write(state)).toEqual({ delete: [2] });
  });

  it("lets a pending deletion be taken back", () => {
    const state = restoreInlineRow(removeInlineRow(seed(), "saved-2"), "saved-2");
    expect(write(state)).toEqual({});
  });

  it("never both updates and deletes the same row", () => {
    const state = removeInlineRow(setInlineValue(seed(), "saved-1", "product", "Mug"), "saved-1");
    const result = write(state);
    expect(result.update).toBeUndefined();
    expect(result.delete).toEqual([1]);
  });

  it("combines every kind of change in one write", () => {
    let state = setInlineValue(seed(), "saved-1", "quantity", "9");
    state = removeInlineRow(state, "saved-2");
    state = addInlineRow(state, "new-1", fields, "id", "orderId");
    state = setInlineValue(state, "new-1", "product", "Bowl");

    const result = write(state);
    expect(result.update).toHaveLength(1);
    expect(result.delete).toEqual([2]);
    expect(result.create).toHaveLength(1);
    expect(hasInlineChanges(result)).toBe(true);
  });
});
